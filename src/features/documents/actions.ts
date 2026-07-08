"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDocumentsAccess } from "@/repositories/documents";
import { logAuditEvent } from "@/services/audit/audit-service";
import {
  documentContentText,
  sanitizeDocumentContent,
} from "@/services/documents/document-content";
import {
  normalizeDocumentPageSettings,
  parseDocumentPageSettings,
} from "@/features/documents/document-editor";

export type DocumentsActionState = {
  error?: string;
  success?: string;
  documentId?: string;
  status?: "draft" | "issued";
};

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((value) => value || null);

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal(""))
  .transform((value) => value || null);

const optionalTitle = z
  .string()
  .trim()
  .max(180, "Use um título com até 180 caracteres.")
  .optional()
  .or(z.literal(""))
  .transform((value) => value || null);

const templateTypeSchema = z.enum([
  "service_contract",
  "lgpd_consent",
  "procedure_consent",
  "payment_acknowledgement",
  "attendance_declaration",
  "receipt",
  "other",
]);

const templateSchema = z.object({
  id: optionalUuid,
  template_type: templateTypeSchema,
  name: z.string().trim().min(3, "Informe o nome do modelo.").max(160),
  description: z.string().trim().max(500).optional().or(z.literal("")).transform((value) => value || null),
  legal_basis: z.string().trim().max(1600).optional().or(z.literal("")).transform((value) => value || null),
  content: z.string().trim().max(50000),
  page_settings: z.string().optional().or(z.literal("")),
  accepted_file_name: z.string().trim().max(180).optional().or(z.literal("")).transform((value) => value || null),
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

const generatedDocumentSchema = z.object({
  template_id: z.string().uuid("Selecione um modelo válido."),
  patient_id: optionalUuid,
  appointment_id: optionalUuid,
  encounter_id: optionalUuid,
  financial_entry_id: optionalUuid,
  professional_member_id: optionalUuid,
  title: optionalTitle,
  content: z.string().trim().max(60000),
  page_settings: z.string().optional().or(z.literal("")),
  status: z.enum(["draft", "issued"]).optional().default("issued"),
  expires_at: optionalDate,
  observations: z.string().trim().max(1000).optional().or(z.literal("")).transform((value) => value || null),
});

const documentOperationSchema = z.object({
  document_id: z.string().uuid("Documento não identificado."),
});

const cancelDocumentSchema = documentOperationSchema.extend({
  reason: z.string().trim().min(5, "Informe um motivo com pelo menos 5 caracteres.").max(500),
});

async function getContext() {
  const [{ activeClinic }, supabase] = await Promise.all([
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Faça login novamente." as const };
  if (!activeClinic) return { error: "Selecione uma clínica antes de acessar documentos." as const };
  const access = await getDocumentsAccess(activeClinic.id);
  return { activeClinic, user, access, supabase };
}

function documentRpcError(message?: string) {
  const normalized = message?.toUpperCase() ?? "";
  if (normalized.includes("PERMISSION")) return "Seu perfil não possui permissão para esta operação documental.";
  if (normalized.includes("MISMATCH")) return "Os vínculos selecionados não pertencem ao mesmo atendimento. Revise paciente, consulta e lançamento financeiro.";
  if (normalized.includes("TEMPLATE")) return "O modelo selecionado não está mais disponível.";
  if (normalized.includes("PATIENT")) return "O paciente selecionado não pertence à clínica ativa.";
  if (normalized.includes("APPOINTMENT")) return "A consulta selecionada não pertence à clínica ativa.";
  if (normalized.includes("FINANCIAL")) return "O lançamento financeiro selecionado não está disponível.";
  if (normalized.includes("NOT_DRAFT")) return "Somente rascunhos podem ser emitidos.";
  if (normalized.includes("ALREADY_CANCELLED")) return "Este documento já está cancelado.";
  return "Não foi possível concluir a operação documental.";
}

export async function saveDocumentTemplateAction(
  _state: DocumentsActionState,
  formData: FormData,
): Promise<DocumentsActionState> {
  const parsed = templateSchema.safeParse({
    id: formData.get("id") || undefined,
    template_type: formData.get("template_type"),
    name: formData.get("name"),
    description: formData.get("description"),
    legal_basis: formData.get("legal_basis"),
    content: formData.get("content"),
    page_settings: formData.get("page_settings")?.toString(),
    accepted_file_name: formData.get("accepted_file_name"),
    active: formData.get("active") ? "on" : "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const sanitizedContent = sanitizeDocumentContent(parsed.data.content);
  if (documentContentText(sanitizedContent).length < 80) {
    return { error: "O modelo precisa ter conteúdo suficiente para emissão." };
  }
  const pageSettings = parseDocumentPageSettings(parsed.data.page_settings);

  const context = await getContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canEdit && !context.access.canManage) {
    return { error: "Seu perfil não possui permissão para editar modelos." };
  }

  const admin = createSupabaseAdminClient();
  const basePayload = {
    template_type: parsed.data.template_type,
    name: parsed.data.name,
    description: parsed.data.description,
    legal_basis: parsed.data.legal_basis,
    content: sanitizedContent,
    page_settings: pageSettings,
    accepted_file_name: parsed.data.accepted_file_name,
    active: parsed.data.active,
    updated_by: context.user.id,
  };

  if (!parsed.data.id) {
    if (!context.access.canManage) {
      return { error: "A criação de modelos exige permissão de gestão documental." };
    }
    const { data: created, error } = await admin
      .from("document_templates")
      .insert({
        clinic_id: context.activeClinic.id,
        ...basePayload,
        version_number: 1,
        created_by: context.user.id,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !created) return { error: "Não foi possível criar o modelo." };

    await admin.from("document_template_versions").insert({
      clinic_id: context.activeClinic.id,
      template_id: created.id,
      version_number: 1,
      content: sanitizedContent,
      page_settings: pageSettings,
      legal_basis: parsed.data.legal_basis,
      accepted_file_name: parsed.data.accepted_file_name,
      created_by: context.user.id,
    });
    await logAuditEvent({
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      actionType: "document_template_created",
      module: "documents",
      recordTable: "document_templates",
      recordId: created.id,
      newValues: { ...basePayload, version_number: 1 },
      notes: "Novo modelo documental criado.",
    });
    revalidatePath("/documentos");
    return { success: "Modelo criado e pronto para emissão." };
  }

  const { data: previous } = await admin
    .from("document_templates")
    .select("*")
    .eq("id", parsed.data.id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!previous) return { error: "Modelo não encontrado." };

  const nextVersion = Number(previous.version_number ?? 1) + 1;
  const payload = { ...basePayload, version_number: nextVersion };
  const { error } = await admin
    .from("document_templates")
    .update(payload)
    .eq("id", previous.id)
    .eq("clinic_id", context.activeClinic.id);
  if (error) return { error: "Não foi possível salvar o modelo." };

  await admin.from("document_template_versions").insert({
    clinic_id: context.activeClinic.id,
    template_id: previous.id,
    version_number: nextVersion,
    content: sanitizedContent,
    page_settings: pageSettings,
    legal_basis: parsed.data.legal_basis,
    accepted_file_name: parsed.data.accepted_file_name,
    created_by: context.user.id,
  });
  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "document_template_updated",
    module: "documents",
    recordTable: "document_templates",
    recordId: previous.id,
    oldValues: previous,
    newValues: payload,
    notes: "Modelo documental atualizado com nova versão.",
  });

  revalidatePath("/documentos");
  return { success: "Modelo salvo e versionado." };
}

export async function createGeneratedDocumentAction(
  _state: DocumentsActionState,
  formData: FormData,
): Promise<DocumentsActionState> {
  const parsed = generatedDocumentSchema.safeParse({
    template_id: formData.get("template_id"),
    patient_id: formData.get("patient_id") || undefined,
    appointment_id: formData.get("appointment_id") || undefined,
    encounter_id: formData.get("encounter_id") || undefined,
    financial_entry_id: formData.get("financial_entry_id") || undefined,
    professional_member_id: formData.get("professional_member_id") || undefined,
    title: formData.get("title") ?? undefined,
    content: formData.get("content") ?? "",
    page_settings: formData.get("page_settings")?.toString(),
    status: formData.get("document_intent") || formData.get("status"),
    expires_at: formData.get("expires_at") || undefined,
    observations: formData.get("observations") || undefined,
  });
  if (!parsed.success) {
    const fieldLabels: Record<string, string> = {
      template_id: "modelo",
      patient_id: "paciente",
      appointment_id: "consulta",
      encounter_id: "atendimento",
      financial_entry_id: "lançamento financeiro",
      professional_member_id: "profissional",
      title: "título",
      content: "conteúdo",
      page_settings: "configuração da página",
      status: "tipo de emissão",
      expires_at: "validade",
      observations: "observação interna",
    };
    const issue = parsed.error.issues[0];
    console.warn("document.issue.validation_failed", {
      field: issue?.path.join("."),
      code: issue?.code,
    });
    const field = fieldLabels[String(issue?.path[0] ?? "")];
    return { error: issue?.message && !/^Invalid/i.test(issue.message) ? issue.message : `Revise o campo ${field ?? "do documento"} antes de emitir.` };
  }
  const sanitizedContent = sanitizeDocumentContent(parsed.data.content);
  if (documentContentText(sanitizedContent).length < 40) {
    return { error: "Revise o conteúdo antes de salvar. O documento precisa ter ao menos 40 caracteres." };
  }
  const pageSettings = normalizeDocumentPageSettings(
    parseDocumentPageSettings(parsed.data.page_settings),
  );

  const context = await getContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canCreate && !context.access.canManage) {
    return { error: "Seu perfil não possui permissão para emitir documentos." };
  }

  const admin = createSupabaseAdminClient();
  const { data: template } = await admin
    .from("document_templates")
    .select("name")
    .eq("id", parsed.data.template_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<{ name: string }>();
  const documentTitle = parsed.data.title || template?.name || "Documento emitido";

  const payload = {
    clinic_id: context.activeClinic.id,
    template_id: parsed.data.template_id,
    patient_id: parsed.data.patient_id,
    appointment_id: parsed.data.appointment_id,
    encounter_id: parsed.data.encounter_id,
    financial_entry_id: parsed.data.financial_entry_id,
    professional_member_id: parsed.data.professional_member_id,
    title: documentTitle,
    content: sanitizedContent,
    status: parsed.data.status,
    expires_at: parsed.data.expires_at,
    metadata: { observations: parsed.data.observations, page_settings: pageSettings },
  };
  const { data: documentId, error } = await context.supabase.rpc(
    "save_generated_document_transaction",
    { document_payload: payload },
  );
  if (error || !documentId) {
    console.error("document.issue.failed", {
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      code: error?.code,
      message: error?.message,
      details: error?.details,
    });
    return { error: documentRpcError(error?.message) };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.status === "issued" ? "document_issued" : "document_draft_created",
    module: "documents",
    recordTable: "generated_documents",
    recordId: documentId as string,
    newValues: {
      template_id: parsed.data.template_id,
      patient_id: parsed.data.patient_id,
      appointment_id: parsed.data.appointment_id,
      encounter_id: parsed.data.encounter_id,
      financial_entry_id: parsed.data.financial_entry_id,
      title: documentTitle,
      status: parsed.data.status,
    },
    level: parsed.data.patient_id ? "security" : "info",
    notes: parsed.data.status === "issued" ? "Documento emitido pela central documental." : "Rascunho documental criado.",
  });

  revalidatePath("/documentos");
  revalidatePath("/auditoria");
  return {
    success: parsed.data.status === "issued" ? "Documento emitido e numerado." : "Rascunho salvo.",
    documentId: documentId as string,
    status: parsed.data.status,
  };
}

export async function issueGeneratedDocumentAction(
  _state: DocumentsActionState,
  formData: FormData,
): Promise<DocumentsActionState> {
  const parsed = documentOperationSchema.safeParse({ document_id: formData.get("document_id") });
  if (!parsed.success) return { error: "Documento não identificado." };
  const context = await getContext();
  if ("error" in context) return { error: context.error };

  const { data: documentNumber, error } = await context.supabase.rpc(
    "issue_generated_document_transaction",
    { document_uuid: parsed.data.document_id },
  );
  if (error || !documentNumber) return { error: documentRpcError(error?.message) };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "document_issued",
    module: "documents",
    recordTable: "generated_documents",
    recordId: parsed.data.document_id,
    newValues: { status: "issued", document_number: documentNumber },
    level: "security",
    notes: "Rascunho revisado e emitido pela central documental.",
  });
  revalidatePath("/documentos");
  return { success: `Documento ${documentNumber} emitido.`, documentId: parsed.data.document_id, status: "issued" };
}

export async function cancelGeneratedDocumentAction(
  _state: DocumentsActionState,
  formData: FormData,
): Promise<DocumentsActionState> {
  const parsed = cancelDocumentSchema.safeParse({
    document_id: formData.get("document_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const context = await getContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "O cancelamento exige permissão de gestão documental." };

  const { error } = await context.supabase.rpc("cancel_generated_document_transaction", {
    document_uuid: parsed.data.document_id,
    cancellation_note: parsed.data.reason,
  });
  if (error) return { error: documentRpcError(error.message) };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "document_cancelled",
    module: "documents",
    recordTable: "generated_documents",
    recordId: parsed.data.document_id,
    newValues: { status: "cancelled", reason: parsed.data.reason },
    level: "security",
    notes: "Documento cancelado com preservação integral do histórico.",
  });
  revalidatePath("/documentos");
  revalidatePath("/auditoria");
  return { success: "Documento cancelado e preservado no histórico." };
}
