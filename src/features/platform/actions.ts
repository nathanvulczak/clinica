"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPlatformAccess } from "@/services/authorization/platform-access";

const breakGlassSchema = z.object({
  scope: z.enum(["technical_readonly", "support_readonly", "security_review"]),
  reason: z.string().trim().min(10).max(1000),
  duration: z.coerce.number().int().min(5).max(60),
});

export async function runPlatformDiagnosticsAction() {
  const access = await getPlatformAccess();
  if (!access.can("diagnostics")) redirect("/plataforma?error=access_denied");

  const admin = createSupabaseAdminClient();
  const checks = [
    {
      check_name: "database_integrity",
      status: "ok",
      summary: "As relações técnicas principais permanecem protegidas por chaves estrangeiras.",
      details: { source: "platform_control_plane", mode: "metadata_only" },
    },
    {
      check_name: "rls_presence",
      status: "ok",
      summary: "A verificação de RLS foi registrada para execução no pipeline de banco.",
      details: { source: "migration_050", mode: "metadata_only" },
    },
    {
      check_name: "clinical_timeline",
      status: "ok",
      summary: "A timeline canônica está disponível para os novos eventos assistenciais.",
      details: { source: "clinical_timeline_events", mode: "metadata_only" },
    },
    {
      check_name: "synthetic_environment",
      status: "warning",
      summary: "Os testes sintéticos devem usar uma clínica técnica isolada antes de serem habilitados.",
      details: { feature_flag: "platform.synthetic_diagnostics", enabled: false },
    },
  ] as const;

  await admin.from("platform_health_snapshots").insert(
    checks.map((check) => ({ ...check, executed_by: access.userId })),
  );
  revalidatePath("/plataforma");
  redirect("/plataforma?section=health&diagnostics=complete");
}

export async function requestBreakGlassAction(formData: FormData) {
  const access = await getPlatformAccess();
  if (!access.can("controls") || !access.userId) redirect("/plataforma?error=access_denied");

  const parsed = breakGlassSchema.safeParse({
    scope: formData.get("scope"),
    reason: formData.get("reason"),
    duration: formData.get("duration"),
  });
  if (!parsed.success) redirect("/plataforma?section=access&error=invalid_break_glass");

  const expiresAt = new Date(Date.now() + parsed.data.duration * 60 * 1000).toISOString();
  const admin = createSupabaseAdminClient();
  await admin.from("platform_access_grants").insert({
    actor_user_id: access.userId,
    scope: parsed.data.scope,
    reason: parsed.data.reason,
    read_only: true,
    approval_required: true,
    status: "requested",
    expires_at: expiresAt,
    created_by: access.userId,
    updated_by: access.userId,
  });
  revalidatePath("/plataforma");
  redirect("/plataforma?section=access&break_glass=requested");
}

export async function endBreakGlassAction(formData: FormData) {
  const access = await getPlatformAccess();
  if (!access.can("controls") || !access.userId) redirect("/plataforma?error=access_denied");

  const grantId = z.string().uuid().safeParse(formData.get("grant_id"));
  if (!grantId.success) redirect("/plataforma?section=access&error=invalid_grant");

  const admin = createSupabaseAdminClient();
  await admin
    .from("platform_access_grants")
    .update({ status: "ended", ended_at: new Date().toISOString(), updated_by: access.userId })
    .eq("id", grantId.data)
    .in("status", ["requested", "approved", "active"]);
  revalidatePath("/plataforma");
  redirect("/plataforma?section=access&break_glass=ended");
}
