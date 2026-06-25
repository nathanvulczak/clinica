"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDocumentsAccess } from "@/repositories/documents";
import { logAuditEvent } from "@/services/audit/audit-service";

export type DocumentsActionState = {
  error?: string;
  success?: string;
};

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((value) => value || null);

const templateSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(3, "Informe o nome do modelo.").max(160),
  description: z.string().trim().max(500).optional().or(z.literal("")).transform((value) => value || null),
  legal_basis: z.string().trim().max(1200).optional().or(z.literal("")).transform((value) => value || null),
  content: z.string().trim().min(80, "O modelo precisa ter conteúdo suficiente para emissão.").max(20000),
  accepted_file_name: z.string().trim().max(180).optional().or(z.literal("")).transform((value) => value || null),
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
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
  return { activeClinic, user, access };
}

export async function saveDocumentTemplateAction(
  _state: DocumentsActionState,
  formData: FormData,
): Promise<DocumentsActionState> {
  const parsed = templateSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    description: formData.get("description"),
    legal_basis: formData.get("legal_basis"),
    content: formData.get("content"),
    accepted_file_name: formData.get("accepted_file_name"),
    active: formData.get("active") ? "on" : "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const context = await getContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canEdit && !context.access.canManage) {
    return { error: "Seu perfil não possui permissão para editar modelos." };
  }

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("document_templates")
    .select("*")
    .eq("id", parsed.data.id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!previous) return { error: "Modelo não encontrado." };

  const nextVersion = Number(previous.version_number ?? 1) + 1;
  const payload = {
    name: parsed.data.name,
    description: parsed.data.description,
    legal_basis: parsed.data.legal_basis,
    content: parsed.data.content,
    accepted_file_name: parsed.data.accepted_file_name,
    active: parsed.data.active,
    version_number: nextVersion,
    updated_by: context.user.id,
  };

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
    content: parsed.data.content,
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
