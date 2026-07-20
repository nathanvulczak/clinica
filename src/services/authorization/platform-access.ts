import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlatformOperatorRole } from "@/types/domain";

export type PlatformScope =
  | "overview"
  | "health"
  | "operations"
  | "billing"
  | "errors"
  | "usage"
  | "diagnostics"
  | "security";

const scopeMatrix: Record<PlatformOperatorRole, PlatformScope[]> = {
  owner: ["overview", "health", "operations", "billing", "errors", "usage", "diagnostics", "security"],
  support: ["overview", "health", "errors", "diagnostics"],
  billing: ["overview", "billing"],
  security: ["overview", "health", "errors", "security", "diagnostics"],
};

export type PlatformAccess = {
  userId: string | null;
  role: PlatformOperatorRole | null;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  allowed: boolean;
  can: (scope: PlatformScope) => boolean;
};

export async function getPlatformAccess(): Promise<PlatformAccess> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { userId: null, role: null, mfaRequired: false, mfaEnrolled: false, allowed: false, can: () => false };

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("platform_operators")
    .select("role, status, mfa_required, mfa_enrolled")
    .eq("user_id", user.id)
    .maybeSingle<{ role: PlatformOperatorRole; status: string; mfa_required: boolean; mfa_enrolled: boolean }>();

  const role = profile?.status === "active" ? profile.role : null;
  const scopes = role ? scopeMatrix[role] : [];
  return {
    userId: user.id,
    role,
    mfaRequired: profile?.mfa_required ?? false,
    mfaEnrolled: profile?.mfa_enrolled ?? false,
    allowed: scopes.length > 0,
    can: (scope) => scopes.includes(scope),
  };
}
