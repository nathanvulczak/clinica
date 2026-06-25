import {
  permissionKey,
  ROLE_PERMISSION_PRESETS,
  type PermissionKey,
} from "@/config/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/services/audit/audit-service";
import type { AppRole, PermissionAction, PermissionModule } from "@/types/domain";

type PermissionOverrideRow = {
  action: PermissionAction;
  allowed: boolean;
  module: PermissionModule;
};

export type ClinicAuthorization = {
  memberId: string | null;
  permissions: Set<PermissionKey>;
  role: AppRole | null;
  userId: string | null;
  can: (module: PermissionModule, action: PermissionAction) => boolean;
};

function emptyAuthorization(userId: string | null = null): ClinicAuthorization {
  return {
    memberId: null,
    permissions: new Set(),
    role: null,
    userId,
    can: () => false,
  };
}

export async function getClinicAuthorization(clinicId?: string): Promise<ClinicAuthorization> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !clinicId) {
    return emptyAuthorization(user?.id ?? null);
  }

  const admin = createSupabaseAdminClient();
  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin.from("profiles").select("platform_role").eq("id", user.id).maybeSingle(),
    admin
      .from("clinic_members")
      .select("id, role, status")
      .eq("clinic_id", clinicId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (profile?.platform_role === "platform_admin") {
    return {
      memberId: membership?.id ?? null,
      permissions: new Set(),
      role: "platform_admin",
      userId: user.id,
      can: () => true,
    };
  }

  if (!membership) {
    return emptyAuthorization(user.id);
  }

  const role = membership.role as AppRole;

  if (role === "clinic_owner") {
    return {
      memberId: membership.id,
      permissions: new Set(),
      role,
      userId: user.id,
      can: () => true,
    };
  }

  const permissions = new Set<PermissionKey>(ROLE_PERMISSION_PRESETS[role]);
  const [{ data: clinicRoleOverrides }, { data: memberOverrides }] = await Promise.all([
    admin
      .from("role_permissions")
      .select("module, action, allowed")
      .eq("clinic_id", clinicId)
      .eq("role", role)
      .is("deleted_at", null),
    admin
      .from("member_permissions")
      .select("module, action, allowed")
      .eq("clinic_id", clinicId)
      .eq("member_id", membership.id)
      .is("deleted_at", null),
  ]);

  for (const override of (clinicRoleOverrides ?? []) as PermissionOverrideRow[]) {
    const key = permissionKey(override.module, override.action);
    if (override.allowed) permissions.add(key);
    else permissions.delete(key);
  }

  for (const override of (memberOverrides ?? []) as PermissionOverrideRow[]) {
    const key = permissionKey(override.module, override.action);
    if (override.allowed) permissions.add(key);
    else permissions.delete(key);
  }

  return {
    memberId: membership.id,
    permissions,
    role,
    userId: user.id,
    can: (module, action) => permissions.has(permissionKey(module, action)),
  };
}

export type NavigationKey =
  | "dashboard"
  | "clinics"
  | "registrations"
  | "members"
  | "billing"
  | "audit"
  | "backup"
  | "profile"
  | "schedule"
  | "encounters"
  | "medicalRecords"
  | "nursing"
  | "financial";

export function getAllowedNavigation(
  authorization: ClinicAuthorization,
  options?: { allowInitialSetup?: boolean },
): NavigationKey[] {
  const allowed = new Set<NavigationKey>(["dashboard", "profile"]);

  if (options?.allowInitialSetup) {
    allowed.add("clinics");
    allowed.add("billing");
  }

  if (authorization.can("clinics", "view")) allowed.add("clinics");
  if (authorization.can("patients", "view") || authorization.can("schedule", "view")) {
    allowed.add("registrations");
  }
  if (authorization.can("members", "view") || authorization.can("members", "manage")) {
    allowed.add("members");
  }
  if (authorization.can("billing", "view")) allowed.add("billing");
  if (authorization.can("audit", "view")) allowed.add("audit");
  if (authorization.can("audit", "export") || authorization.can("clinics", "edit")) {
    allowed.add("backup");
  }
  if (authorization.can("schedule", "view")) allowed.add("schedule");
  if (
    authorization.can("schedule", "manage") ||
    (
      authorization.can("medical_records", "view") &&
      authorization.can("medical_records", "access_medical_record")
    )
  ) {
    allowed.add("encounters");
  }
  if (
    authorization.can("medical_records", "view") &&
    authorization.can("medical_records", "access_medical_record")
  ) {
    allowed.add("medicalRecords");
  }
  if (authorization.can("nursing", "view")) allowed.add("nursing");
  if (authorization.can("financial", "view")) allowed.add("financial");

  return [...allowed];
}

export async function auditDeniedModuleAccess(
  clinicId: string | null | undefined,
  module: PermissionModule,
  notes: string,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  await logAuditEvent({
    clinicId: clinicId ?? null,
    userId: user.id,
    actionType: "access_denied",
    module,
    recordTable: "access_control",
    level: "security",
    notes,
  });
}
