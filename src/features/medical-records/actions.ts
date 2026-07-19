"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DEFAULT_REQUIRED_MEDICAL_RECORD_FIELDS,
  MEDICAL_RECORD_LGPD_ACK_TEXT,
  isMedicalRecordFieldKey,
  medicalRecordFieldLabels,
} from "@/features/medical-records/config";
import {
  parseClinicalFormDefinition,
  validateClinicalFormResponses,
} from "@/features/medical-records/clinical-form-schema";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reportServerError } from "@/lib/observability";
import { getClinicalWorkflowAccess } from "@/repositories/clinical-workflow";
import { logAuditEvent } from "@/services/audit/audit-service";

export type MedicalRecordActionState = {
  error?: string;
  success?: string;
  redirectTo?: string;
};

export type MedicalDocumentActionState = MedicalRecordActionState;

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
  clinical_template_id: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  clinical_responses: z.string().max(100000).optional().transform((value) => value || "{}"),
});

const documentSchema = z.object({
  encounter_id: z.string().uuid(),
  medical_record_id: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  document_id: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  template_key: optionalText(80),
  title: z.string().trim().min(2, "Informe o titulo do documento.").max(180),
  content: z.string().trim().min(10, "Informe o conteudo do documento.").max(12000),
  professional_registry: optionalText(120),
  action: z.enum(["draft", "issue"]),
});

const deleteDocumentSchema = z.object({
  document_id: z.string().uuid(),
  reason: z.string().trim().min(10, "Informe um motivo com pelo menos 10 caracteres.").max(800),
});

const documentEventSchema = z.object({
  document_id: z.string().uuid(),
  event_type: z.enum(["printed", "exported_pdf"]),
});

const preferencesSchema = z.object({
  required_fields: z.array(z.string()).transform((values) => values.filter(isMedicalRecordFieldKey)),
  allow_completed_corrections: z.boolean(),
  require_correction_reason: z.boolean(),
  show_nursing_summary: z.boolean(),
  default_specialty_slug: z.string().regex(/^[a-z][a-z0-9_]{2,79}$/),
  allow_professional_template_choice: z.boolean(),
  active_specialty_slugs: z.array(z.string().regex(/^[a-z][a-z0-9_]{2,79}$/)).min(1),
});

const workspacePreferencesSchema = z.object({
  mode: z.enum(["guided", "compact"]),
  show_visual_map: z.boolean(),
});

const commentSchema = z.object({
  patient_id: z.string().uuid(),
  encounter_id: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  medical_record_id: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  comment: z.string().trim().min(3, "Escreva um comentario clinico.").max(2000),
  visibility: z.enum(["clinical", "private"]),
});

const attachmentSchema = z.object({
  encounter_id: z.string().uuid(),
  medical_record_id: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  category: z.enum(["exam", "report", "image", "attachment", "other"]),
  title: z.string().trim().min(2, "Informe o titulo do anexo.").max(180),
  description: optionalText(1000),
});

const deleteAttachmentSchema = z.object({
  attachment_id: z.string().uuid(),
  reason: z.string().trim().min(10, "Informe um motivo com pelo menos 10 caracteres.").max(800),
});

const correctionSchema = z.object({
  medical_record_id: z.string().uuid(),
  encounter_id: z.string().uuid(),
  reason: z.string().trim().min(10, "Informe um motivo com pelo menos 10 caracteres.").max(1000),
});

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

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

function revalidateMedicalRecord(encounterId: string) {
  revalidatePath("/atendimentos");
  revalidatePath("/prontuarios");
  revalidatePath(`/prontuarios/${encounterId}`);
  revalidatePath("/auditoria");
}

async function resolveEncounterForAction(encounterId: string, clinicId: string) {
  const admin = createSupabaseAdminClient();
  const { data: encounter } = await admin
    .from("clinical_encounters")
    .select("id, clinic_id, appointment_id, patient_id, professional_member_id, status")
    .eq("id", encounterId)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      clinic_id: string;
      appointment_id: string;
      patient_id: string;
      professional_member_id: string;
      status: string;
    }>();

  return encounter ?? null;
}

