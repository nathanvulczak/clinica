"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DEFAULT_REQUIRED_MEDICAL_RECORD_FIELDS,
  isMedicalRecordFieldKey,
  medicalRecordFieldLabels,
} from "@/features/medical-records/config";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClinicalWorkflowAccess } from "@/repositories/clinical-workflow";
import { logAuditEvent } from "@/services/audit/audit-service";

export type MedicalRecordActionState = {
  error?: string;
  success?: string;
  redirectTo?: string;
};

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || null);

const recordSchema = z.object({
  encounter_id: z.string().uuid(),
  mode: z.enum(["draft", "complete"]),
  chief_complaint: optionalText(2000),
  history: optionalText(5000),
  physical_exam: optionalText(5000),
  assessment: optionalText(5000),
  diagnosis: optionalText(2000),
  cid10: z
    .string()
    .trim()
    .max(12)
    .optional()
    .transform((value) => value?.toUpperCase() || null),
  plan: optionalText(5000),
  patient_guidance: optionalText(5000),
  follow_up_required: z.boolean(),
  follow_up_notes: optionalText(2000),
  correction_reason: optionalText(800),
  prescription_id: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  prescription_template_key: optionalText(80),
  prescription_title: optionalText(180),
  prescription_content: optionalText(8000),
});

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

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

async function getPreferencesForAction(clinicId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("medical_record_preferences")
    .select("required_fields, allow_completed_corrections, require_correction_reason")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle<{
      required_fields: string[] | null;
      allow_completed_corrections: boolean | null;
      require_correction_reason: boolean | null;
    }>();

  const requiredFields = (data?.required_fields ?? DEFAULT_REQUIRED_MEDICAL_RECORD_FIELDS).filter(
    isMedicalRecordFieldKey,
  );

  return {
    requiredFields: requiredFields.length ? requiredFields : DEFAULT_REQUIRED_MEDICAL_RECORD_FIELDS,
    allowCompletedCorrections: data?.allow_completed_corrections ?? true,
    requireCorrectionReason: data?.require_correction_reason ?? true,
  };
}

async function transitionEncounter(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  encounterId: string,
  targetStatus: "consultation_in_progress" | "consultation_completed",
  reason: string | null,
) {
  return supabase.rpc("transition_clinical_encounter", {
    encounter_uuid: encounterId,
    target_status: targetStatus,
    transition_reason: reason,
  });
}

function revalidateMedicalRecord(encounterId: string) {
  revalidatePath("/atendimentos");
  revalidatePath("/prontuarios");
  revalidatePath(`/prontuarios/${encounterId}`);
  revalidatePath("/auditoria");
}

