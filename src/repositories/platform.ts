import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPlatformAccess } from "@/services/authorization/platform-access";

export type PlatformSnapshot = {
  metrics: {
    clinics: number;
    users: number;
    activeSubscriptions: number;
    pendingBillingEvents: number;
    loginEvents24h: number;
    deniedEvents24h: number;
    auditEvents24h: number;
  };
  clinics: Array<{ id: string; name: string; created_at: string; status: "active" | "suspended" }>;
  users: Array<{ id: string; name: string; email: string | null; role: string; created_at: string }>;
  subscriptions: Array<{ owner_user_id: string; plan_slug: string; status: string; current_period_end: string | null; updated_at: string }>;
  migrations: Array<{ migration_name: string; applied_at: string; source: string }>;
  health: Array<{ id: string; check_name: string; status: string; summary: string; created_at: string }>;
  grants: Array<{ id: string; scope: string; status: string; reason: string; expires_at: string; created_at: string }>;
  technicalAudit: Array<{ id: string; action_type: string; module: string; level: string; record_table: string | null; created_at: string }>;
};

const emptySnapshot: PlatformSnapshot = {
  metrics: {
    clinics: 0,
    users: 0,
    activeSubscriptions: 0,
    pendingBillingEvents: 0,
    loginEvents24h: 0,
    deniedEvents24h: 0,
    auditEvents24h: 0,
  },
  clinics: [],
  users: [],
  subscriptions: [],
  migrations: [],
  health: [],
  grants: [],
  technicalAudit: [],
};

export async function getPlatformSnapshot(): Promise<PlatformSnapshot> {
  const access = await getPlatformAccess();
  if (!access.allowed) return emptySnapshot;

  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    clinicCount,
    userCount,
    subscriptionCount,
    billingEventCount,
    loginCount,
    deniedCount,
    auditCount,
    clinics,
    users,
    subscriptions,
    migrations,
    health,
    grants,
    technicalAudit,
  ] = await Promise.all([
    admin.from("clinics").select("id", { count: "exact", head: true }).is("deleted_at", null),
    admin.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
    admin.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["active", "trialing", "past_due"]).is("deleted_at", null),
    admin.from("billing_events").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("action_type", "login").gte("created_at", since),
    admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("action_type", "access_denied").gte("created_at", since),
    admin.from("audit_logs").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin
      .from("clinics")
      .select("id, trade_name, legal_name, created_at, deleted_at")
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("profiles")
      .select("id, full_name, email, platform_role, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("subscriptions")
      .select("owner_user_id, plan_slug, status, current_period_end, updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(30),
    admin
      .from("app_migration_history")
      .select("migration_name, applied_at, source")
      .order("applied_at", { ascending: false })
      .limit(20),
    admin
      .from("platform_health_snapshots")
      .select("id, check_name, status, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("platform_access_grants")
      .select("id, scope, status, reason, expires_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("audit_logs")
      .select("id, action_type, module, level, record_table, created_at")
      .gte("created_at", since)
      .in("module", ["billing", "audit", "access_control", "platform"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    metrics: {
      clinics: clinicCount.count ?? 0,
      users: userCount.count ?? 0,
      activeSubscriptions: subscriptionCount.count ?? 0,
      pendingBillingEvents: billingEventCount.count ?? 0,
      loginEvents24h: loginCount.count ?? 0,
      deniedEvents24h: deniedCount.count ?? 0,
      auditEvents24h: auditCount.count ?? 0,
    },
    clinics: (clinics.data ?? []).map((item) => ({
      id: item.id,
      name: item.trade_name || item.legal_name,
      created_at: item.created_at,
      status: item.deleted_at ? "suspended" : "active",
    })),
    users: (users.data ?? []).map((item) => ({
      id: item.id,
      name: item.full_name,
      email: item.email,
      role: item.platform_role,
      created_at: item.created_at,
    })),
    subscriptions: (subscriptions.data ?? []) as PlatformSnapshot["subscriptions"],
    migrations: (migrations.data ?? []) as PlatformSnapshot["migrations"],
    health: (health.data ?? []) as PlatformSnapshot["health"],
    grants: (grants.data ?? []) as PlatformSnapshot["grants"],
    technicalAudit: (technicalAudit.data ?? []) as PlatformSnapshot["technicalAudit"],
  };
}
