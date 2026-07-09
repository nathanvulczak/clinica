"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDiagnosticsAccess } from "@/repositories/diagnostics";
import { logAuditEvent } from "@/services/audit/audit-service";

export type DiagnosticsActionState = { error?: string; success?: string; recordId?: string };

const MAX_DIAGNOSTIC_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_DIAGNOSTIC_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

const orderSchema = z.object({
  patient_id: z.string().uuid(), professional_member_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable(), encounter_id: z.string().uuid().nullable(),
  category: z.enum(["laboratory", "imaging", "pathology", "functional", "other"]),
  priority: z.enum(["routine", "urgent", "stat"]),
  clinical_indication: z.string().trim().min(3).max(3000),
  fasting_instructions: z.string().trim().max(1000).nullable(), scheduled_at: z.string().nullable(),
  items: z.array(z.object({ code_system: z.enum(["internal", "tuss", "loinc"]), procedure_code: z.string().trim().max(40).nullable(), name: z.string().trim().min(2).max(180), specimen: z.string().trim().max(120).nullable(), instructions: z.string().trim().max(500).nullable(), sort_order: z.number().int() })).min(1).max(30),
});

const attachmentSchema = z.object({
  order_id: z.string().uuid(),
  order_item_id: z.string().uuid().nullable(),
  attachment_type: z.enum(["external_report", "laboratory_pdf", "image", "exam_file", "other"]),
  title: z.string().trim().min(2).max(160),
  notes: z.string().trim().max(1000).nullable(),
});

async function context() {
  const [{ activeClinic }, supabase] = await Promise.all([getActiveClinicContext(), createSupabaseServerClient()]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!activeClinic || !user) return null;
  return { activeClinic, user, supabase, access: await getDiagnosticsAccess(activeClinic.id) };
}

function diagnosticError(message?: string) {
  const value = message?.toUpperCase() ?? "";
  if (value.includes("PERMISSION")) return "Seu perfil não possui permissão para esta etapa diagnóstica.";
  if (value.includes("PATIENT")) return "O paciente selecionado não pertence à clínica ativa.";
  if (value.includes("PROFESSIONAL")) return "O profissional selecionado não está disponível.";
  if (value.includes("MISMATCH")) return "Consulta, paciente e profissional não pertencem ao mesmo atendimento.";
  if (value.includes("ITEMS_REQUIRED")) return "Inclua ao menos um exame no pedido.";
  if (value.includes("INVALID_TRANSITION")) return "A mudança de etapa não é permitida neste momento.";
  if (value.includes("REASON_REQUIRED")) return "Informe um motivo com pelo menos 5 caracteres.";
  if (value.includes("APPROVAL_REQUIRED")) return "A validação definitiva exige permissão de aprovação.";
  return "Não foi possível concluir a operação diagnóstica.";
}

export async function createDiagnosticOrderAction(_: DiagnosticsActionState, formData: FormData): Promise<DiagnosticsActionState> {
  let items: unknown = [];
  try { items = JSON.parse(String(formData.get("items") ?? "[]")); } catch { return { error: "A lista de exames está inválida." }; }
  const raw = {
    patient_id: formData.get("patient_id"), professional_member_id: formData.get("professional_member_id"),
    appointment_id: formData.get("appointment_id") || null, encounter_id: formData.get("encounter_id") || null,
    category: formData.get("category"), priority: formData.get("priority"), clinical_indication: formData.get("clinical_indication"),
    fasting_instructions: formData.get("fasting_instructions") || null, scheduled_at: formData.get("scheduled_at") || null, items,
  };
  const parsed = orderSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise os dados do pedido." };
  const ctx = await context(); if (!ctx) return { error: "Selecione uma clínica e faça login novamente." };
  const { data, error } = await ctx.supabase.rpc("create_diagnostic_order_transaction", { order_payload: { clinic_id: ctx.activeClinic.id, ...parsed.data, status: "requested" } });
  if (error || !data) return { error: diagnosticError(error?.message) };
  revalidatePath("/exames"); revalidatePath("/prontuarios");
  return { success: "Pedido criado e incluído na central diagnóstica.", recordId: data as string };
}

