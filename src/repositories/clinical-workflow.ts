import { NURSING_QUEUE_STATUSES } from "@/config/clinical-workflow";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import type {
  AppointmentStatus,
  AppRole,
  ClinicalEncounterStatus,
  ClinicalEncounterSummary,
  PreconsultationMode,
} from "@/types/domain";

export type ClinicalWorkflowAccess = {
  canViewAll: boolean;
  canViewOwn: boolean;
  canViewNursing: boolean;
  canOperateNursing: boolean;
  canRoute: boolean;
  currentMemberId: string | null;
  currentRole: AppRole | null;
};

export async function getClinicalWorkflowAccess(
  clinicId?: string | null,
): Promise<ClinicalWorkflowAccess> {
  const authorization = await getClinicAuthorization(clinicId ?? undefined);

  return {
    canViewAll: authorization.can("schedule", "manage"),
    canViewOwn:
      authorization.can("medical_records", "view") &&
      authorization.can("medical_records", "access_medical_record"),
    canViewNursing: authorization.can("nursing", "view"),
    canOperateNursing:
      authorization.can("nursing", "create") || authorization.can("nursing", "edit"),
    canRoute:
      authorization.can("schedule", "manage") ||
      authorization.can("medical_records", "access_medical_record"),
    currentMemberId: authorization.memberId,
    currentRole: authorization.role,
  };
}

type EncounterRow = {
  id: string;
  clinic_id: string;
  appointment_id: string;
  patient_id: string;
  professional_member_id: string;
  status: ClinicalEncounterStatus;
  preconsultation_mode: PreconsultationMode;
  preconsultation_required: boolean | null;
  routing_source: "clinic" | "service" | "manual";
  routing_reason: string | null;
  arrived_at: string | null;
  triage_started_at: string | null;
  triage_completed_at: string | null;
  consultation_started_at: string | null;
  consultation_completed_at: string | null;
  follow_up_status: ClinicalEncounterSummary["follow_up_status"];
};

export async function listClinicalEncounters(
  clinicId: string | null | undefined,
  options?: {
    queue?: "all" | "nursing";
    statuses?: ClinicalEncounterStatus[];
  },
): Promise<ClinicalEncounterSummary[]> {
  if (!clinicId) return [];

  const access = await getClinicalWorkflowAccess(clinicId);
  if (!access.canViewAll && !access.canViewOwn && !access.canViewNursing) return [];

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("clinical_encounters")
    .select(
      "id, clinic_id, appointment_id, patient_id, professional_member_id, status, preconsultation_mode, preconsultation_required, routing_source, routing_reason, arrived_at, triage_started_at, triage_completed_at, consultation_started_at, consultation_completed_at, follow_up_status",
    )
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("arrived_at", { ascending: false })
    .limit(200);

  if (options?.statuses?.length) {
    query = query.in("status", options.statuses);
  } else if (options?.queue === "nursing") {
    query = query.in("status", NURSING_QUEUE_STATUSES);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const visibleRows = (data as EncounterRow[]).filter((row) => {
    if (access.canViewAll) return true;
    if (access.canViewOwn && row.professional_member_id === access.currentMemberId) return true;
    return access.canViewNursing && NURSING_QUEUE_STATUSES.includes(row.status);
  });

  if (visibleRows.length === 0) return [];

  const appointmentIds = [...new Set(visibleRows.map((row) => row.appointment_id))];
  const patientIds = [...new Set(visibleRows.map((row) => row.patient_id))];
  const professionalIds = [...new Set(visibleRows.map((row) => row.professional_member_id))];

  const [{ data: appointments }, { data: patients }, { data: professionals }] = await Promise.all([
    admin
      .from("appointments")
      .select("id, starts_at, ends_at, appointment_type, channel, status, service_id, room_id")
      .in("id", appointmentIds),
    admin
      .from("patients")
      .select("id, full_name, social_name, birth_date, phone, clinical_alerts")
      .in("id", patientIds),
    admin
      .from("clinic_members")
      .select(
        "id, role, profile:profiles!clinic_members_user_id_fkey(full_name, avatar_url)",
      )
      .in("id", professionalIds),
  ]);

  const appointmentRows = appointments ?? [];
  const serviceIds = [
    ...new Set(appointmentRows.map((item) => item.service_id).filter((id): id is string => Boolean(id))),
  ];
  const roomIds = [
    ...new Set(appointmentRows.map((item) => item.room_id).filter((id): id is string => Boolean(id))),
  ];
  const [{ data: services }, { data: rooms }] = await Promise.all([
    serviceIds.length
      ? admin.from("clinic_services").select("id, name, color").in("id", serviceIds)
      : Promise.resolve({ data: [] }),
    roomIds.length
      ? admin.from("clinic_rooms").select("id, name").in("id", roomIds)
      : Promise.resolve({ data: [] }),
  ]);

  const appointmentMap = new Map(appointmentRows.map((item) => [item.id, item]));
  const patientMap = new Map((patients ?? []).map((item) => [item.id, item]));
  const professionalMap = new Map((professionals ?? []).map((item) => [item.id, item]));
  const serviceMap = new Map((services ?? []).map((item) => [item.id, item]));
  const roomMap = new Map((rooms ?? []).map((item) => [item.id, item]));

  return visibleRows.map((row) => {
    const appointment = appointmentMap.get(row.appointment_id);

    return {
      ...row,
      appointment: appointment
        ? {
            id: appointment.id,
            starts_at: appointment.starts_at,
            ends_at: appointment.ends_at,
            appointment_type: appointment.appointment_type,
            channel: appointment.channel,
            status: appointment.status as AppointmentStatus,
          }
        : null,
      patient: patientMap.get(row.patient_id) ?? null,
      professional: (professionalMap.get(row.professional_member_id) ??
        null) as ClinicalEncounterSummary["professional"],
      service: appointment?.service_id ? serviceMap.get(appointment.service_id) ?? null : null,
      room: appointment?.room_id ? roomMap.get(appointment.room_id) ?? null : null,
    };
  });
}
