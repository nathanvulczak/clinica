"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DEFAULT_REQUIRED_NURSING_FIELDS,
  isNursingFieldKey,
  nursingFieldLabels,
} from "@/features/nursing/config";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClinicalWorkflowAccess } from "@/repositories/clinical-workflow";
import { logAuditEvent } from "@/services/audit/audit-service";

export type NursingActionState = {
  error?: string;
  success?: string;
};

const numericOptional = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value.replace(",", ".")) : null))
    .refine((value) => value === null || (!Number.isNaN(value) && value >= min && value <= max), {
      message: `${label} fora da faixa esperada.`,
    });

const integerOptional = (min: number, max: number, label: string) =>
  numericOptional(min, max, label).transform((value) => (value === null ? null : Math.round(value)));

const assessmentSchema = z.object({
  encounter_id: z.string().uuid(),
  mode: z.enum(["draft", "complete"]),
  chief_complaint: z.string().trim().max(2000).optional().transform((value) => value || null),
  current_medications: z.string().trim().max(2000).optional().transform((value) => value || null),
  allergies: z.string().trim().max(2000).optional().transform((value) => value || null),
  comorbidities: z.string().trim().max(2000).optional().transform((value) => value || null),
  pain_score: integerOptional(0, 10, "Escala de dor"),
  pain_location: z.string().trim().max(500).optional().transform((value) => value || null),
  systolic_bp: integerOptional(40, 260, "Pressão sistólica"),
  diastolic_bp: integerOptional(20, 180, "Pressão diastólica"),
  heart_rate: integerOptional(20, 240, "Frequência cardíaca"),
  respiratory_rate: integerOptional(5, 80, "Frequência respiratória"),
  temperature_c: numericOptional(30, 45, "Temperatura"),
  oxygen_saturation: integerOptional(50, 100, "Saturação"),
  capillary_glucose: integerOptional(20, 600, "Glicemia capilar"),
  weight_kg: numericOptional(0, 500, "Peso"),
  height_cm: numericOptional(20, 260, "Altura"),
  risk_level: z.enum(["routine", "attention", "urgent"]),
  nursing_notes: z.string().trim().max(4000).optional().transform((value) => value || null),
  recommendations: z.string().trim().max(3000).optional().transform((value) => value || null),
  correction_reason: z.string().trim().max(500).optional().transform((value) => value || null),
});

