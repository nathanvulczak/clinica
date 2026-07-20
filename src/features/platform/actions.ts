"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getPlatformAccess } from "@/services/authorization/platform-access";
import { syncUserSubscriptionFromStripe } from "@/services/billing/stripe-sync";

export type PlatformLoginState = { error?: string };
export type PlatformMfaState = { error?: string; mode?: "setup" | "verify"; factorId?: string; qrCode?: string; secret?: string };

const reasonSchema = z.string().trim().min(10, "Informe um motivo com pelo menos 10 caracteres.").max(1000);
const idSchema = z.string().uuid();
const breakGlassSchema = z.object({
  scope: z.enum(["technical_readonly", "support_readonly", "security_review"]),
  reason: reasonSchema,
  duration: z.coerce.number().int().min(5).max(60),
  target_clinic_id: z.string().uuid().optional().or(z.literal("")),
});

async function requirePlatform(scope: Parameters<NonNullable<Awaited<ReturnType<typeof getPlatformAccess>>["can"]>>[0]) {
  const access = await getPlatformAccess();
  if (!access.userId || !access.can(scope)) {
    redirect("/console/login?error=access_denied");
  }
  return access;
}

async function requireOwner() {
  const access = await getPlatformAccess();
  if (!access.userId || access.role !== "owner") {
    redirect("/console?error=owner_required");
  }
  return access;
}

async function logOperation({
  operatorUserId,
  actionType,
  targetClinicId,
  targetUserId,
  reason,
  oldValues,
  newValues,
  status = "completed",
  errorMessage,
}: {
  operatorUserId: string;
  actionType: string;
  targetClinicId?: string | null;
  targetUserId?: string | null;
  reason: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  status?: string;
  errorMessage?: string | null;
}) {
  const admin = createSupabaseAdminClient();
  await admin.from("platform_operations").insert({
    operator_user_id: operatorUserId,
    action_type: actionType,
    target_clinic_id: targetClinicId ?? null,
    target_user_id: targetUserId ?? null,
    reason,
    old_values: oldValues ?? null,
    new_values: newValues ?? null,
    status,
    error_message: errorMessage ?? null,
  });
}

export async function platformLoginAction(_state: PlatformLoginState, formData: FormData): Promise<PlatformLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Informe e-mail e senha." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Acesso de proprietário inválido." };

  const access = await getPlatformAccess();
  if (!access.allowed || !access.userId) {
    await supabase.auth.signOut();
    return { error: "Esta conta não possui acesso ao Console do Proprietário." };
  }

  if (access.mfaRequired) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!access.mfaEnrolled) redirect("/console/mfa?setup=required");
    if (aal?.currentLevel !== "aal2") redirect("/console/mfa?verify=required");
  }

  const admin = createSupabaseAdminClient();
  await admin.from("platform_operators").update({ last_login_at: new Date().toISOString() }).eq("user_id", access.userId);
  await logOperation({
    operatorUserId: access.userId,
    actionType: "platform_login",
    reason: "Login no Console do Proprietário.",
  });
  redirect("/console");
}

export async function preparePlatformMfaAction(): Promise<PlatformMfaState> {
  const access = await getPlatformAccess();
  if (!access.allowed || !access.userId) return { error: "Sessão técnica inválida." };
  const supabase = await createSupabaseServerClient();
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) return { error: "Não foi possível consultar a autenticação multifator." };
  const verified = factors.totp.find((factor) => factor.status === "verified");
  if (verified) return { mode: "verify", factorId: verified.id };

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "CliniCore Console" });
  if (error || !data) return { error: "Não foi possível iniciar a configuração do MFA." };
  return { mode: "setup", factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyPlatformMfaAction(_state: PlatformMfaState, formData: FormData): Promise<PlatformMfaState> {
  const access = await getPlatformAccess();
  if (!access.allowed || !access.userId) return { error: "Sessão técnica inválida." };
  const factorId = idSchema.safeParse(formData.get("factor_id"));
  const code = z.string().regex(/^\d{6}$/, "Informe o código de 6 dígitos.").safeParse(String(formData.get("code") ?? ""));
  if (!factorId.success || !code.success) return { error: "Informe o código de 6 dígitos do autenticador." };

  const supabase = await createSupabaseServerClient();
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factorId.data });
  if (challengeError || !challenge) return { error: "Não foi possível iniciar o desafio MFA." };
  const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: factorId.data, challengeId: challenge.id, code: code.data });
  if (verifyError) return { error: "Código MFA inválido ou expirado." };

  const admin = createSupabaseAdminClient();
  await admin.from("platform_operators").update({ mfa_enrolled: true, updated_at: new Date().toISOString() }).eq("user_id", access.userId);
  await logOperation({ operatorUserId: access.userId, actionType: "platform_mfa_verified", reason: "MFA TOTP confirmado no Console do Proprietário." });
  redirect("/console");
}