async function getOrCreateMedicalRecordForDocument({
  encounter,
  userId,
}: {
  encounter: {
    id: string;
    clinic_id: string;
    appointment_id: string;
    patient_id: string;
    professional_member_id: string;
  };
  userId: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("medical_records")
    .select("id")
    .eq("encounter_id", encounter.id)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();

  if (existing) return existing.id;

  const { data, error } = await admin
    .from("medical_records")
    .insert({
      clinic_id: encounter.clinic_id,
      encounter_id: encounter.id,
      appointment_id: encounter.appointment_id,
      patient_id: encounter.patient_id,
      professional_member_id: encounter.professional_member_id,
      performed_by: userId,
      status: "draft",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) return null;
  return data.id;
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
    clinical_template_id: formString("clinical_template_id"),
    clinical_responses: formString("clinical_responses"),
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

  let clinicalResponses: Record<string, unknown> = {};
  if (parsed.data.clinical_template_id) {
    let rawResponses: unknown;
    try {
      rawResponses = JSON.parse(parsed.data.clinical_responses);
    } catch {
      return { error: "Os dados do formulário especializado estão inválidos. Atualize a página." };
    }
    const { data: clinicalTemplate } = await admin
      .from("clinical_form_templates")
      .select("definition")
      .eq("id", parsed.data.clinical_template_id)
      .eq("clinic_id", context.activeClinic.id)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle<{ definition: unknown }>();
    if (!clinicalTemplate) return { error: "O formulário especializado selecionado não está mais disponível." };
    const validation = validateClinicalFormResponses(
      parseClinicalFormDefinition(clinicalTemplate.definition),
      rawResponses,
      parsed.data.mode === "complete",
    );
    if (validation.errors.length) {
      return { error: validation.errors.slice(0, 4).join(" ") };
    }
    clinicalResponses = validation.responses;
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
    return { error: "Abra o fluxo formal de correcao e informe o motivo antes de alterar um prontuario concluido." };
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
    clinical_template_id: parsed.data.clinical_template_id,
    clinical_responses: clinicalResponses,
    completed_at: parsed.data.mode === "complete" ? new Date().toISOString() : previous?.completed_at,
    created_by: previous?.created_by ?? context.user.id,
    updated_by: context.user.id,
  };

  const { data: savedId, error } = await context.supabase.rpc(
    "save_advanced_medical_record_transaction",
    {
      record_payload: payload,
      complete_record: parsed.data.mode === "complete",
      transition_reason: parsed.data.follow_up_notes,
    },
  );

  if (error || typeof savedId !== "string") {
    reportServerError("medical_records.save_transaction", error, {
      clinicId: context.activeClinic.id,
      encounterId: encounter.id,
      mode: parsed.data.mode,
    });
    return {
      error:
        error?.message?.includes("INVALID_MEDICAL_RECORD_STAGE") ||
        error?.message?.includes("INVALID_MEDICAL_COMPLETION_STAGE")
          ? "A etapa assistencial mudou. Atualize a fila de Atendimentos antes de continuar."
          : error?.message?.includes("CLINICAL_REQUIRED_FIELD")
            ? `Preencha o campo especializado obrigatório: ${error.message.split(":").at(-1) ?? "campo não informado"}.`
            : error?.message?.includes("CLINICAL_TEMPLATE_LOCKED")
              ? "O formulário de um prontuário concluído não pode ser substituído. Abra uma correção formal."
          : "Nao foi possivel salvar o prontuario de forma segura. Atualize a pagina e tente novamente.",
    };
  }

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
    recordId: savedId,
    oldValues: previous,
    newValues: payload,
    level: parsed.data.mode === "complete" ? "security" : "info",
    notes: "Prontuario registrado com rastreabilidade do atendimento.",
  });

  if (previous?.status === "completed" && parsed.data.correction_reason) {
    await admin
      .from("medical_record_correction_requests")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
        updated_by: context.user.id,
      })
      .eq("medical_record_id", savedId)
      .eq("status", "opened");
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

