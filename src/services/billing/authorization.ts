import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import type { Clinic } from "@/types/domain";

export type BillingAuthorization = {
  activeClinic: Clinic | null;
  canManage: boolean;
  canView: boolean;
  initialSignup: boolean;
  ownerUserId: string | null;
  userId: string | null;
};

export async function getBillingAuthorization(
  clinic?: Clinic | null,
): Promise<BillingAuthorization> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      activeClinic: null,
      canManage: false,
      canView: false,
      initialSignup: false,
      ownerUserId: null,
      userId: null,
    };
  }

  const admin = createSupabaseAdminClient();
  const { count: membershipCount } = await admin
    .from("clinic_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("status", ["active", "invited"])
    .is("deleted_at", null);

  if ((membershipCount ?? 0) === 0) {
    return {
      activeClinic: null,
      canManage: true,
      canView: true,
      initialSignup: true,
      ownerUserId: user.id,
      userId: user.id,
    };
  }

  const activeClinic = clinic === undefined ? (await getActiveClinicContext()).activeClinic : clinic;

  if (!activeClinic) {
    return {
      activeClinic: null,
      canManage: false,
      canView: false,
      initialSignup: false,
      ownerUserId: null,
      userId: user.id,
    };
  }

  const [authorization, ownerResult] = await Promise.all([
    getClinicAuthorization(activeClinic.id),
    admin
      .from("clinic_members")
      .select("user_id")
      .eq("clinic_id", activeClinic.id)
      .eq("role", "clinic_owner")
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
  ]);
  const ownerUserId = ownerResult.data?.user_id ?? activeClinic.created_by ?? null;

  return {
    activeClinic,
    canManage: authorization.can("billing", "manage"),
    canView: authorization.can("billing", "view"),
    initialSignup: false,
    ownerUserId,
    userId: user.id,
  };
}