export async function platformSignOutAction() {
  const supabase = await createSupabaseServerClient();
  const access = await getPlatformAccess();
  if (access.userId) {
    await logOperation({ operatorUserId: access.userId, actionType: "platform_logout", reason: "Logout do Console do Proprietário." });
  }
  await supabase.auth.signOut();
  redirect("/console/login");
}

export async function runPlatformDiagnosticsAction() {
  const access = await requirePlatform("diagnostics");
  const admin = createSupabaseAdminClient();
  const checks: Array<{ check_name: string; status: "ok" | "warning" | "error"; summary: string; details: Record<string, unknown> }> = [];

  const { count: clinicsCount, error: clinicError } = await admin.from("clinics").select("id", { count: "exact", head: true }).is("deleted_at", null);
  checks.push({
    check_name: "supabase_database",
    status: clinicError ? "error" : "ok",
    summary: clinicError ? "Não foi possível consultar a base técnica." : "Conexão com o banco e leitura administrativa funcionando.",
    details: { source: "clinics_count", clinics_count: clinicsCount ?? 0 },
  });

  const { data: usage, error: usageError } = await admin.rpc("platform_collect_usage_snapshot");
  checks.push({
    check_name: "database_usage",
    status: usageError ? "error" : "ok",
    summary: usageError ? "Não foi possível coletar o uso agregado do banco." : "Uso agregado do banco coletado sem conteúdo clínico.",
    details: usageError ? { error_code: "usage_snapshot_failed" } : { source: "platform_usage_snapshots", metrics_available: Boolean(usage) },
  });

  try {
    const balance = await getStripe().balance.retrieve();
    checks.push({
      check_name: "stripe_api",
      status: "ok",
      summary: "API Stripe respondeu corretamente.",
      details: { livemode: balance.livemode, source: "stripe_balance" },
    });
  } catch {
    checks.push({
      check_name: "stripe_api",
      status: "error",
      summary: "Não foi possível consultar a API Stripe.",
      details: { error_code: "stripe_health_failed" },
    });
  }

  const { error: rlsError } = await admin.from("platform_health_snapshots").select("id", { head: true, count: "exact" });
  checks.push({
    check_name: "platform_control_plane",
    status: rlsError ? "error" : "ok",
    summary: rlsError ? "Não foi possível consultar o registro de saúde." : "Tabelas técnicas do console disponíveis.",
    details: { source: "platform_health_snapshots", mode: "metadata_only" },
  });

  await admin.from("platform_health_snapshots").insert(checks.map((check) => ({ ...check, executed_by: access.userId })));
  await logOperation({ operatorUserId: access.userId!, actionType: "platform_diagnostics_run", reason: "Verificação manual de saúde técnica." });
  revalidatePath("/console");
  redirect("/console?section=health&diagnostics=complete");
}