const preferencesSchema = z.object({
  required_fields: z
    .array(z.string())
    .transform((values) => values.filter(isNursingFieldKey)),
  allow_completed_corrections: z.boolean(),
  require_correction_reason: z.boolean(),
  show_required_field_alerts: z.boolean(),
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

function bmi(weightKg: number | null, heightCm: number | null) {
  if (!weightKg || !heightCm) return null;
  const heightMeters = heightCm / 100;
  return Number((weightKg / (heightMeters * heightMeters)).toFixed(2));
}

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

async function getPreferencesForAction(clinicId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("nursing_preferences")
    .select("required_fields, allow_completed_corrections, require_correction_reason")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle<{
      required_fields: string[] | null;
      allow_completed_corrections: boolean | null;
      require_correction_reason: boolean | null;
    }>();

  const requiredFields = (data?.required_fields ?? DEFAULT_REQUIRED_NURSING_FIELDS).filter(
    isNursingFieldKey,
  );

  return {
    requiredFields: requiredFields.length ? requiredFields : DEFAULT_REQUIRED_NURSING_FIELDS,
    allowCompletedCorrections: data?.allow_completed_corrections ?? true,
    requireCorrectionReason: data?.require_correction_reason ?? true,
  };
}

async function transitionEncounter(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  encounterId: string,
  targetStatus: "triage_in_progress" | "ready_for_consultation",
  reason: string | null,
) {
  return supabase.rpc("transition_clinical_encounter", {
    encounter_uuid: encounterId,
    target_status: targetStatus,
    transition_reason: reason,
  });
}

export async function saveNursingAssessmentAction(
  _state: NursingActionState,
  formData: FormData,
): Promise<NursingActionState> {
  const parsed = assessmentSchema.safeParse({
    encounter_id: formData.get("encounter_id"),
    mode: formData.get("mode"),
    chief_complaint: formData.get("chief_complaint"),
    current_medications: formData.get("current_medications"),
    allergies: formData.get("allergies"),
    comorbidities: formData.get("comorbidities"),
    pain_score: formData.get("pain_score"),
    pain_location: formData.get("pain_location"),
    systolic_bp: formData.get("systolic_bp"),
    diastolic_bp: formData.get("diastolic_bp"),
    heart_rate: formData.get("heart_rate"),
    respiratory_rate: formData.get("respiratory_rate"),
    temperature_c: formData.get("temperature_c"),
    oxygen_saturation: formData.get("oxygen_saturation"),
    capillary_glucose: formData.get("capillary_glucose"),
    weight_kg: formData.get("weight_kg"),
    height_cm: formData.get("height_cm"),
    risk_level: formData.get("risk_level"),
    nursing_notes: formData.get("nursing_notes"),
    recommendations: formData.get("recommendations"),
    correction_reason: formData.get("correction_reason"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados da pré-consulta inválidos." };
  }

  const context = await getContext();
  if (!context) return { error: "Selecione uma clínica e autentique-se novamente." };
  if (!context.access.canOperateNursing) {
    await logAuditEvent({
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      actionType: "access_denied",
      module: "nursing",
      recordTable: "nursing_assessments",
      recordId: parsed.data.encounter_id,
      level: "security",
      notes: "Tentativa de preencher pré-consulta sem permissão de enfermagem.",
    });
    return { error: "Seu perfil não possui permissão para preencher pré-consulta." };
  }

  const preferences = await getPreferencesForAction(context.activeClinic.id);
  const missingFields = preferences.requiredFields.filter((field) => !hasValue(parsed.data[field]));
  if (missingFields.length) {
    return {
      error: `Preencha os campos obrigatórios: ${missingFields
        .map((field) => nursingFieldLabels[field])
        .join(", ")}.`,
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: encounter } = await admin
    .from("clinical_encounters")
    .select("id, clinic_id, patient_id, professional_member_id, status")
    .eq("id", parsed.data.encounter_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      clinic_id: string;
      patient_id: string;
      professional_member_id: string;
      status: string;
    }>();

  if (!encounter) return { error: "Atendimento não encontrado na clínica ativa." };
  if (!["waiting_triage", "triage_in_progress", "ready_for_consultation"].includes(encounter.status)) {
    return { error: "A ficha de enfermagem só pode ser preenchida durante a pré-consulta." };
  }

  const { data: previous } = await admin
    .from("nursing_assessments")
    .select("*")
    .eq("encounter_id", encounter.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (previous?.status === "completed" && !preferences.allowCompletedCorrections) {
    return { error: "A clínica bloqueou correções em pré-consultas encerradas." };
  }

  if (
    previous?.status === "completed" &&
    preferences.requireCorrectionReason &&
    !parsed.data.correction_reason
  ) {
    return { error: "Informe o motivo para corrigir uma pré-consulta já encerrada." };
  }

  const payload = {
    clinic_id: encounter.clinic_id,
    encounter_id: encounter.id,
    patient_id: encounter.patient_id,
    professional_member_id: encounter.professional_member_id,
    performed_by: context.user.id,
    status:
      parsed.data.mode === "complete"
        ? "completed"
        : previous?.status === "completed"
          ? "corrected"
          : "draft",
    chief_complaint: parsed.data.chief_complaint,
    current_medications: parsed.data.current_medications,
    allergies: parsed.data.allergies,
    comorbidities: parsed.data.comorbidities,
    pain_score: parsed.data.pain_score,
    pain_location: parsed.data.pain_location,
    systolic_bp: parsed.data.systolic_bp,
    diastolic_bp: parsed.data.diastolic_bp,
    heart_rate: parsed.data.heart_rate,
    respiratory_rate: parsed.data.respiratory_rate,
    temperature_c: parsed.data.temperature_c,
    oxygen_saturation: parsed.data.oxygen_saturation,
    capillary_glucose: parsed.data.capillary_glucose,
    weight_kg: parsed.data.weight_kg,
    height_cm: parsed.data.height_cm,
    bmi: bmi(parsed.data.weight_kg, parsed.data.height_cm),
    risk_level: parsed.data.risk_level,
    nursing_notes: parsed.data.nursing_notes,
    recommendations: parsed.data.recommendations,
    correction_reason: parsed.data.correction_reason,
    completed_at: parsed.data.mode === "complete" ? new Date().toISOString() : previous?.completed_at,
    created_by: previous?.created_by ?? context.user.id,
    updated_by: context.user.id,
  };

  if (encounter.status === "waiting_triage") {
    const { error: startError } = await transitionEncounter(
      context.supabase,
      encounter.id,
      "triage_in_progress",
      "Pré-consulta iniciada pela ficha de enfermagem.",
    );

    if (startError) {
      return {
        error:
          "Não foi possível iniciar a pré-consulta deste paciente. Atualize a fila de Enfermagem e tente novamente.",
      };
    }
  }

  const { data: saved, error } = await admin
    .from("nursing_assessments")
    .upsert(payload, { onConflict: "encounter_id" })
    .select("id")
    .single<{ id: string }>();

  if (error) return { error: "Não foi possível salvar a ficha de pré-consulta." };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType:
      parsed.data.mode === "complete"
        ? "nursing_assessment_completed"
        : previous
          ? "nursing_assessment_updated"
          : "nursing_assessment_created",
    module: "nursing",
    recordTable: "nursing_assessments",
    recordId: saved.id,
    oldValues: previous,
    newValues: payload,
    level: parsed.data.mode === "complete" ? "security" : "info",
    notes: "Ficha de pré-consulta registrada com rastreabilidade.",
  });

  if (parsed.data.mode === "complete") {
    const { error: transitionError } = await transitionEncounter(
      context.supabase,
      encounter.id,
      "ready_for_consultation",
      parsed.data.recommendations,
    );

    if (transitionError) {
      return {
        error:
          "Ficha salva, mas não foi possível liberar o paciente para atendimento. Revise a fila de Enfermagem.",
      };
    }
  }

  revalidatePath("/enfermagem");
  revalidatePath(`/enfermagem/${encounter.id}`);
  revalidatePath("/atendimentos");
  revalidatePath("/auditoria");

  return {
    success:
      parsed.data.mode === "complete"
        ? "Pré-consulta encerrada e paciente liberado para atendimento."
        : "Ficha de pré-consulta salva.",
  };
}

export async function upsertNursingPreferencesAction(
  _state: NursingActionState,
  formData: FormData,
): Promise<NursingActionState> {
  const parsed = preferencesSchema.safeParse({
    required_fields: formData.getAll("required_fields").map(String),
    allow_completed_corrections: formData.get("allow_completed_corrections") === "on",
    require_correction_reason: formData.get("require_correction_reason") === "on",
    show_required_field_alerts: formData.get("show_required_field_alerts") === "on",
  });

  if (!parsed.success) {
    return { error: "Preferências de Enfermagem inválidas." };
  }

  const context = await getContext();
  if (!context) return { error: "Selecione uma clínica e autentique-se novamente." };

  const canManage = context.access.canOperateNursing || context.access.canViewAll;
  if (!canManage) {
    await logAuditEvent({
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      actionType: "access_denied",
      module: "nursing",
      recordTable: "nursing_preferences",
      level: "security",
      notes: "Tentativa de alterar preferências de Enfermagem sem permissão.",
    });
    return { error: "Seu perfil não possui permissão para alterar preferências de Enfermagem." };
  }

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("nursing_preferences")
    .select("*")
    .eq("clinic_id", context.activeClinic.id)
    .maybeSingle();

  const payload = {
    clinic_id: context.activeClinic.id,
    required_fields: parsed.data.required_fields.length
      ? parsed.data.required_fields
      : DEFAULT_REQUIRED_NURSING_FIELDS,
    allow_completed_corrections: parsed.data.allow_completed_corrections,
    require_correction_reason: parsed.data.require_correction_reason,
    show_required_field_alerts: parsed.data.show_required_field_alerts,
    created_by: previous?.created_by ?? context.user.id,
    updated_by: context.user.id,
    deleted_at: null,
  };

  const { error } = await admin
    .from("nursing_preferences")
    .upsert(payload, { onConflict: "clinic_id" });

  if (error) return { error: "Não foi possível salvar as preferências de Enfermagem." };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "nursing_preferences_updated",
    module: "nursing",
    recordTable: "nursing_preferences",
    recordId: context.activeClinic.id,
    oldValues: previous,
    newValues: payload,
    notes: "Preferências do módulo de Enfermagem atualizadas.",
  });

  revalidatePath("/enfermagem");
  revalidatePath("/auditoria");
  return { success: "Preferências de Enfermagem salvas." };
}
