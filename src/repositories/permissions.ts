import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { userCanAccessClinic } from "@/repositories/clinics";
import type { MemberPermissionOverride } from "@/types/domain";

export async function listClinicMemberPermissionOverrides(
  clinicId?: string,
): Promise<Record<string, MemberPermissionOverride[]>> {
  if (!clinicId) {
    return {};
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !(await userCanAccessClinic(clinicId, user.id))) {
    return {};
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("member_permissions")
    .select("id, clinic_id, member_id, module, action, allowed, reason")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("module", { ascending: true })
    .order("action", { ascending: true });

  if (error || !data) {
    return {};
  }

  return (data as MemberPermissionOverride[]).reduce<Record<string, MemberPermissionOverride[]>>((acc, permission) => {
    acc[permission.member_id] = [...(acc[permission.member_id] ?? []), permission];
    return acc;
  }, {});
}