export async function setClinicPlatformStatusAction(formData: FormData) {
  const access = await requireOwner();
  const clinicId = idSchema.safeParse(formData.get("clinic_id"));
  const status = z.enum(["active", "suspended"]).safeParse(formData.get("status"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!clinicId.success || !status.success || !reason.success) redirect("/console?error=invalid_operation");

  const admin = createSupabaseAdminClient();
  const { data: clinic } = await admin.from("clinics").select("platform_status, trade_name, legal_name").eq("id", clinicId.data).maybeSingle();
  if (!clinic) redirect("/console?error=clinic_not_found");

  const nextValues = status.data === "suspended"
    ? { platform_status: "suspended", platform_suspended_at: new Date().toISOString(), platform_suspended_by: access.userId, platform_suspension_reason: reason.data }
    : { platform_status: "active", platform_suspended_at: null, platform_suspended_by: null, platform_suspension_reason: null };
  await admin.from("clinics").update(nextValues).eq("id", clinicId.data);
  await logOperation({
    operatorUserId: access.userId!,
    actionType: status.data === "suspended" ? "clinic_suspended" : "clinic_reactivated",
    targetClinicId: clinicId.data,
    reason: reason.data,
    oldValues: { status: clinic.platform_status },
    newValues: { status: status.data },
  });
  revalidatePath("/console");
  redirect(`/console?section=operations&operation=${status.data === "suspended" ? "suspended" : "reactivated"}`);
}

export async function updateClinicLimitsAction(formData: FormData) {
  const access = await requireOwner();
  const clinicId = idSchema.safeParse(formData.get("clinic_id"));
  const parsed = z.object({
    max_active_users: z.coerce.number().int().min(1).max(10000),
    max_active_professionals: z.coerce.number().int().min(1).max(10000),
    max_active_patients: z.coerce.number().int().min(1).max(10000000),
    reason: reasonSchema,
  }).safeParse({
    max_active_users: formData.get("max_active_users"),
    max_active_professionals: formData.get("max_active_professionals"),
    max_active_patients: formData.get("max_active_patients"),
    reason: formData.get("reason"),
  });
  if (!clinicId.success || !parsed.success) redirect("/console?error=invalid_limits");

  const admin = createSupabaseAdminClient();
  const { data: oldLimits } = await admin.from("platform_clinic_limits").select("max_active_users, max_active_professionals, max_active_patients").eq("clinic_id", clinicId.data).maybeSingle();
  const values = {
    clinic_id: clinicId.data,
    max_active_users: parsed.data.max_active_users,
    max_active_professionals: parsed.data.max_active_professionals,
    max_active_patients: parsed.data.max_active_patients,
    updated_by: access.userId,
  };
  await admin.from("platform_clinic_limits").upsert(values, { onConflict: "clinic_id" });
  await logOperation({ operatorUserId: access.userId!, actionType: "clinic_limits_updated", targetClinicId: clinicId.data, reason: parsed.data.reason, oldValues: oldLimits, newValues: values });
  revalidatePath("/console");
  redirect("/console?section=operations&operation=limits_updated");
}

export async function setPlatformUserStatusAction(formData: FormData) {
  const access = await requireOwner();
  const userId = idSchema.safeParse(formData.get("user_id"));
  const status = z.enum(["active", "suspended"]).safeParse(formData.get("status"));
  const reason = reasonSchema.safeParse(formData.get("reason"));
  if (!userId.success || !status.success || !reason.success || userId.data === access.userId) redirect("/console?error=invalid_user_operation");

  const admin = createSupabaseAdminClient();
  const { data: operator } = await admin.from("platform_operators").select("role, status").eq("user_id", userId.data).maybeSingle();
  if (operator?.role === "owner" && operator.status === "active") redirect("/console?error=owner_protected");

  const { data: profile } = await admin.from("profiles").select("platform_account_status").eq("id", userId.data).maybeSingle();
  if (!profile) redirect("/console?error=user_not_found");

  const nextValues = status.data === "suspended"
    ? { platform_account_status: "suspended", platform_suspended_at: new Date().toISOString(), platform_suspended_by: access.userId, platform_suspension_reason: reason.data }
    : { platform_account_status: "active", platform_suspended_at: null, platform_suspended_by: null, platform_suspension_reason: null };
  const { error: authError } = await admin.auth.admin.updateUserById(userId.data, { ban_duration: status.data === "suspended" ? "876000h" : "none" });
  if (authError) {
    await logOperation({ operatorUserId: access.userId!, actionType: status.data === "suspended" ? "user_suspended" : "user_reactivated", targetUserId: userId.data, reason: reason.data, status: "failed", errorMessage: authError.message });
    redirect("/console?section=operations&error=user_status_update_failed");
  }
  const { error: profileError } = await admin.from("profiles").update(nextValues).eq("id", userId.data);
  if (profileError) {
    await admin.auth.admin.updateUserById(userId.data, { ban_duration: "none" });
    await logOperation({ operatorUserId: access.userId!, actionType: status.data === "suspended" ? "user_suspended" : "user_reactivated", targetUserId: userId.data, reason: reason.data, status: "failed", errorMessage: profileError.message });
    redirect("/console?section=operations&error=user_status_update_failed");
  }
  await logOperation({ operatorUserId: access.userId!, actionType: status.data === "suspended" ? "user_suspended" : "user_reactivated", targetUserId: userId.data, reason: reason.data, oldValues: { status: profile.platform_account_status }, newValues: { status: status.data } });
  revalidatePath("/console");
  redirect(`/console?section=operations&operation=${status.data === "suspended" ? "user_suspended" : "user_reactivated"}`);
}

export async function resolvePlatformErrorAction(formData: FormData) {
  const access = await requirePlatform("errors");
  const errorId = idSchema.safeParse(formData.get("error_id"));
  if (!errorId.success) redirect("/console?error=invalid_error");
  const admin = createSupabaseAdminClient();
  await admin.from("platform_error_events").update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: access.userId }).eq("id", errorId.data).in("status", ["open", "acknowledged"]);
  await logOperation({ operatorUserId: access.userId!, actionType: "platform_error_resolved", reason: "Erro técnico marcado como resolvido.", newValues: { error_id: errorId.data, status: "resolved" } });
  revalidatePath("/console");
  redirect("/console?section=errors&operation=error_resolved");
}

