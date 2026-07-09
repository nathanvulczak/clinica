import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";

export type DiagnosticsAccess = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canManage: boolean;
  canExport: boolean;
};

export type DiagnosticItem = {
  id: string;
  code_system: string;
  procedure_code: string | null;
  name: string;
  specimen: string | null;
  status: string;
  results: Array<{
    id: string;
    status: string;
    value_text: string | null;
    value_numeric: number | null;
    unit: string | null;
    reference_range: string | null;
    flag: string;
    interpretation: string | null;
    report_text: string | null;
    version_number: number;
    resulted_at: string;
  }>;
};

export type DiagnosticOrder = {
  id: string;
  order_number: string;
  category: string;
  priority: string;
  status: string;
  clinical_indication: string | null;
  scheduled_at: string | null;
  collected_at: string | null;
  completed_at: string | null;
  created_at: string;
  patient: { id: string; full_name: string; social_name: string | null; cpf: string | null } | null;
  professional: { id: string; profile: { full_name: string } | null } | null;
  appointment: { id: string; starts_at: string } | null;
  items: DiagnosticItem[];
};

export type DiagnosticsWorkspace = {
  access: DiagnosticsAccess;
  orders: DiagnosticOrder[];
  patients: Array<{ id: string; full_name: string; social_name: string | null; cpf: string | null }>;
  professionals: Array<{ id: string; full_name: string; specialty: string | null }>;
  appointments: Array<{ id: string; patient_id: string; professional_member_id: string; starts_at: string; encounter_id: string | null }>;
  preferences: Record<string, unknown>;
};

export async function getDiagnosticsAccess(clinicId?: string | null): Promise<DiagnosticsAccess> {
  const auth = await getClinicAuthorization(clinicId ?? undefined);
  return {
    canView: auth.can("diagnostics", "view"),
    canCreate: auth.can("diagnostics", "create"),
    canEdit: auth.can("diagnostics", "edit"),
    canApprove: auth.can("diagnostics", "approve"),
    canManage: auth.can("diagnostics", "manage"),
    canExport: auth.can("diagnostics", "export"),
  };
}

export async function getDiagnosticsWorkspace(clinicId?: string | null): Promise<DiagnosticsWorkspace> {
  const access = await getDiagnosticsAccess(clinicId);
  const empty: DiagnosticsWorkspace = { access, orders: [], patients: [], professionals: [], appointments: [], preferences: {} };
  if (!clinicId || !access.canView) return empty;

  const auth = await getClinicAuthorization(clinicId);
  const admin = createSupabaseAdminClient();
  const [{ data: orders }, { data: patients }, { data: members }, { data: professionalProfiles }, { data: appointments }, { data: encounters }, { data: preference }] = await Promise.all([
    admin.from("diagnostic_orders")
      .select("id, order_number, category, priority, status, clinical_indication, scheduled_at, collected_at, completed_at, created_at, patient:patients(id, full_name, social_name, cpf), professional:clinic_members(id, profile:profiles!clinic_members_user_id_fkey(full_name)), appointment:appointments(id, starts_at), items:diagnostic_order_items(id, code_system, procedure_code, name, specimen, status, results:diagnostic_results(id, status, value_text, value_numeric, unit, reference_range, flag, interpretation, report_text, version_number, resulted_at))")
      .eq("clinic_id", clinicId).is("deleted_at", null).order("created_at", { ascending: false }).limit(180),
    access.canCreate ? admin.from("patients").select("id, full_name, social_name, cpf").eq("clinic_id", clinicId).eq("active", true).is("deleted_at", null).order("full_name").limit(400) : Promise.resolve({ data: [] }),
    access.canCreate ? admin.from("clinic_members").select("id, profile:profiles!clinic_members_user_id_fkey(full_name)").eq("clinic_id", clinicId).eq("status", "active").is("deleted_at", null).in("role", ["clinic_owner", "doctor", "professional"]) : Promise.resolve({ data: [] }),
    access.canCreate ? admin.from("clinic_professional_profiles").select("professional_member_id, specialty").eq("clinic_id", clinicId).is("deleted_at", null) : Promise.resolve({ data: [] }),
    access.canCreate ? admin.from("appointments").select("id, patient_id, professional_member_id, starts_at").eq("clinic_id", clinicId).is("deleted_at", null).order("starts_at", { ascending: false }).limit(250) : Promise.resolve({ data: [] }),
    access.canCreate ? admin.from("clinical_encounters").select("id, appointment_id").eq("clinic_id", clinicId).is("deleted_at", null).limit(250) : Promise.resolve({ data: [] }),
    auth.userId ? admin.from("module_user_preferences").select("preferences").eq("clinic_id", clinicId).eq("user_id", auth.userId).eq("module_key", "diagnostics").is("deleted_at", null).maybeSingle<{ preferences: Record<string, unknown> }>() : Promise.resolve({ data: null }),
  ]);

  const encounterMap = new Map((encounters ?? []).map((row) => [row.appointment_id, row.id]));
  const specialtyMap = new Map((professionalProfiles ?? []).map((row) => [row.professional_member_id, row.specialty ?? null]));
  return {
    access,
    orders: (orders ?? []) as unknown as DiagnosticOrder[],
    patients: patients ?? [],
    professionals: (members ?? []).map((member) => ({
      id: member.id,
      full_name: (member.profile as unknown as { full_name?: string } | null)?.full_name ?? "Profissional",
      specialty: specialtyMap.get(member.id) ?? null,
    })),
    appointments: (appointments ?? []).map((appointment) => ({ ...appointment, encounter_id: encounterMap.get(appointment.id) ?? null })),
    preferences: preference?.preferences ?? {},
  };
}

export async function getEncounterDiagnosticSummary(clinicId: string, encounterId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("diagnostic_orders")
    .select("id, order_number, category, priority, status, created_at, items:diagnostic_order_items(id, name, status, results:diagnostic_results(id, status, value_text, value_numeric, unit, reference_range, flag, interpretation, version_number, resulted_at))")
    .eq("clinic_id", clinicId).eq("encounter_id", encounterId).is("deleted_at", null).order("created_at", { ascending: false });
  return (data ?? []) as unknown as Array<Pick<DiagnosticOrder, "id" | "order_number" | "category" | "priority" | "status" | "created_at" | "items">>;
}