export async function transitionDiagnosticOrderAction(_: DiagnosticsActionState, formData: FormData): Promise<DiagnosticsActionState> {
  const parsed = z.object({ order_id: z.string().uuid(), next_status: z.string().min(2), reason: z.string().trim().max(500).nullable() }).safeParse({ order_id: formData.get("order_id"), next_status: formData.get("next_status"), reason: formData.get("reason") || null });
  if (!parsed.success) return { error: "Etapa diagnóstica inválida." };
  const ctx = await context(); if (!ctx) return { error: "Sessão inválida." };
  const { error } = await ctx.supabase.rpc("transition_diagnostic_order_transaction", { order_uuid: parsed.data.order_id, next_status: parsed.data.next_status, transition_reason: parsed.data.reason });
  if (error) return { error: diagnosticError(error.message) };
  revalidatePath("/exames"); return { success: "Etapa atualizada com rastreabilidade." };
}

export async function markDiagnosticOrderDeliveredAction(_: DiagnosticsActionState, formData: FormData): Promise<DiagnosticsActionState> {
  const parsed = z.object({ order_id: z.string().uuid() }).safeParse({ order_id: formData.get("order_id") });
  if (!parsed.success) return { error: "Pedido diagnostico invalido." };
  const ctx = await context(); if (!ctx) return { error: "Sessao invalida." };
  if (!ctx.access.canEdit && !ctx.access.canManage) return { error: "Seu perfil nao pode registrar entrega de solicitacao." };

  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("diagnostic_orders")
    .select("id, clinic_id, order_number, status, request_delivered_at, metadata")
    .eq("id", parsed.data.order_id)
    .eq("clinic_id", ctx.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!order) return { error: "Pedido nao encontrado." };

  const now = new Date().toISOString();
  await Promise.all([
    admin
      .from("diagnostic_orders")
      .update({
        request_delivered_at: now,
        request_delivered_by: ctx.user.id,
        metadata: {
          ...((order.metadata && typeof order.metadata === "object") ? order.metadata : {}),
          request_delivery_source: "manual_confirmation",
        },
        updated_by: ctx.user.id,
      })
      .eq("id", order.id),
    admin.from("diagnostic_order_events").insert({
      clinic_id: ctx.activeClinic.id,
      order_id: order.id,
      event_type: "request_delivered",
      previous_status: order.status,
      next_status: order.status,
      details: { order_number: order.order_number },
      created_by: ctx.user.id,
    }),
    logAuditEvent({
      clinicId: ctx.activeClinic.id,
      userId: ctx.user.id,
      actionType: "diagnostic_request_delivered",
      module: "diagnostics",
      recordTable: "diagnostic_orders",
      recordId: order.id,
      oldValues: { request_delivered_at: order.request_delivered_at },
      newValues: { request_delivered_at: now },
      level: "security",
      notes: "Solicitacao de exame marcada como entregue ao paciente.",
    }),
  ]);

  revalidatePath("/exames"); revalidatePath("/prontuarios");
  return { success: "Solicitacao marcada como entregue ao paciente." };
}