export async function saveMedicalRecordAction(
  _state: MedicalRecordActionState,
  formData: FormData,
): Promise<MedicalRecordActionState> {
  const formString = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : undefined;
  };

  const parsed = recordSchema.safeParse({
    encounter_id: formString("encounter_id"),
    mode: formString("mode"),
    chief_complaint: formString("chief_complaint"),
    history: formString("history"),
    physical_exam: formString("physical_exam"),
    assessment: formString("assessment"),
    diagnosis: formString("diagnosis"),
    cid10: formString("cid10"),
    plan: formString("plan"),
    patient_guidance: formString("patient_guidance"),
    follow_up_required: formData.get("follow_up_required") === "on",
    follow_up_notes: formString("follow_up_notes"),
    correction_reason: formString("correction_reason"),
    prescription_id: formString("prescription_id"),
    prescription_template_key: formString("prescription_template_key"),
    prescription_title: formString("prescription_title"),
    prescription_content: formString("prescription_content"),
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Revise os campos do prontuario. Algum dado esta ausente ou fora do formato esperado.",
    };
  }

  const context = await getContext();
  if (!context) return { error: "Selecione uma clinica e autentique-se novamente." };
  if (!context.access.canViewOwn && !context.access.canViewAll) {
    await logAuditEvent({
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      actionType: "access_denied",
      module: "medical_records",
      recordTable: "medical_records",
      recordId: parsed.data.encounter_id,
      level: "security",
      notes: "Tentativa de acessar prontuario sem permissao assistencial.",
    });
    return { error: "Seu perfil nao possui permissao para acessar prontuarios." };
  }

  const preferences = await getPreferencesForAction(context.activeClinic.id);
  if (parsed.data.mode === "complete") {
    const missingFields = preferences.requiredFields.filter((field) => !hasValue(parsed.data[field]));
    if (missingFields.length) {
      return {
        error: `Preencha os campos obrigatorios: ${missingFields
          .map((field) => medicalRecordFieldLabels[field])
          .join(", ")}.`,
      };
    }
  }

  const admin = createSupabaseAdminClient();
  const { data: encounter } = await admin
    .from("clinical_encounters")
    .select("id, clinic_id, appointment_id, patient_id, professional_member_id, status")
    .eq("id", parsed.data.encounter_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      clinic_id: string;
      appointment_id: string;
      patient_id: string;
      professional_member_id: string;
      status: string;
    }>();

  if (!encounter) return { error: "Atendimento nao encontrado na clinica ativa." };
  if (!context.access.canViewAll && encounter.professional_member_id !== context.access.currentMemberId) {
    await logAuditEvent({
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      actionType: "access_denied",
      module: "medical_records",
      recordTable: "clinical_encounters",
      recordId: encounter.id,
      level: "security",
      notes: "Tentativa de acessar prontuario de paciente de outro profissional.",
    });
    return { error: "Este prontuario nao esta vinculado ao seu atendimento." };
  }

  if (!["ready_for_consultation", "consultation_in_progress", "consultation_completed"].includes(encounter.status)) {
    return { error: "O prontuario sera liberado apos a chegada e encaminhamento assistencial do paciente." };
  }

  const { data: previous } = await admin
    .from("medical_records")
    .select("*")
    .eq("encounter_id", encounter.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (previous?.status === "completed" && !preferences.allowCompletedCorrections) {
    return { error: "A clinica bloqueou correcoes em prontuarios concluidos." };
  }

  if (
    previous?.status === "completed" &&
    preferences.requireCorrectionReason &&
    !parsed.data.correction_reason
  ) {
    return { error: "Informe o motivo para corrigir um prontuario ja concluido." };
  }

  if (encounter.status === "ready_for_consultation") {
    const { error } = await transitionEncounter(
      context.supabase,
      encounter.id,
      "consultation_in_progress",
      "Atendimento iniciado pelo prontuario.",
    );
    if (error) return { error: "Nao foi possivel iniciar o atendimento. Atualize a fila e tente novamente." };
  }

  const payload = {
    clinic_id: encounter.clinic_id,
    encounter_id: encounter.id,
    appointment_id: encounter.appointment_id,
    patient_id: encounter.patient_id,
    professional_member_id: encounter.professional_member_id,
    performed_by: context.user.id,
    status:
      previous?.status === "completed" && parsed.data.mode === "draft"
        ? "corrected"
        : parsed.data.mode === "complete"
          ? "completed"
          : "draft",
    chief_complaint: parsed.data.chief_complaint,
    history: parsed.data.history,
    physical_exam: parsed.data.physical_exam,
    assessment: parsed.data.assessment,
    diagnosis: parsed.data.diagnosis,
    cid10: parsed.data.cid10,
    plan: parsed.data.plan,
    patient_guidance: parsed.data.patient_guidance,
    follow_up_required: parsed.data.follow_up_required,
    follow_up_notes: parsed.data.follow_up_notes,
    correction_reason: parsed.data.correction_reason,
    completed_at: parsed.data.mode === "complete" ? new Date().toISOString() : previous?.completed_at,
    created_by: previous?.created_by ?? context.user.id,
    updated_by: context.user.id,
  };

  const { data: saved, error } = await admin
    .from("medical_records")
    .upsert(payload, { onConflict: "encounter_id" })
    .select("id")
    .single<{ id: string }>();

  if (error) return { error: "Nao foi possivel salvar o prontuario." };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType:
      parsed.data.mode === "complete"
        ? "medical_record_completed"
        : previous
          ? "medical_record_updated"
          : "medical_record_created",
    module: "medical_records",
    recordTable: "medical_records",
    recordId: saved.id,
    oldValues: previous,
    newValues: payload,
    level: parsed.data.mode === "complete" ? "security" : "info",
    notes: "Prontuario registrado com rastreabilidade do atendimento.",
  });

  if (parsed.data.prescription_title && parsed.data.prescription_content) {
    const prescriptionPayload = {
      clinic_id: encounter.clinic_id,
      medical_record_id: saved.id,
      encounter_id: encounter.id,
      patient_id: encounter.patient_id,
      professional_member_id: encounter.professional_member_id,
      template_key: parsed.data.prescription_template_key,
      title: parsed.data.prescription_title,
      content: parsed.data.prescription_content,
      status: parsed.data.mode === "complete" ? "issued" : "draft",
      issued_at: parsed.data.mode === "complete" ? new Date().toISOString() : null,
      updated_by: context.user.id,
      created_by: context.user.id,
    };

    const upsertPayload = parsed.data.prescription_id
      ? { ...prescriptionPayload, id: parsed.data.prescription_id }
      : prescriptionPayload;

    const { data: prescription, error: prescriptionError } = await admin
      .from("medical_prescriptions")
      .upsert(upsertPayload)
      .select("id")
      .single<{ id: string }>();

    if (prescriptionError) {
      return { error: "Prontuario salvo, mas nao foi possivel salvar a prescricao." };
    }

    await logAuditEvent({
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      actionType: parsed.data.prescription_id ? "prescription_updated" : "prescription_created",
      module: "medical_records",
      recordTable: "medical_prescriptions",
      recordId: prescription.id,
      newValues: prescriptionPayload,
      level: "security",
      notes: "Prescricao vinculada ao prontuario.",
    });
  }

  if (parsed.data.mode === "complete") {
    const { error: transitionError } = await transitionEncounter(
      context.supabase,
      encounter.id,
      "consultation_completed",
      parsed.data.follow_up_notes,
    );

    if (transitionError) {
      return {
        error:
          "Prontuario salvo, mas nao foi possivel concluir o atendimento. Revise a fila de Atendimentos.",
      };
    }
  }

  revalidateMedicalRecord(encounter.id);
  return {
    success:
      parsed.data.mode === "complete"
        ? "Prontuario concluido e atendimento encerrado."
        : "Prontuario salvo.",
    redirectTo: parsed.data.mode === "complete" ? "/atendimentos" : undefined,
  };
}
