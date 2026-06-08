import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Clinic, ClinicMember } from "@/types/domain";

const CLINIC_SELECT = "id, legal_name, trade_name, document, email, phone, city, state, created_at, created_by";

async function getCurrentUserId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

export async function userCanAccessClinic(clinicId: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select("id, created_by")
    .eq("id", clinicId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!clinic) {
    return false;
  }

  if (clinic.created_by === userId) {
    await ensureOwnerMembership(clinicId, userId);
    return true;
  }

  const { data: member } = await admin
    .from("clinic_members")
    .select("id")
    .eq("clinic_id", clinicId)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  return Boolean(member);
}

export async function ensureOwnerMembership(clinicId: string, userId: string) {
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("clinic_members")
    .select("id, role, status, deleted_at")
    .eq("clinic_id", clinicId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing?.role === "clinic_owner" && existing.status === "active" && !existing.deleted_at) {
    return;
  }

  if (existing?.id) {
    await admin
      .from("clinic_members")
      .update({
        role: "clinic_owner",
        status: "active",
        deleted_at: null,
        joined_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", existing.id);
  } else {
    await admin.from("clinic_members").insert({
      clinic_id: clinicId,
      user_id: userId,
      role: "clinic_owner",
      status: "active",
      joined_at: new Date().toISOString(),
      created_by: userId,
      updated_by: userId,
    });
  }

  await admin
    .from("profiles")
    .update({
      platform_role: "clinic_owner",
      updated_by: userId,
    })
    .eq("id", userId)
    .eq("platform_role", "professional");
}

export async function listUserClinics(): Promise<Clinic[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  const [{ data: memberships }, { data: ownedClinics }] = await Promise.all([
    admin
      .from("clinic_members")
      .select("clinic_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .is("deleted_at", null),
    admin
      .from("clinics")
      .select(CLINIC_SELECT)
      .eq("created_by", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const clinicIds = [...new Set((memberships ?? []).map((membership) => membership.clinic_id).filter(Boolean))];
  const { data: memberClinics } =
    clinicIds.length > 0
      ? await admin.from("clinics").select(CLINIC_SELECT).in("id", clinicIds).is("deleted_at", null)
      : { data: [] };

  const clinicsById = new Map<string, Clinic>();

  for (const clinic of [...(ownedClinics ?? []), ...(memberClinics ?? [])] as Clinic[]) {
    clinicsById.set(clinic.id, clinic);
  }

  const clinics = [...clinicsById.values()].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );

  await Promise.all(
    clinics
      .filter((clinic) => clinic.created_by === userId)
      .map((clinic) => ensureOwnerMembership(clinic.id, userId)),
  );

  return clinics;
}

export async function getClinicById(clinicId: string): Promise<Clinic | null> {
  const userId = await getCurrentUserId();

  if (!userId || !(await userCanAccessClinic(clinicId, userId))) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("clinics")
    .select(CLINIC_SELECT)
    .eq("id", clinicId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data as Clinic | null;
}

export async function listClinicMembers(clinicId?: string): Promise<ClinicMember[]> {
  if (!clinicId) {
    return [];
  }

  const userId = await getCurrentUserId();

  if (!userId || !(await userCanAccessClinic(clinicId, userId))) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("clinic_members")
    .select(
      "id, clinic_id, user_id, role, status, joined_at, created_at, profile:profiles!clinic_members_user_id_fkey(full_name, email, phone)",
    )
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    return [];
  }

  return data as unknown as ClinicMember[];
}
