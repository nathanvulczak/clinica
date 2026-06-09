import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserId, userCanAccessClinic } from "@/repositories/clinics";
import type {
  AppRole,
  ClinicRoom,
  ClinicService,
  PatientSummary,
  ProfessionalAvailabilityRule,
  RegistrationPreferences,
} from "@/types/domain";

const PATIENT_SELECT =
  "id, clinic_id, full_name, social_name, cpf, rg, issuing_authority, birth_date, sex_at_birth, gender_identity, marital_status, occupation, nationality, phone, email, preferred_contact, postal_code, address_line, address_number, address_complement, neighborhood, city, state, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, health_plan_name, health_plan_number, health_plan_valid_until, clinical_alerts, consent_lgpd_at, active, notes";

export type RegistrationAccess = {
  canViewPatients: boolean;
  canCreatePatients: boolean;
  canEditPatients: boolean;
  canDeletePatients: boolean;
  canExportPatients: boolean;
  canViewCatalog: boolean;
  canCreateCatalog: boolean;
  canEditCatalog: boolean;
  canDeleteCatalog: boolean;
  canExportCatalog: boolean;
  canManageSchedule: boolean;
  canManageOwnAvailability: boolean;
  currentMemberId: string | null;
  currentRole: AppRole | null;
};

async function hasPermission(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clinicId: string,
  module: "patients" | "schedule",
  action: "view" | "create" | "edit" | "delete" | "export" | "manage",
) {
  const { data } = await supabase.rpc("user_has_permission", {
    clinic_uuid: clinicId,
    permission_module: module,
    permission_action: action,
  });

  return data === true;
}

