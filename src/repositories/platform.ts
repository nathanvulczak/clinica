import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPlatformAccess } from "@/services/authorization/platform-access";
import type { PlatformOperatorRole } from "@/types/domain";

export type PlatformClinic = {
  id: string;
  name: string;
  status: "active" | "suspended";
  created_at: string;
  active_users: number;
  active_professionals: number;
  active_patients: number;
  limits: { max_active_users: number; max_active_professionals: number; max_active_patients: number };
};

export type PlatformSnapshot = {
  metrics: {
    activeClinics: number;
    suspendedClinics: number;
    users: number;
    activeMemberships: number;
    activeSubscriptions: number;
    openErrors: number;
    errors24h: number;
    databaseBytes: number | null;
  };
  clinics: PlatformClinic[];
  users: Array<{ id: string; name: string; email: string | null; created_at: string; memberships: number; accountStatus: "active" | "suspended"; operatorRole: PlatformOperatorRole | null }>;
  subscriptions: Array<{ owner_user_id: string; plan_slug: string; status: string; current_period_end: string | null; updated_at: string }>;
  migrations: Array<{ migration_name: string; applied_at: string; source: string }>;
  health: Array<{ id: string; check_name: string; status: string; summary: string; created_at: string }>;
  errors: Array<{ id: string; source: string; error_code: string; severity: string; status: string; message: string; route: string | null; occurred_at: string; clinic_name: string | null }>;
  usage: Array<{ id: string; collected_at: string; metrics: Record<string, unknown> }>;
  operations: Array<{ id: string; action_type: string; reason: string; status: string; target_clinic_id: string | null; created_at: string }>;
  grants: Array<{ id: string; scope: string; status: string; reason: string; expires_at: string; target_clinic_id: string | null; actor_user_id: string; approved_by: string | null; created_at: string }>;
};

const emptySnapshot: PlatformSnapshot = {
  metrics: { activeClinics: 0, suspendedClinics: 0, users: 0, activeMemberships: 0, activeSubscriptions: 0, openErrors: 0, errors24h: 0, databaseBytes: null },
  clinics: [],
  users: [],
  subscriptions: [],
  migrations: [],
  health: [],
  errors: [],
  usage: [],
  operations: [],
  grants: [],
};