export async function saveMedicalDocumentAction(
  _state: MedicalDocumentActionState,
  formData: FormData,
): Promise<MedicalDocumentActionState> {
  const parsed = documentSchema.safeParse({
    encounter_id: formData.get("encounter_id"),
    medical_record_id: formData.get("medical_record_id"),
    document_id: formData.get("document_id"),
    template_key: formData.get("template_key"),
    title: formData.get("title"),
    content: formData.get("content"),
    professional_registry: formData.get("professional_registry"),
    action: formData.get("action"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Documento invalido." };
  }

  const context = await getContext();
  if (!context) return { error: "Selecione uma clinica e autentique-se novamente." };
  if (!context.access.canViewOwn && !context.access.canViewAll) {
    return { error: "Seu perfil nao possui permissao para emitir documentos clinicos." };
  }

  const encounter = await resolveEncounterForAction(parsed.data.encounter_id, context.activeClinic.id);
  if (!encounter) return { error: "Atendimento nao encontrado." };
  if (!context.access.canViewAll && encounter.professional_member_id !== context.access.currentMemberId) {
    return { error: "Este atendimento nao esta vinculado ao seu usuario." };
  }

  const medicalRecordId =
    parsed.data.medical_record_id ??
    (await getOrCreateMedicalRecordForDocument({ encounter, userId: context.user.id }));
  if (!medicalRecordId) return { error: "Nao foi possivel preparar o prontuario para o documento." };

  const admin = createSupabaseAdminClient();
  const { data: previous } = parsed.data.document_id
    ? await admin
        .from("medical_prescriptions")
        .select("*")
        .eq("id", parsed.data.document_id)
        .eq("clinic_id", context.activeClinic.id)
        .maybeSingle()
    : { data: null };

  const now = new Date().toISOString();
  const payload = {
    clinic_id: context.activeClinic.id,
    medical_record_id: medicalRecordId,
    encounter_id: encounter.id,
    patient_id: encounter.patient_id,
    professional_member_id: encounter.professional_member_id,
    template_key: parsed.data.template_key,
    title: parsed.data.title,
    content: parsed.data.content,
    professional_registry: parsed.data.professional_registry,
    status: parsed.data.action === "issue" ? "issued" : "draft",
    issued_at: parsed.data.action === "issue" ? previous?.issued_at ?? now : previous?.issued_at ?? null,
    deleted_at: null,
    deleted_reason: null,
    deleted_by: null,
    updated_by: context.user.id,
    created_by: previous?.created_by ?? context.user.id,
  };

  const query = parsed.data.document_id
    ? admin.from("medical_prescriptions").update(payload).eq("id", parsed.data.document_id)
    : admin.from("medical_prescriptions").insert(payload);

  const { data: document, error } = await query.select("id").single<{ id: string }>();
  if (error || !document) return { error: "Nao foi possivel salvar o documento." };

  await admin.from("medical_document_events").insert({
    clinic_id: context.activeClinic.id,
    medical_document_id: document.id,
    medical_record_id: medicalRecordId,
    encounter_id: encounter.id,
    patient_id: encounter.patient_id,
    professional_member_id: encounter.professional_member_id,
    event_type: parsed.data.document_id ? "updated" : "created",
    created_by: context.user.id,
  });

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.document_id ? "prescription_updated" : "prescription_created",
    module: "medical_records",
    recordTable: "medical_prescriptions",
    recordId: document.id,
    oldValues: previous,
    newValues: payload,
    level: "security",
    notes: "Documento clinico vinculado ao prontuario.",
  });

  revalidateMedicalRecord(encounter.id);
  return { success: parsed.data.action === "issue" ? "Documento emitido." : "Documento salvo." };
}

