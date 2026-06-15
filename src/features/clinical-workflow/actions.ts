"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClinicalWorkflowAccess } from "@/repositories/clinical-workflow";
import { logAuditEvent } from "@/services/audit/audit-service";
import type { ClinicalEncounterStatus } from "@/types/domain";

export type ClinicalWorkflowActionState = {
  error?: string;
  success?: string;
};

const routeSchema = z.object({
  encounter_id: z.string().uuid(),
  requires_preconsultation: z.enum(["true", "false"]).transform((value) => value === "true"),
  reason: z.string().trim().max(500).optional().transform((value) => value || null),
});

const encounterSchema = z.object({
  encounter_id: z.string().uuid(),
  reason: z.string().trim().max(500).optional().transform((value) => value || null),
});

function workflowError(message?: string) {
  const normalized = message?.toLowerCase() ?? "";

  if (normalized.includes("permission") || normalized.includes("permiss")) {
    return "Seu perfil não possui permissão para esta etapa.";
  }

  if (normalized.includes("transi") || normalized.includes("encaminhamento")) {
    return message ?? "Esta mudança não é permitida no momento.";
  }

  return "Não foi possível atualizar o fluxo assistencial.";
}

async function getContext() {
  const [{ activeClinic }, supabase] = await Promise.all([
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!activeClinic || !user) return null;

  return {
    activeClinic,
    user,
    supabase,
    access: await getClinicalWorkflowAccess(activeClinic.id),
  };
}

function revalidateClinicalWorkflow() {
  revalidatePath("/agenda");
  revalidatePath("/atendimentos");
  revalidatePath("/enfermagem");
  revalidatePath("/auditoria");
}

export async function routeClinicalEncounterAction(
  _state: ClinicalWorkflowActionState,
  formData: FormData,
): Promise<ClinicalWorkflowActionState> {
  const parsed = routeSchema.safeParse({
    encounter_id: formData.get("encounter_id"),
    requires_preconsultation: formData.get("requires_preconsultation"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Dados de encaminhamento inválidos." };

  const context = await getContext();
  if (!context) return { error: "Selecione uma clínica e autentique-se novamente." };
  if (!context.access.canRoute) {
    await logAuditEvent({
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      actionType: "access_denied",
      module: "medical_records",
      recordTable: "clinical_encounters",
      recordId: parsed.data.encounter_id,
      level: "security",
      notes: "Tentativa negada de definir encaminhamento assistencial.",
    });
    return { error: "Seu perfil não pode definir este fluxo." };
  }

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("clinical_encounters")
    .select("status, preconsultation_required, routing_source, routing_reason")
    .eq("id", parsed.data.encounter_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!previous) return { error: "Atendimento não encontrado na clínica ativa." };

  const { data, error } = await context.supabase.rpc("route_clinical_encounter", {
    encounter_uuid: parsed.data.encounter_id,
    requires_preconsultation: parsed.data.requires_preconsultation,
    route_reason: parsed.data.reason,
  });
  if (error) {
    if (/permission|permiss/i.test(error.message)) {
      await logAuditEvent({
        clinicId: context.activeClinic.id,
        userId: context.user.id,
        actionType: "access_denied",
        module: "medical_records",
        recordTable: "clinical_encounters",
        recordId: parsed.data.encounter_id,
        level: "security",
        notes: "Banco recusou a alteração do encaminhamento assistencial.",
      });
    }
    return { error: workflowError(error.message) };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.reason ? "clinical_route_corrected" : "clinical_route_decided",
    module: "medical_records",
    recordTable: "clinical_encounters",
    recordId: parsed.data.encounter_id,
    oldValues: previous,
    newValues: {
      requires_preconsultation: parsed.data.requires_preconsultation,
      reason: parsed.data.reason,
      status: (data as { status?: string } | null)?.status,
    },
    level: "security",
    notes: "Encaminhamento assistencial definido com rastreabilidade.",
  });

  revalidateClinicalWorkflow();
  return {
    success: parsed.data.requires_preconsultation
      ? "Paciente encaminhado para a enfermagem."
      : "Paciente liberado para atendimento.",
  };
}

async function transitionClinicalEncounter(
  _state: ClinicalWorkflowActionState,
  formData: FormData,
  targetStatus:
    | "triage_in_progress"
    | "ready_for_consultation"
    | "consultation_in_progress"
    | "consultation_completed",
): Promise<ClinicalWorkflowActionState> {
  const parsed = encounterSchema.safeParse({
    encounter_id: formData.get("encounter_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: "Atendimento não identificado. Atualize a página e tente novamente." };
  }

  const context = await getContext();
  if (!context) return { error: "Selecione uma clínica e autentique-se novamente." };

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("clinical_encounters")
    .select("status, triage_started_at, triage_completed_at, consultation_started_at, consultation_completed_at")
    .eq("id", parsed.data.encounter_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!previous) return { error: "Atendimento não encontrado na clínica ativa." };

  const { data, error } = await context.supabase.rpc("transition_clinical_encounter", {
    encounter_uuid: parsed.data.encounter_id,
    target_status: targetStatus,
    transition_reason: parsed.data.reason,
  });
  if (error) {
    if (/permission|permiss|somente o profissional/i.test(error.message)) {
      await logAuditEvent({
        clinicId: context.activeClinic.id,
        userId: context.user.id,
        actionType: "access_denied",
        module:
          targetStatus === "triage_in_progress" ||
          targetStatus === "ready_for_consultation"
            ? "nursing"
            : "medical_records",
        recordTable: "clinical_encounters",
        recordId: parsed.data.encounter_id,
        level: "security",
        notes: "Tentativa negada de avançar uma etapa assistencial.",
      });
    }
    return { error: workflowError(error.message) };
  }

  const labels: Record<ClinicalEncounterStatus, string> = {
    awaiting_preconsultation_decision: "Definição pendente",
    waiting_triage: "Aguardando pré-consulta",
    triage_in_progress: "Pré-consulta iniciada",
    ready_for_consultation: "Paciente liberado para atendimento",
    consultation_in_progress: "Atendimento iniciado",
    consultation_completed: "Atendimento concluído",
    billing_pending: "Liberado para cobrança",
    billed: "Cobrança concluída",
    cancelled: "Atendimento cancelado",
  };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "clinical_workflow_transitioned",
    module:
      targetStatus === "triage_in_progress" ||
      targetStatus === "ready_for_consultation"
        ? "nursing"
        : "medical_records",
    recordTable: "clinical_encounters",
    recordId: parsed.data.encounter_id,
    oldValues: previous,
    newValues: {
      status: targetStatus,
      reason: parsed.data.reason,
      persisted_status: (data as { status?: string } | null)?.status,
    },
    level: "security",
    notes: labels[targetStatus],
  });

  revalidateClinicalWorkflow();
  return { success: labels[targetStatus] };
}

export async function startPreconsultationAction(
  state: ClinicalWorkflowActionState,
  formData: FormData,
) {
  return transitionClinicalEncounter(state, formData, "triage_in_progress");
}

export async function completePreconsultationAction(
  state: ClinicalWorkflowActionState,
  formData: FormData,
) {
  return transitionClinicalEncounter(state, formData, "ready_for_consultation");
}

export async function startConsultationAction(
  state: ClinicalWorkflowActionState,
  formData: FormData,
) {
  return transitionClinicalEncounter(state, formData, "consultation_in_progress");
}

export async function completeConsultationAction(
  state: ClinicalWorkflowActionState,
  formData: FormData,
) {
  return transitionClinicalEncounter(state, formData, "consultation_completed");
}
