import { OPERATIONAL_APPOINTMENT_STATUSES } from "@/config/schedule";
import { localDateTimeToIso } from "@/lib/dates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserId, userCanAccessClinic } from "@/repositories/clinics";
import type {
  AppointmentStatus,
  AppointmentSummary,
  PatientSummary,
  ScheduleBlock,
  ScheduleProfessional,
  ScheduleSettings,
} from "@/types/domain";

type AppointmentRow = Omit<AppointmentSummary, "patient" | "professional">;

export type ScheduleFilters = {
  date: string;
  professionalId?: string;
  status?: AppointmentStatus | "all";
};

export async function userHasClinicPermission(clinicId: string, module: string, action: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("user_has_permission", {
    clinic_uuid: clinicId,
    permission_module: module,
    permission_action: action,
  });

  return data === true;
}

export async function canViewSchedule(clinicId?: string | null) {
  if (!clinicId) {
    return false;
  }

  return userHasClinicPermission(clinicId, "schedule", "view");
}

export async function canManageSchedule(clinicId?: string | null) {
  if (!clinicId) {
    return false;
  }

  return userHasClinicPermission(clinicId, "schedule", "manage");
}

async function canReadClinic(clinicId?: string | null) {
  if (!clinicId) {
    return false;
  }

  const userId = await getCurrentUserId();
  return Boolean(userId && (await userCanAccessClinic(clinicId, userId)));
}

export async function listScheduleProfessionals(clinicId?: string | null): Promise<ScheduleProfessional[]> {
  if (!(await canReadClinic(clinicId))) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("clinic_members")
    .select("id, clinic_id, user_id, role, profile:profiles!clinic_members_user_id_fkey(full_name, email)")
    .eq("clinic_id", clinicId as string)
    .eq("status", "active")
    .is("deleted_at", null)
    .in("role", ["clinic_owner", "clinic_admin", "doctor", "nurse", "professional"])
    .order("created_at", { ascending: true });

  if (error) {
    return [];
  }

  return data as unknown as ScheduleProfessional[];
}

export async function listSchedulePatients(clinicId?: string | null): Promise<PatientSummary[]> {
  if (!(await canReadClinic(clinicId))) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("patients")
    .select("id, clinic_id, full_name, cpf, birth_date, phone, email, notes")
    .eq("clinic_id", clinicId as string)
    .is("deleted_at", null)
    .order("full_name", { ascending: true })
    .limit(80);

  if (error) {
    return [];
  }

  return data as PatientSummary[];
}

export async function listScheduleSettings(clinicId?: string | null): Promise<ScheduleSettings[]> {
  if (!(await canReadClinic(clinicId))) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("schedule_professional_settings")
    .select(
      "id, clinic_id, professional_member_id, slot_minutes, buffer_minutes, timezone, default_location, online_booking_enabled, working_hours",
    )
    .eq("clinic_id", clinicId as string)
    .is("deleted_at", null);

  if (error) {
    return [];
  }

  return data as ScheduleSettings[];
}

export async function listScheduleBlocks(
  clinicId?: string | null,
  filters?: Pick<ScheduleFilters, "date" | "professionalId">,
): Promise<ScheduleBlock[]> {
  if (!(await canReadClinic(clinicId)) || !filters?.date) {
    return [];
  }

  const start = localDateTimeToIso(filters.date, "00:00");
  const end = localDateTimeToIso(filters.date, "23:59");
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("schedule_blocks")
    .select("id, clinic_id, professional_member_id, starts_at, ends_at, block_type, reason")
    .eq("clinic_id", clinicId as string)
    .is("deleted_at", null)
    .gte("starts_at", start)
    .lte("starts_at", end)
    .order("starts_at", { ascending: true });

  if (filters.professionalId && filters.professionalId !== "all") {
    query = query.eq("professional_member_id", filters.professionalId);
  }

  const { data, error } = await query;

  if (error) {
    return [];
  }

  return data as ScheduleBlock[];
}

export async function listAppointments(
  clinicId?: string | null,
  filters?: ScheduleFilters,
): Promise<AppointmentSummary[]> {
  if (!(await canReadClinic(clinicId)) || !filters?.date) {
    return [];
  }

  const start = localDateTimeToIso(filters.date, "00:00");
  const end = localDateTimeToIso(filters.date, "23:59");
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("appointments")
    .select(
      "id, clinic_id, patient_id, professional_member_id, scheduled_by, starts_at, ends_at, status, appointment_type, channel, confirmation_token, confirmation_sent_at, confirmed_at, cancellation_reason, notes",
    )
    .eq("clinic_id", clinicId as string)
    .is("deleted_at", null)
    .gte("starts_at", start)
    .lte("starts_at", end)
    .order("starts_at", { ascending: true });

  if (filters.professionalId && filters.professionalId !== "all") {
    query = query.eq("professional_member_id", filters.professionalId);
  }

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  const rows = data as AppointmentRow[];
  const patientIds = [...new Set(rows.map((appointment) => appointment.patient_id).filter(Boolean))];
  const professionalIds = [...new Set(rows.map((appointment) => appointment.professional_member_id).filter(Boolean))];

  const [{ data: patients }, { data: professionals }] = await Promise.all([
    patientIds.length
      ? admin
          .from("patients")
          .select("id, clinic_id, full_name, cpf, birth_date, phone, email, notes")
          .in("id", patientIds)
      : Promise.resolve({ data: [] }),
    professionalIds.length
      ? admin
          .from("clinic_members")
          .select("id, clinic_id, user_id, role, profile:profiles!clinic_members_user_id_fkey(full_name, email)")
          .in("id", professionalIds)
      : Promise.resolve({ data: [] }),
  ]);

  const patientsById = new Map((patients ?? []).map((patient) => [patient.id, patient as PatientSummary]));
  const professionalsById = new Map(
    (professionals ?? []).map((professional) => [
      professional.id,
      professional as unknown as ScheduleProfessional,
    ]),
  );

  return rows.map((appointment) => ({
    ...appointment,
    patient: patientsById.get(appointment.patient_id) ?? null,
    professional: professionalsById.get(appointment.professional_member_id) ?? null,
  }));
}

export function isOperationalAppointmentStatus(status: AppointmentStatus) {
  return (OPERATIONAL_APPOINTMENT_STATUSES as readonly string[]).includes(status);
}
