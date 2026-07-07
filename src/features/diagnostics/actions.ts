"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDiagnosticsAccess } from "@/repositories/diagnostics";

export type DiagnosticsActionState = { error?: string; success?: string; recordId?: string };

const orderSchema = z.object({
  patient_id: z.string().uuid(), professional_member_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable(), encounter_id: z.string().uuid().nullable(),
  category: z.enum(["laboratory", "imaging", "pathology", "functional", "other"]),
  priority: z.enum(["routine", "urgent", "stat"]),
  clinical_indication: z.string().trim().min(3).max(3000),
  fasting_instructions: z.string().trim().max(1000).nullable(), scheduled_at: z.string().nullable(),
  items: z.array(z.object({ code_system: z.enum(["internal", "tuss", "loinc"]), procedure_code: z.string().trim().max(40).nullable(), name: z.string().trim().min(2).max(180), specimen: z.string().trim().max(120).nullable(), instructions: z.string().trim().max(500).nullable(), sort_order: z.number().int() })).min(1).max(30),
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