export async function getRegistrationAccess(clinicId?: string | null): Promise<RegistrationAccess> {
  const empty: RegistrationAccess = {
    canViewPatients: false,
    canCreatePatients: false,
    canEditPatients: false,
    canDeletePatients: false,
    canExportPatients: false,
    canViewCatalog: false,
    canCreateCatalog: false,
    canEditCatalog: false,
    canDeleteCatalog: false,
    canExportCatalog: false,
    canManageSchedule: false,
    canManageOwnAvailability: false,
    currentMemberId: null,
    currentRole: null,
  };

  if (!clinicId) {
    return empty;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return empty;
  }

  const admin = createSupabaseAdminClient();
  const [{ data: member }, permissions] = await Promise.all([
    admin
      .from("clinic_members")
      .select("id, role")
      .eq("clinic_id", clinicId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle(),
    Promise.all([
      hasPermission(supabase, clinicId, "patients", "view"),
      hasPermission(supabase, clinicId, "patients", "create"),
      hasPermission(supabase, clinicId, "patients", "edit"),
      hasPermission(supabase, clinicId, "patients", "delete"),
      hasPermission(supabase, clinicId, "patients", "export"),
      hasPermission(supabase, clinicId, "schedule", "view"),
      hasPermission(supabase, clinicId, "schedule", "create"),
      hasPermission(supabase, clinicId, "schedule", "edit"),
      hasPermission(supabase, clinicId, "schedule", "delete"),
      hasPermission(supabase, clinicId, "schedule", "export"),
      hasPermission(supabase, clinicId, "schedule", "manage"),
    ]),
  ]);

  const role = (member?.role as AppRole | undefined) ?? null;

  return {
    canViewPatients: permissions[0],
    canCreatePatients: permissions[1],
    canEditPatients: permissions[2],
    canDeletePatients: permissions[3],
    canExportPatients: permissions[4],
    canViewCatalog: permissions[5],
    canCreateCatalog: permissions[6],
    canEditCatalog: permissions[7],
    canDeleteCatalog: permissions[8],
    canExportCatalog: permissions[9],
    canManageSchedule: permissions[10],
    canManageOwnAvailability:
      permissions[5] && (role === "doctor" || role === "nurse" || role === "professional"),
    currentMemberId: member?.id ?? null,
    currentRole: role,
  };
}

async function canReadClinic(clinicId?: string | null) {
  if (!clinicId) {
    return false;
  }

  const userId = await getCurrentUserId();
  return Boolean(userId && (await userCanAccessClinic(clinicId, userId)));
}

export async function listPatients(
  clinicId?: string | null,
  options?: { query?: string; includeInactive?: boolean; access?: RegistrationAccess },
): Promise<PatientSummary[]> {
  if (!(await canReadClinic(clinicId)) || !options?.access?.canViewPatients) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  let allowedPatientIds: string[] | null = null;

  if (!options.access.canManageSchedule) {
    if (!options.access.currentMemberId) {
      return [];
    }

    const { data: ownAppointments } = await admin
      .from("appointments")
      .select("patient_id")
      .eq("clinic_id", clinicId as string)
      .eq("professional_member_id", options.access.currentMemberId)
      .is("deleted_at", null);

    allowedPatientIds = [
      ...new Set((ownAppointments ?? []).map((appointment) => appointment.patient_id).filter(Boolean)),
    ];

    if (allowedPatientIds.length === 0) {
      return [];
    }
  }

  let query = admin
    .from("patients")
    .select(PATIENT_SELECT)
    .eq("clinic_id", clinicId as string)
    .is("deleted_at", null)
    .order("full_name", { ascending: true })
    .limit(250);

  if (!options.includeInactive) {
    query = query.eq("active", true);
  }

  if (options.query?.trim()) {
    const search = options.query.trim().replace(/[,%()]/g, "");
    query = query.or(`full_name.ilike.%${search}%,social_name.ilike.%${search}%,cpf.ilike.%${search}%`);
  }

  if (allowedPatientIds) {
    query = query.in("id", allowedPatientIds);
  }

  const { data, error } = await query;

  if (error) {
    return [];
  }

  return data as PatientSummary[];
}

export async function listClinicServices(
  clinicId?: string | null,
  includeInactive = false,
  providedAccess?: RegistrationAccess,
): Promise<ClinicService[]> {
  const canViewCatalog = providedAccess
    ? providedAccess.canViewCatalog
    : clinicId
      ? await hasPermission(await createSupabaseServerClient(), clinicId, "schedule", "view")
      : false;

  if (!(await canReadClinic(clinicId)) || !canViewCatalog) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("clinic_services")
    .select(
      "id, clinic_id, code, name, category, description, duration_minutes, price_cents, color, requires_authorization, active",
    )
    .eq("clinic_id", clinicId as string)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  return error ? [] : (data as ClinicService[]);
}

export async function listClinicRooms(
  clinicId?: string | null,
  includeInactive = false,
  providedAccess?: RegistrationAccess,
): Promise<ClinicRoom[]> {
  const canViewCatalog = providedAccess
    ? providedAccess.canViewCatalog
    : clinicId
      ? await hasPermission(await createSupabaseServerClient(), clinicId, "schedule", "view")
      : false;

  if (!(await canReadClinic(clinicId)) || !canViewCatalog) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("clinic_rooms")
    .select("id, clinic_id, code, name, room_type, floor, capacity, resources, notes, active")
    .eq("clinic_id", clinicId as string)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  return error ? [] : (data as ClinicRoom[]);
}

export async function listAvailabilityRules(
  clinicId?: string | null,
  access?: RegistrationAccess,
): Promise<ProfessionalAvailabilityRule[]> {
  if (!(await canReadClinic(clinicId)) || !access?.canViewCatalog) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("professional_availability_rules")
    .select(
      "id, clinic_id, professional_member_id, room_id, service_id, recurrence_type, weekday, specific_date, valid_from, valid_until, start_time, end_time, slot_minutes, active, notes",
    )
    .eq("clinic_id", clinicId as string)
    .is("deleted_at", null)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (!access.canManageSchedule) {
    if (!access.currentMemberId) {
      return [];
    }

    query = query.eq("professional_member_id", access.currentMemberId);
  }

  const { data, error } = await query;
  return error ? [] : (data as ProfessionalAvailabilityRule[]);
}

export async function getRegistrationPreferences(
  clinicId?: string | null,
): Promise<RegistrationPreferences | null> {
  if (!(await canReadClinic(clinicId))) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("registration_preferences")
    .select(
      "id, clinic_id, require_patient_cpf, require_patient_email, default_service_duration, default_export_format, patient_display_name, show_inactive_records",
    )
    .eq("clinic_id", clinicId as string)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data as RegistrationPreferences | null;
}

export { PATIENT_SELECT };