export async function getPlatformSnapshot(): Promise<PlatformSnapshot> {
  const access = await getPlatformAccess();
  if (!access.allowed) return emptySnapshot;

  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [activeClinics, suspendedClinics, users, memberships, subscriptions, openErrors, errors24h, clinics, profiles, memberRows, operators, limits, migrations, health, errors, usage, operations, grants, subscriptionRows] = await Promise.all([
    admin.from("clinics").select("id", { count: "exact", head: true }).eq("platform_status", "active").is("deleted_at", null),
    admin.from("clinics").select("id", { count: "exact", head: true }).eq("platform_status", "suspended").is("deleted_at", null),
    admin.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
    admin.from("clinic_members").select("id", { count: "exact", head: true }).eq("status", "active").is("deleted_at", null),
    admin.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing", "past_due"]).is("deleted_at", null),
    admin.from("platform_error_events").select("id", { count: "exact", head: true }).in("status", ["open", "acknowledged"]),
    admin.from("platform_error_events").select("id", { count: "exact", head: true }).gte("occurred_at", since),
    admin.from("clinics").select("id, trade_name, legal_name, platform_status, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
    admin.from("profiles").select("id, full_name, email, created_at, platform_account_status").is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
    admin.from("clinic_members").select("user_id, clinic_id, status").in("status", ["active", "invited"]).is("deleted_at", null).limit(10000),
    admin.from("platform_operators").select("user_id, role, status"),
    admin.from("platform_clinic_limits").select("clinic_id, max_active_users, max_active_professionals, max_active_patients"),
    admin.from("app_migration_history").select("migration_name, applied_at, source").order("applied_at", { ascending: false }).limit(30),
    admin.from("platform_health_snapshots").select("id, check_name, status, summary, created_at").order("created_at", { ascending: false }).limit(30),
    admin.from("platform_error_events").select("id, source, error_code, severity, status, message, route, occurred_at, clinic_id, clinics:clinics!platform_error_events_clinic_id_fkey(trade_name, legal_name)").order("occurred_at", { ascending: false }).limit(100),
    admin.from("platform_usage_snapshots").select("id, collected_at, metrics").order("collected_at", { ascending: false }).limit(20),
    admin.from("platform_operations").select("id, action_type, reason, status, target_clinic_id, created_at").order("created_at", { ascending: false }).limit(60),
    admin.from("platform_access_grants").select("id, scope, status, reason, expires_at, target_clinic_id, actor_user_id, approved_by, created_at").order("created_at", { ascending: false }).limit(30),
    admin.from("subscriptions").select("owner_user_id, plan_slug, status, current_period_end, updated_at").is("deleted_at", null).order("updated_at", { ascending: false }).limit(100),
  ]);

  const clinicRows = clinics.data ?? [];
  const memberData = memberRows.data ?? [];
  const limitMap = new Map((limits.data ?? []).map((item) => [item.clinic_id, item]));
  const operatorMap = new Map((operators.data ?? []).map((item) => [item.user_id, item.status === "active" ? item.role as PlatformOperatorRole : null]));
  const membershipCount = new Map<string, number>();
  for (const item of memberData) membershipCount.set(item.user_id, (membershipCount.get(item.user_id) ?? 0) + 1);

  const clinicCounts = await Promise.all(clinicRows.map(async (clinic) => {
    const [userCount, professionalCount, patientCount] = await Promise.all([
      admin.from("clinic_members").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id).in("status", ["active", "invited"]).is("deleted_at", null),
      admin.from("clinic_members").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id).in("role", ["doctor", "nurse", "professional"]).in("status", ["active", "invited"]).is("deleted_at", null),
      admin.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id).is("deleted_at", null),
    ]);
    const configured = limitMap.get(clinic.id);
    return {
      id: clinic.id,
      name: clinic.trade_name || clinic.legal_name,
      status: clinic.platform_status as "active" | "suspended",
      created_at: clinic.created_at,
      active_users: userCount.count ?? 0,
      active_professionals: professionalCount.count ?? 0,
      active_patients: patientCount.count ?? 0,
      limits: {
        max_active_users: configured?.max_active_users ?? 25,
        max_active_professionals: configured?.max_active_professionals ?? 10,
        max_active_patients: configured?.max_active_patients ?? 10000,
      },
    } satisfies PlatformClinic;
  }));

  const latestUsage = (usage.data?.[0]?.metrics ?? null) as Record<string, unknown> | null;
  const clinicName = (item: { clinics?: { trade_name?: string | null; legal_name?: string | null } | null }) => item.clinics?.trade_name || item.clinics?.legal_name || null;

  return {
    metrics: {
      activeClinics: activeClinics.count ?? 0,
      suspendedClinics: suspendedClinics.count ?? 0,
      users: users.count ?? 0,
      activeMemberships: memberships.count ?? 0,
      activeSubscriptions: subscriptions.count ?? 0,
      openErrors: openErrors.count ?? 0,
      errors24h: errors24h.count ?? 0,
      databaseBytes: typeof latestUsage?.database_bytes === "number" ? latestUsage.database_bytes : null,
    },
    clinics: clinicCounts,
    users: (profiles.data ?? []).map((item) => ({ id: item.id, name: item.full_name, email: item.email, created_at: item.created_at, memberships: membershipCount.get(item.id) ?? 0, accountStatus: item.platform_account_status as "active" | "suspended", operatorRole: operatorMap.get(item.id) ?? null })),
    subscriptions: (subscriptionRows.data ?? []) as PlatformSnapshot["subscriptions"],
    migrations: (migrations.data ?? []) as PlatformSnapshot["migrations"],
    health: (health.data ?? []) as PlatformSnapshot["health"],
    errors: (errors.data ?? []).map((item) => ({ id: item.id, source: item.source, error_code: item.error_code, severity: item.severity, status: item.status, message: item.message, route: item.route, occurred_at: item.occurred_at, clinic_name: clinicName(item as never) })),
    usage: (usage.data ?? []) as PlatformSnapshot["usage"],
    operations: (operations.data ?? []) as PlatformSnapshot["operations"],
    grants: (grants.data ?? []) as PlatformSnapshot["grants"],
  };
}