export async function syncPlatformSubscriptionAction(formData: FormData) {
  const access = await requireOwner();
  const ownerUserId = idSchema.safeParse(formData.get("owner_user_id"));
  if (!ownerUserId.success) redirect("/console?error=invalid_subscription_owner");
  try {
    await syncUserSubscriptionFromStripe({ ownerUserId: ownerUserId.data });
    await logOperation({ operatorUserId: access.userId!, actionType: "subscription_resync", targetUserId: ownerUserId.data, reason: "Sincronização manual de assinatura Stripe." });
    revalidatePath("/console");
    redirect("/console?section=billing&operation=subscription_synced");
  } catch {
    await logOperation({ operatorUserId: access.userId!, actionType: "subscription_resync", targetUserId: ownerUserId.data, reason: "Falha na sincronização manual de assinatura Stripe.", status: "failed", errorMessage: "subscription_sync_failed" });
    redirect("/console?section=billing&error=subscription_sync_failed");
  }
}

export async function requestBreakGlassAction(formData: FormData) {
  const access = await requirePlatform("security");
  const parsed = breakGlassSchema.safeParse({
    scope: formData.get("scope"),
    reason: formData.get("reason"),
    duration: formData.get("duration"),
    target_clinic_id: formData.get("target_clinic_id"),
  });
  if (!parsed.success) redirect("/console?section=security&error=invalid_break_glass");

  const expiresAt = new Date(Date.now() + parsed.data.duration * 60 * 1000).toISOString();
  const admin = createSupabaseAdminClient();
  await admin.from("platform_access_grants").insert({
    actor_user_id: access.userId,
    target_clinic_id: parsed.data.target_clinic_id || null,
    scope: parsed.data.scope,
    reason: parsed.data.reason,
    read_only: true,
    approval_required: true,
    status: "requested",
    expires_at: expiresAt,
    created_by: access.userId,
    updated_by: access.userId,
  });
  await logOperation({ operatorUserId: access.userId!, actionType: "break_glass_requested", targetClinicId: parsed.data.target_clinic_id || null, reason: parsed.data.reason, newValues: { scope: parsed.data.scope, duration_minutes: parsed.data.duration, read_only: true, approval_required: true } });
  revalidatePath("/console");
  redirect("/console?section=security&operation=break_glass_requested");
}

export async function approveBreakGlassAction(formData: FormData) {
  const access = await requirePlatform("security");
  const grantId = idSchema.safeParse(formData.get("grant_id"));
  if (!grantId.success) redirect("/console?error=invalid_grant");
  const admin = createSupabaseAdminClient();
  const { data: grant } = await admin.from("platform_access_grants").select("actor_user_id, status").eq("id", grantId.data).maybeSingle();
  if (!grant || grant.status !== "requested" || grant.actor_user_id === access.userId) redirect("/console?section=security&error=approval_not_allowed");
  await admin.from("platform_access_grants").update({ status: "approved", approved_by: access.userId, updated_by: access.userId }).eq("id", grantId.data).eq("status", "requested");
  await logOperation({ operatorUserId: access.userId!, actionType: "break_glass_approved", reason: "Solicitação de acesso emergencial aprovada por segundo operador.", newValues: { grant_id: grantId.data, status: "approved", read_only: true } });
  revalidatePath("/console");
  redirect("/console?section=security&operation=break_glass_approved");
}

export async function endBreakGlassAction(formData: FormData) {
  const access = await requirePlatform("security");
  const grantId = idSchema.safeParse(formData.get("grant_id"));
  if (!grantId.success) redirect("/console?error=invalid_grant");
  const admin = createSupabaseAdminClient();
  await admin.from("platform_access_grants").update({ status: "ended", ended_at: new Date().toISOString(), updated_by: access.userId }).eq("id", grantId.data).in("status", ["requested", "approved", "active"]);
  await logOperation({ operatorUserId: access.userId!, actionType: "break_glass_ended", reason: "Solicitação de acesso emergencial encerrada.", newValues: { grant_id: grantId.data, status: "ended" } });
  revalidatePath("/console");
  redirect("/console?section=security&operation=break_glass_ended");
}
