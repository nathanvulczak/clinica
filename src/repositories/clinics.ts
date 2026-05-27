import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Clinic, ClinicMember } from "@/types/domain";

const CLINIC_SELECT = "id, legal_name, trade_name, document, email, phone, city, state, created_at, created_by";

async function getCurrentUserId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

async function userCanAccessClinic(clinicId: string, userId: string) {
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

  await admin.from("clinic_members").upsert(
    {
      clinic_id: clinicId,
      user_id: userId,
      role: "clinic_owner",
      status: "active",
      joined_at: new Date().toISOString(),
      created_by: userId,
      updated_by: userId,
    },
    { onConflict: "clinic_id,user_id" },
  );

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
  const [supabase, userId] = await Promise.all([createSupabaseServerClient(), getCurrentUserId()]);
  const { data, error } = await supabase
    .from("clinics")
    .select(CLINIC_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  if (userId) {
    await Promise.all(
      data
        .filter((clinic) => clinic.created_by === userId)
        .map((clinic) => ensureOwnerMembership(clinic.id, userId)),
    );
  }

  return data as Clinic[];
}

export async function getClinicById(clinicId: string): Promise<Clinic | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
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
      "id, clinic_id, user_id, role, status, joined_at, created_at, profile:profiles(full_name, email, phone)",
    )
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    return [];
  }

  return data as unknown as ClinicMember[];
}