export async function uploadMedicalAttachmentAction(
  _state: MedicalDocumentActionState,
  formData: FormData,
): Promise<MedicalDocumentActionState> {
  const parsed = attachmentSchema.safeParse({
    encounter_id: formData.get("encounter_id"),
    medical_record_id: formData.get("medical_record_id"),
    category: formData.get("category"),
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Anexo invalido." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione um arquivo para anexar." };
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return { error: "O arquivo deve ter no maximo 10 MB." };
  }
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
    return { error: "Formato nao permitido. Use PDF, JPG, PNG, WEBP ou TXT." };
  }

  const context = await getContext();
  if (!context) return { error: "Selecione uma clinica e autentique-se novamente." };
  if (!context.access.canViewOwn && !context.access.canViewAll) {
    return { error: "Seu perfil nao possui permissao para anexar documentos clinicos." };
  }

  const encounter = await resolveEncounterForAction(parsed.data.encounter_id, context.activeClinic.id);
  if (!encounter) return { error: "Atendimento nao encontrado." };
  if (!context.access.canViewAll && encounter.professional_member_id !== context.access.currentMemberId) {
    return { error: "Este atendimento nao esta vinculado ao seu usuario." };
  }

  const medicalRecordId =
    parsed.data.medical_record_id ??
    (await getOrCreateMedicalRecordForDocument({ encounter, userId: context.user.id }));
  if (!medicalRecordId) return { error: "Nao foi possivel preparar o prontuario para o anexo." };

  const admin = createSupabaseAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const filePath = `${context.activeClinic.id}/${encounter.patient_id}/${encounter.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await admin.storage
    .from("clinical-attachments")
    .upload(filePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) return { error: "Nao foi possivel enviar o arquivo." };

  const payload = {
    clinic_id: context.activeClinic.id,
    medical_record_id: medicalRecordId,
    encounter_id: encounter.id,
    patient_id: encounter.patient_id,
    professional_member_id: encounter.professional_member_id,
    category: parsed.data.category,
    title: parsed.data.title,
    description: parsed.data.description,
    file_name: file.name,
    file_path: filePath,
    mime_type: file.type,
    file_size: file.size,
    created_by: context.user.id,
    updated_by: context.user.id,
  };

  const { data, error } = await admin
    .from("medical_record_attachments")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { error: "Arquivo enviado, mas nao foi possivel registrar o anexo." };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "medical_attachment_created",
    module: "medical_records",
    recordTable: "medical_record_attachments",
    recordId: data.id,
    newValues: payload,
    level: "security",
    notes: "Anexo/exame vinculado ao prontuario.",
  });

  revalidateMedicalRecord(encounter.id);
  return { success: "Anexo registrado no prontuario." };
}

export async function deleteMedicalAttachmentAction(
  _state: MedicalDocumentActionState,
  formData: FormData,
): Promise<MedicalDocumentActionState> {
  const parsed = deleteAttachmentSchema.safeParse({
    attachment_id: formData.get("attachment_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Exclusao invalida." };

  const context = await getContext();
  if (!context) return { error: "Selecione uma clinica e autentique-se novamente." };
  const admin = createSupabaseAdminClient();
  const { data: attachment } = await admin
    .from("medical_record_attachments")
    .select("*")
    .eq("id", parsed.data.attachment_id)
    .eq("clinic_id", context.activeClinic.id)
    .maybeSingle();
  if (!attachment) return { error: "Anexo nao encontrado." };
  if (!context.access.canViewAll && attachment.professional_member_id !== context.access.currentMemberId) {
    return { error: "Este anexo nao esta vinculado ao seu usuario." };
  }

  const payload = {
    status: "deleted",
    deleted_at: new Date().toISOString(),
    deleted_reason: parsed.data.reason,
    deleted_by: context.user.id,
    updated_by: context.user.id,
  };
  const { error } = await admin
    .from("medical_record_attachments")
    .update(payload)
    .eq("id", attachment.id);
  if (error) return { error: "Nao foi possivel excluir o anexo." };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "medical_attachment_deleted",
    module: "medical_records",
    recordTable: "medical_record_attachments",
    recordId: attachment.id,
    oldValues: attachment,
    newValues: payload,
    level: "security",
    notes: "Anexo clinico excluido logicamente com motivo preservado.",
  });

  revalidateMedicalRecord(attachment.encounter_id);
  return { success: "Anexo removido do uso operacional e preservado no historico." };
}

export async function openMedicalRecordCorrectionAction(
  _state: MedicalRecordActionState,
  formData: FormData,
): Promise<MedicalRecordActionState> {
  const parsed = correctionSchema.safeParse({
    medical_record_id: formData.get("medical_record_id"),
    encounter_id: formData.get("encounter_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Correcao invalida." };

  const context = await getContext();
  if (!context) return { error: "Selecione uma clinica e autentique-se novamente." };
  const admin = createSupabaseAdminClient();
  const { data: record } = await admin
    .from("medical_records")
    .select("*")
    .eq("id", parsed.data.medical_record_id)
    .eq("clinic_id", context.activeClinic.id)
    .maybeSingle();
  if (!record) return { error: "Prontuario nao encontrado." };
  if (record.status !== "completed") return { error: "A correcao formal e aplicada apenas a prontuarios concluidos." };
  if (!context.access.canViewAll && record.professional_member_id !== context.access.currentMemberId) {
    return { error: "Este prontuario nao esta vinculado ao seu usuario." };
  }

  const payload = {
    clinic_id: context.activeClinic.id,
    medical_record_id: record.id,
    encounter_id: record.encounter_id,
    patient_id: record.patient_id,
    professional_member_id: record.professional_member_id,
    reason: parsed.data.reason,
    status: "opened",
    created_by: context.user.id,
    updated_by: context.user.id,
  };
  const { data, error } = await admin
    .from("medical_record_correction_requests")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { error: "Nao foi possivel abrir a correcao formal." };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "medical_record_correction_opened",
    module: "medical_records",
    recordTable: "medical_record_correction_requests",
    recordId: data.id,
    newValues: payload,
    level: "security",
    notes: "Fluxo formal de correcao do prontuario aberto.",
  });

  revalidateMedicalRecord(record.encounter_id);
  return { success: "Correcao formal aberta. Agora edite e salve a justificativa junto ao prontuario." };
}

export async function deleteMedicalDocumentAction(
  _state: MedicalDocumentActionState,
  formData: FormData,
): Promise<MedicalDocumentActionState> {
  const parsed = deleteDocumentSchema.safeParse({
    document_id: formData.get("document_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Exclusao invalida." };

  const context = await getContext();
  if (!context) return { error: "Selecione uma clinica e autentique-se novamente." };
  const admin = createSupabaseAdminClient();
  const { data: document } = await admin
    .from("medical_prescriptions")
    .select("*")
    .eq("id", parsed.data.document_id)
    .eq("clinic_id", context.activeClinic.id)
    .maybeSingle();
  if (!document) return { error: "Documento nao encontrado." };
  if (!context.access.canViewAll && document.professional_member_id !== context.access.currentMemberId) {
    return { error: "Este documento nao esta vinculado ao seu usuario." };
  }

  const payload = {
    status: "deleted",
    deleted_at: new Date().toISOString(),
    deleted_reason: parsed.data.reason,
    deleted_by: context.user.id,
    updated_by: context.user.id,
  };

  const { error } = await admin
    .from("medical_prescriptions")
    .update(payload)
    .eq("id", parsed.data.document_id);
  if (error) return { error: "Nao foi possivel excluir o documento." };

  await admin.from("medical_document_events").insert({
    clinic_id: context.activeClinic.id,
    medical_document_id: document.id,
    medical_record_id: document.medical_record_id,
    encounter_id: document.encounter_id,
    patient_id: document.patient_id,
    professional_member_id: document.professional_member_id,
    event_type: "deleted",
    reason: parsed.data.reason,
    created_by: context.user.id,
  });

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "prescription_deleted",
    module: "medical_records",
    recordTable: "medical_prescriptions",
    recordId: document.id,
    oldValues: document,
    newValues: payload,
    level: "security",
    notes: "Documento clinico excluido com motivo preservado no prontuario.",
  });

  revalidateMedicalRecord(document.encounter_id);
  return { success: "Documento excluido e preservado no historico." };
}

export async function logMedicalDocumentEventAction(
  _state: MedicalDocumentActionState,
  formData: FormData,
): Promise<MedicalDocumentActionState> {
  const parsed = documentEventSchema.safeParse({
    document_id: formData.get("document_id"),
    event_type: formData.get("event_type"),
  });
  if (!parsed.success) return { error: "Evento de documento invalido." };

  const context = await getContext();
  if (!context) return { error: "Selecione uma clinica e autentique-se novamente." };
  const admin = createSupabaseAdminClient();
  const { data: document } = await admin
    .from("medical_prescriptions")
    .select("*")
    .eq("id", parsed.data.document_id)
    .eq("clinic_id", context.activeClinic.id)
    .maybeSingle();
  if (!document) return { error: "Documento nao encontrado." };

  const timestampField = parsed.data.event_type === "printed" ? "printed_at" : "exported_at";
  await admin
    .from("medical_prescriptions")
    .update({ [timestampField]: new Date().toISOString(), updated_by: context.user.id })
    .eq("id", document.id);

  await admin.from("medical_document_events").insert({
    clinic_id: context.activeClinic.id,
    medical_document_id: document.id,
    medical_record_id: document.medical_record_id,
    encounter_id: document.encounter_id,
    patient_id: document.patient_id,
    professional_member_id: document.professional_member_id,
    event_type: parsed.data.event_type,
    created_by: context.user.id,
  });

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.event_type === "printed" ? "prescription_printed" : "prescription_exported",
    module: "medical_records",
    recordTable: "medical_prescriptions",
    recordId: document.id,
    level: "security",
    notes: "Documento clinico acessado para impressao/exportacao.",
  });

  revalidateMedicalRecord(document.encounter_id);
  return { success: "Evento registrado." };
}

export async function upsertMedicalRecordPreferencesAction(
  _state: MedicalRecordActionState,
  formData: FormData,
): Promise<MedicalRecordActionState> {
  const parsed = preferencesSchema.safeParse({
    required_fields: formData.getAll("required_fields").map(String),
    allow_completed_corrections: formData.get("allow_completed_corrections") === "on",
    require_correction_reason: formData.get("require_correction_reason") === "on",
    show_nursing_summary: formData.get("show_nursing_summary") === "on",
    default_specialty_slug: formData.get("default_specialty_slug"),
    allow_professional_template_choice: formData.get("allow_professional_template_choice") === "on",
    active_specialty_slugs: formData.getAll("active_specialty_slugs").map(String),
  });
  if (!parsed.success) return { error: "Preferencias invalidas." };

  const context = await getContext();
  if (!context) return { error: "Selecione uma clinica e autentique-se novamente." };
  if (!context.access.canViewAll) return { error: "Apenas administradores podem alterar preferencias." };
  if (!parsed.data.active_specialty_slugs.includes(parsed.data.default_specialty_slug)) {
    return { error: "A especialidade padrão precisa permanecer ativa." };
  }

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("medical_record_preferences")
    .select("*")
    .eq("clinic_id", context.activeClinic.id)
    .maybeSingle();

  const payload = {
    clinic_id: context.activeClinic.id,
    required_fields: parsed.data.required_fields.length
      ? parsed.data.required_fields
      : DEFAULT_REQUIRED_MEDICAL_RECORD_FIELDS,
    allow_completed_corrections: parsed.data.allow_completed_corrections,
    require_correction_reason: parsed.data.require_correction_reason,
    show_nursing_summary: parsed.data.show_nursing_summary,
    default_specialty_slug: parsed.data.default_specialty_slug,
    allow_professional_template_choice: parsed.data.allow_professional_template_choice,
    created_by: previous?.created_by ?? context.user.id,
    updated_by: context.user.id,
    deleted_at: null,
  };

  const { error } = await context.supabase.rpc("save_clinical_form_preferences_transaction", {
    preferences_payload: {
      ...payload,
      required_fields: payload.required_fields,
    },
    active_specialties: parsed.data.active_specialty_slugs,
  });
  if (error) return { error: "Nao foi possivel salvar as preferencias." };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "medical_record_preferences_updated",
    module: "medical_records",
    recordTable: "medical_record_preferences",
    recordId: context.activeClinic.id,
    oldValues: previous,
    newValues: payload,
    notes: "Preferencias do modulo Prontuarios atualizadas.",
  });

  revalidatePath("/prontuarios");
  revalidatePath("/auditoria");
  return { success: "Preferencias de prontuario salvas." };
}

export async function saveMedicalWorkspacePreferencesAction(
  formData: FormData,
): Promise<MedicalRecordActionState> {
  const parsed = workspacePreferencesSchema.safeParse({
    mode: formData.get("mode"),
    show_visual_map: formData.get("show_visual_map") === "true",
  });
  if (!parsed.success) return { error: "Preferências do workspace inválidas." };

  const context = await getContext();
  if (!context) return { error: "Selecione uma clínica e autentique-se novamente." };
  if (!context.access.canViewOwn && !context.access.canViewAll) {
    return { error: "Seu perfil não possui acesso ao workspace clínico." };
  }

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("module_user_preferences")
    .select("preferences")
    .eq("clinic_id", context.activeClinic.id)
    .eq("user_id", context.user.id)
    .eq("module_key", "medical_records")
    .is("deleted_at", null)
    .maybeSingle<{ preferences: Record<string, unknown> }>();

  const preferences = {
    ...(previous?.preferences ?? {}),
    mode: parsed.data.mode,
    showVisualMap: parsed.data.show_visual_map,
  };
  const { error } = await context.supabase.rpc("save_module_user_preferences", {
    module_name: "medical_records",
    preference_payload: {
      clinic_id: context.activeClinic.id,
      preferences,
    },
  });

  if (error) {
    reportServerError("medical_records.workspace_preferences", error, {
      clinicId: context.activeClinic.id,
      userId: context.user.id,
    });
    return { error: "Não foi possível salvar as preferências do workspace." };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "medical_workspace_preferences_updated",
    module: "medical_records",
    recordTable: "module_user_preferences",
    recordId: context.user.id,
    oldValues: previous?.preferences ?? null,
    newValues: preferences,
    notes: "Preferências pessoais do workspace clínico atualizadas.",
  });

  revalidatePath("/prontuarios");
  return { success: "Preferência do workspace salva." };
}

export async function addPatientClinicalCommentAction(
  _state: MedicalRecordActionState,
  formData: FormData,
): Promise<MedicalRecordActionState> {
  const parsed = commentSchema.safeParse({
    patient_id: formData.get("patient_id"),
    encounter_id: formData.get("encounter_id"),
    medical_record_id: formData.get("medical_record_id"),
    comment: formData.get("comment"),
    visibility: formData.get("visibility") || "clinical",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Comentario invalido." };

  const context = await getContext();
  if (!context) return { error: "Selecione uma clinica e autentique-se novamente." };
  if (!context.access.canViewOwn && !context.access.canViewAll) {
    return { error: "Seu perfil nao possui permissao para comentar em prontuarios." };
  }

  const admin = createSupabaseAdminClient();
  const payload = {
    clinic_id: context.activeClinic.id,
    patient_id: parsed.data.patient_id,
    encounter_id: parsed.data.encounter_id,
    medical_record_id: parsed.data.medical_record_id,
    professional_member_id: context.access.currentMemberId,
    comment: parsed.data.comment,
    visibility: parsed.data.visibility,
    created_by: context.user.id,
    updated_by: context.user.id,
  };
  const { data, error } = await admin
    .from("patient_clinical_comments")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { error: "Nao foi possivel salvar o comentario." };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "patient_clinical_comment_created",
    module: "medical_records",
    recordTable: "patient_clinical_comments",
    recordId: data.id,
    newValues: payload,
    level: "security",
    notes: "Comentario clinico vinculado ao paciente.",
  });

  revalidatePath("/prontuarios");
  if (parsed.data.encounter_id) revalidatePath(`/prontuarios/${parsed.data.encounter_id}`);
  return { success: "Comentario salvo." };
}

export async function acknowledgeMedicalLgpdAction(
  _state: MedicalRecordActionState,
  _formData: FormData,
): Promise<MedicalRecordActionState> {
  void _state;
  void _formData;
  const context = await getContext();
  if (!context) return { error: "Selecione uma clinica e autentique-se novamente." };
  if (!context.access.canViewOwn && !context.access.canViewAll) {
    return { error: "Seu perfil nao possui acesso a dados clinicos sensiveis." };
  }

  const admin = createSupabaseAdminClient();
  const payload = {
    clinic_id: context.activeClinic.id,
    user_id: context.user.id,
    member_id: context.access.currentMemberId,
    version: "2026-06-clinical-data-v1",
    consent_text: MEDICAL_RECORD_LGPD_ACK_TEXT,
    created_by: context.user.id,
  };
  const { error } = await admin
    .from("medical_lgpd_acknowledgements")
    .upsert(payload, { onConflict: "clinic_id,user_id,version" });
  if (error) return { error: "Nao foi possivel registrar a ciencia LGPD." };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "medical_lgpd_acknowledged",
    module: "medical_records",
    recordTable: "medical_lgpd_acknowledgements",
    recordId: context.user.id,
    newValues: payload,
    level: "security",
    notes: "Profissional confirmou ciencia sobre tratamento de dados pessoais sensiveis de saude.",
  });

  revalidatePath("/prontuarios");
  return { success: "Ciencia LGPD registrada." };
}
