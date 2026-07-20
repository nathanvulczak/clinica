import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/domain";

export type PlatformScope =
  | "overview"
  | "health"
  | "access"
  | "billing"
  | "audit"
  | "diagnostics"
  | "controls";

const scopeMatrix: Record<Exclude<AppRole, "clinic_owner" | "clinic_admin" | "doctor" | "nurse" | "receptionist" | "financial" | "professional">, PlatformScope[]> = {
  platform_admin: ["overview", "health", "access", "billing", "audit", "diagnostics", "controls"],
  platform_support: ["overview", "health", "diagnostics"],
  platform_billing: ["overview", "billing"],
  platform_security: ["overview", "health", "audit", "diagnostics"],
};

export type PlatformAccess = {
  userId: string | null;
  role: AppRole | null;
  allowed: boolean;
  can: (scope: PlatformScope) => boolean;
};

export async function getPlatformAccess(): Promise<PlatformAccess> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { userId: null, role: null, allowed: false, can: () => false };

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .is("deleted_at", null)
    .maybeSingle<{ platform_role: AppRole }>();

  const role = profile?.platform_role ?? null;
  const scopes = role && role in scopeMatrix ? scopeMatrix[role as keyof typeof scopeMatrix] : [];
  return {
    userId: user.id,
    role,
    allowed: scopes.length > 0,
    can: (scope) => scopes.includes(scope),
  };
}
