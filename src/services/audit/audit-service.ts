import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { reportServerError } from "@/lib/observability";
import type { PermissionModule } from "@/types/domain";

type AuditPayload = {
  clinicId?: string | null;
  userId?: string | null;
  actionType: string;
  module?: PermissionModule | null;
  recordTable?: string | null;
  recordId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  level?: "info" | "warning" | "critical" | "security";
  notes?: string | null;
};

export async function logAuditEvent(payload: AuditPayload) {
  const admin = createSupabaseAdminClient();
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const { error } = await admin.from("audit_logs").insert({
    clinic_id: payload.clinicId ?? null,
    user_id: payload.userId ?? null,
    action_type: payload.actionType,
    module: payload.module ?? null,
    record_table: payload.recordTable ?? null,
    record_id: payload.recordId ?? null,
    old_values: payload.oldValues ?? null,
    new_values: payload.newValues ?? null,
    ip_address: forwardedFor,
    user_agent: headerStore.get("user-agent"),
    level: payload.level ?? "info",
    notes: payload.notes ?? null,
    created_by: payload.userId ?? null,
    updated_by: payload.userId ?? null,
  });

  if (error) {
    reportServerError("audit.log_event", error, {
      actionType: payload.actionType,
      clinicId: payload.clinicId,
      userId: payload.userId,
      recordTable: payload.recordTable,
      recordId: payload.recordId,
    });
    return { ok: false as const };
  }

  return { ok: true as const };
}