export async function uploadDiagnosticAttachmentAction(_: DiagnosticsActionState, formData: FormData): Promise<DiagnosticsActionState> {
  const parsed = attachmentSchema.safeParse({
    order_id: formData.get("order_id"),
    order_item_id: formData.get("order_item_id") || null,
    attachment_type: formData.get("attachment_type"),
    title: formData.get("title"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Anexo diagnostico invalido." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo para anexar." };
  if (file.size > MAX_DIAGNOSTIC_ATTACHMENT_SIZE) return { error: "O arquivo deve ter no maximo 10 MB." };
  if (!ALLOWED_DIAGNOSTIC_ATTACHMENT_TYPES.has(file.type)) return { error: "Formato nao permitido. Use PDF, JPG, PNG, WEBP ou TXT." };

  const ctx = await context(); if (!ctx) return { error: "Sessao invalida." };
  if (!ctx.access.canEdit && !ctx.access.canManage) return { error: "Seu perfil nao pode anexar resultados diagnosticos." };

  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("diagnostic_orders")
    .select("id, clinic_id, patient_id, encounter_id, professional_member_id, status, order_number")
    .eq("id", parsed.data.order_id)
    .eq("clinic_id", ctx.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!order) return { error: "Pedido diagnostico nao encontrado." };

  if (parsed.data.order_item_id) {
    const { data: item } = await admin
      .from("diagnostic_order_items")
      .select("id")
      .eq("id", parsed.data.order_item_id)
      .eq("order_id", order.id)
      .eq("clinic_id", ctx.activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!item) return { error: "Exame selecionado nao pertence ao pedido." };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const filePath = `${ctx.activeClinic.id}/${order.patient_id}/diagnostics/${order.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await admin.storage
    .from("clinical-attachments")
    .upload(filePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) return { error: "Nao foi possivel enviar o arquivo." };

  const payload = {
    clinic_id: ctx.activeClinic.id,
    order_id: order.id,
    order_item_id: parsed.data.order_item_id,
    patient_id: order.patient_id,
    encounter_id: order.encounter_id,
    professional_member_id: order.professional_member_id,
    attachment_type: parsed.data.attachment_type,
    title: parsed.data.title,
    notes: parsed.data.notes,
    file_name: file.name,
    file_path: filePath,
    mime_type: file.type,
    file_size: file.size,
    created_by: ctx.user.id,
    updated_by: ctx.user.id,
  };

  const { data: attachment, error } = await admin
    .from("diagnostic_attachments")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();
  if (error || !attachment) {
    await admin.storage.from("clinical-attachments").remove([filePath]);
    return { error: "Arquivo enviado, mas nao foi possivel registrar o laudo." };
  }

  const nextStatus = order.status === "completed" ? order.status : "partial";
  await Promise.all([
    admin.from("diagnostic_orders").update({ status: nextStatus, updated_by: ctx.user.id }).eq("id", order.id),
    admin.from("diagnostic_order_events").insert({
      clinic_id: ctx.activeClinic.id,
      order_id: order.id,
      event_type: "external_result_attached",
      previous_status: order.status,
      next_status: nextStatus,
      details: { attachment_id: attachment.id, file_name: file.name, order_number: order.order_number },
      created_by: ctx.user.id,
    }),
    logAuditEvent({
      clinicId: ctx.activeClinic.id,
      userId: ctx.user.id,
      actionType: "diagnostic_attachment_uploaded",
      module: "diagnostics",
      recordTable: "diagnostic_attachments",
      recordId: attachment.id,
      newValues: payload,
      level: "security",
      notes: "Laudo/arquivo externo anexado ao pedido diagnostico.",
    }),
  ]);

  revalidatePath("/exames"); revalidatePath("/prontuarios");
  return { success: "Laudo externo anexado ao pedido.", recordId: attachment.id };
}

export async function saveDiagnosticResultAction(_: DiagnosticsActionState, formData: FormData): Promise<DiagnosticsActionState> {
  const parsed = z.object({ order_item_id: z.string().uuid(), status: z.enum(["preliminary", "final"]), value_text: z.string().trim().max(1000).nullable(), value_numeric: z.preprocess((value) => value === null || value === "" ? null : value, z.coerce.number().nullable()), unit: z.string().trim().max(40).nullable(), reference_range: z.string().trim().max(120).nullable(), flag: z.enum(["normal", "low", "high", "critical", "indeterminate"]), interpretation: z.string().trim().max(3000).nullable(), report_text: z.string().trim().max(12000).nullable(), correction_reason: z.string().trim().max(500).nullable() }).safeParse({ order_item_id: formData.get("order_item_id"), status: formData.get("status"), value_text: formData.get("value_text") || null, value_numeric: formData.get("value_numeric") || null, unit: formData.get("unit") || null, reference_range: formData.get("reference_range") || null, flag: formData.get("flag"), interpretation: formData.get("interpretation") || null, report_text: formData.get("report_text") || null, correction_reason: formData.get("correction_reason") || null });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Resultado inválido." };
  const ctx = await context(); if (!ctx) return { error: "Sessão inválida." };
  const { data, error } = await ctx.supabase.rpc("save_diagnostic_result_transaction", { result_payload: parsed.data });
  if (error || !data) return { error: diagnosticError(error?.message) };
  revalidatePath("/exames"); revalidatePath("/prontuarios");
  return { success: parsed.data.status === "final" ? "Resultado validado e integrado ao histórico clínico." : "Resultado preliminar salvo.", recordId: data as string };
}

export async function saveDiagnosticsPreferencesAction(_: DiagnosticsActionState, formData: FormData): Promise<DiagnosticsActionState> {
  const ctx = await context(); if (!ctx) return { error: "Sessão inválida." };
  const preferences = { defaultSection: String(formData.get("default_section") || "overview"), density: String(formData.get("density") || "compact"), savedStatus: String(formData.get("saved_status") || "all"), highlightCritical: formData.get("highlight_critical") === "on", autoOpenResult: formData.get("auto_open_result") === "on" };
  const { error } = await ctx.supabase.rpc("save_module_user_preferences", { module_name: "diagnostics", preference_payload: { clinic_id: ctx.activeClinic.id, preferences } });
  if (error) return { error: "Não foi possível salvar suas preferências." };
  revalidatePath("/exames"); return { success: "Preferências pessoais salvas." };
}
