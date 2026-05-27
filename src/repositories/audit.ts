import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole, PermissionModule } from "@/types/domain";

export type AccessLog = {
  id: string;
  action_type: string;
  created_at: string;
  notes: string | null;
};

export type AuditLogFilters = {
  from?: string;
  to?: string;
  action_type?: string;
  module?: PermissionModule | "all";
  level?: string;
  user_id?: string;
  role?: AppRole | "all";
};

export type AuditLogEntry = {
  id: string;
  clinic_id: string | null;
  user_id: string | null;
  action_type: string;
  module: PermissionModule | null;
  record_table: string | null;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  level: string;
  notes: string | null;
  created_at: string;
  user: {
    id: string;
    full_name: string;
    email: string | null;
    platform_role: AppRole;
  } | null;
};

export async function listCurrentUserAccessLogs(): Promise<AccessLog[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action_type, created_at, notes")
    .eq("user_id", user.id)
    .in("action_type", ["login", "logout", "password_changed", "profile_updated", "preferences_updated", "avatar_uploaded"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return [];
  }

  return data as AccessLog[];
}

export async function listClinicAuditLogs(
  clinicId: string | undefined,
  filters: AuditLogFilters,
): Promise<AuditLogEntry[]> {
  if (!clinicId) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("audit_logs")
    .select(
      "id, clinic_id, user_id, action_type, module, record_table, record_id, old_values, new_values, ip_address, user_agent, level, notes, created_at, user:profiles(id, full_name, email, platform_role)",
    )
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.from) {
    query = query.gte("created_at", new Date(`${filters.from}T00:00:00-03:00`).toISOString());
  }

  if (filters.to) {
    query = query.lte("created_at", new Date(`${filters.to}T23:59:59-03:00`).toISOString());
  }

  if (filters.action_type && filters.action_type !== "all") {
    query = query.eq("action_type", filters.action_type);
  }

  if (filters.module && filters.module !== "all") {
    query = query.eq("module", filters.module);
  }

  if (filters.level && filters.level !== "all") {
    query = query.eq("level", filters.level);
  }

  if (filters.user_id && filters.user_id !== "all") {
    query = query.eq("user_id", filters.user_id);
  }

  const { data, error } = await query;

  if (error) {
    return [];
  }

  const logs = data as unknown as AuditLogEntry[];

  if (filters.role && filters.role !== "all") {
    return logs.filter((log) => log.user?.platform_role === filters.role);
  }

  return logs;
}
