import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Clinic, ClinicMember } from "@/types/domain";

export async function listUserClinics(): Promise<Clinic[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clinics")
    .select("id, legal_name, trade_name, document, email, phone, city, state, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return data as Clinic[];
}

export async function getClinicById(clinicId: string): Promise<Clinic | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clinics")
    .select("id, legal_name, trade_name, document, email, phone, city, state, created_at")
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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
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
