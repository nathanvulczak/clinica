"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/services/audit/audit-service";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";

export type ComplianceActionState = { error?: string; success?: string };

async function getContext() {
  const [{ activeClinic }, supabase] = await Promise.all([getActiveClinicContext(), createSupabaseServerClient()]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!activeClinic || !user) return null;
  return { activeClinic, user, authorization: await getClinicAuthorization(activeClinic.id) };
}

export async function saveComplianceSettingsAction(
  _state: ComplianceActionState,
  formData: FormData,
): Promise<ComplianceActionState> {
  const parsed = z.object({
    retention_days: z.coerce.number().int().min(30).max(3650),
    support_email: z.string().trim().email().optional().or(z.literal("")),
    incident_email: z.string().trim().email().optional().or(z.literal("")),
    responsible_name: z.string().trim().max(160).optional(),
  }).safeParse({
    retention_days: formData.get("retention_days"),
    support_email: formData.get("support_email"),
    incident_email: formData.get("incident_email"),
    responsible_name: formData.get("responsible_name"),
  });
  if (!parsed.success) return { error: "Revise os dados de conformidade e os e-mails informados." };
  const context = await getContext();
  if (!context) return { error: "Selecione uma clínica e autentique-se novamente." };
  if (!context.authorization.can("clinics", "edit")) return { error: "Apenas administradores podem alterar a política da clínica." };
  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin.from("clinic_compliance_settings").select("*").eq("clinic_id", context.activeClinic.id).maybeSingle();
  const payload = { clinic_id: context.activeClinic.id, retention_days: parsed.data.retention_days, support_email: parsed.data.support_email || null, incident_email: parsed.data.incident_email || null, responsible_name: parsed.data.responsible_name || null, updated_by: context.user.id, created_by: previous?.created_by ?? context.user.id };
  const { error } = await admin.from("clinic_compliance_settings").upsert(payload, { onConflict: "clinic_id" });
  if (error) return { error: "Não foi possível salvar a política de conformidade." };
  await logAuditEvent({ clinicId: context.activeClinic.id, userId: context.user.id, actionType: "compliance_settings_updated", module: "clinics", recordTable: "clinic_compliance_settings", recordId: previous?.id ?? context.activeClinic.id, oldValues: previous, newValues: payload, level: "security", notes: "Política de retenção e canais de conformidade atualizados." });
  revalidatePath("/administracao/conformidade");
  revalidatePath("/auditoria");
  return { success: "Política de conformidade salva." };
}

export async function createDataSubjectRequestAction(
  _state: ComplianceActionState,
  formData: FormData,
): Promise<ComplianceActionState> {
  const parsed = z.object({
    request_type: z.enum(["access", "export", "rectification", "deletion", "restriction"]),
    requester_name: z.string().trim().min(2).max(160),
    requester_contact: z.string().trim().min(5).max(180),
    description: z.string().trim().max(1200).optional(),
  }).safeParse({
    request_type: formData.get("request_type"),
    requester_name: formData.get("requester_name"),
    requester_contact: formData.get("requester_contact"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { error: "Informe o titular, o contato e o tipo de solicitação." };
  const context = await getContext();
  if (!context) return { error: "Selecione uma clínica e autentique-se novamente." };
  if (!context.authorization.can("clinics", "edit") && !context.authorization.can("audit", "view")) return { error: "Seu perfil não pode registrar solicitações LGPD." };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("data_subject_requests").insert({ clinic_id: context.activeClinic.id, request_type: parsed.data.request_type, requester_name: parsed.data.requester_name, requester_contact: parsed.data.requester_contact, description: parsed.data.description || null, created_by: context.user.id, updated_by: context.user.id }).select("id").single();
  if (error || !data) return { error: "Não foi possível registrar a solicitação." };
  await logAuditEvent({ clinicId: context.activeClinic.id, userId: context.user.id, actionType: "data_subject_request_created", module: "audit", recordTable: "data_subject_requests", recordId: data.id, newValues: parsed.data, level: "security", notes: "Solicitação de titular registrada para análise." });
  revalidatePath("/administracao/conformidade");
  revalidatePath("/auditoria");
  return { success: "Solicitação registrada para análise." };
}
