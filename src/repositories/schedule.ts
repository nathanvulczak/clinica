import { OPERATIONAL_APPOINTMENT_STATUSES } from "@/config/schedule";
import { localDateTimeToIso } from "@/lib/dates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserId, userCanAccessClinic } from "@/repositories/clinics";
import { PATIENT_SELECT } from "@/repositories/registrations";
import type {
  AppRole,
  AppointmentStatus,
  AppointmentSummary,
  AppointmentWorkflowEvent,
  ClinicRoom,
  ClinicService,
  PatientSummary,
  ScheduleBlock,
  ScheduleProfessional,
  ScheduleSettings,
} from "@/types/domain";

type AppointmentRow = Omit<
  AppointmentSummary,
  "patient" | "professional" | "service" | "room"
>;

export type ScheduleFilters = {
  date?: string;
  startDate?: string;
  endDate?: string;
  professionalId?: string;
  professionalIds?: string[];
  status?: AppointmentStatus | "all";
};

export type ScheduleAccess = {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManage: boolean;
  canOperateOwn: boolean;
  currentMemberId: string | null;
  currentRole: AppRole | null;
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

export async function getScheduleAccess(clinicId?: string | null): Promise<ScheduleAccess> {
  const empty: ScheduleAccess = {
    canView: false,
    canEdit: false,
    canDelete: false,
    canManage: false,
    canOperateOwn: false,
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

  if (!user || !(await userCanAccessClinic(clinicId, user.id))) {
    return empty;
  }

  const admin = createSupabaseAdminClient();
  const [{ data: member }, viewPermission, editPermission, deletePermission, managePermission] = await Promise.all([
    admin
      .from("clinic_members")
      .select("id, role")
      .eq("clinic_id", clinicId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.rpc("user_has_permission", {
      clinic_uuid: clinicId,
      permission_module: "schedule",
      permission_action: "view",
    }),
    supabase.rpc("user_has_permission", {
      clinic_uuid: clinicId,
      permission_module: "schedule",
      permission_action: "edit",
    }),
    supabase.rpc("user_has_permission", {
      clinic_uuid: clinicId,
      permission_module: "schedule",
      permission_action: "delete",
    }),
    supabase.rpc("user_has_permission", {
      clinic_uuid: clinicId,
      permission_module: "schedule",
      permission_action: "manage",
    }),
  ]);

  const role = (member?.role as AppRole | undefined) ?? null;
  const canEdit = editPermission.data === true;

  return {
    canView: viewPermission.data === true,
    canEdit,
    canDelete: deletePermission.data === true,
    canManage: managePermission.data === true,
    canOperateOwn:
      canEdit || role === "doctor" || role === "nurse" || role === "professional",
    currentMemberId: member?.id ?? null,
    currentRole: role,
  };
}

export async function canViewSchedule(clinicId?: string | null) {
  return (await getScheduleAccess(clinicId)).canView;
}

export async function canManageSchedule(clinicId?: string | null) {
  return (await getScheduleAccess(clinicId)).canManage;
}

async function canReadClinic(clinicId?: string | null) {
  if (!clinicId) {
    return false;
  }

  const userId = await getCurrentUserId();
  return Boolean(userId && (await userCanAccessClinic(clinicId, userId)));
}

export async function listScheduleProfessionals(
  clinicId?: string | null,
  options?: { scopeToCurrentUser?: boolean; access?: ScheduleAccess },
): Promise<ScheduleProfessional[]> {
  if (!(await canReadClinic(clinicId))) {
    return [];
  }

  const access = options?.access ?? (await getScheduleAccess(clinicId));

  if (!access.canView) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("clinic_members")
    .select(
      "id, clinic_id, user_id, role, status, profile:profiles!clinic_members_user_id_fkey(full_name, email, phone, cpf, avatar_url)",
    )
    .eq("clinic_id", clinicId as string)
    .eq("status", "active")
    .is("deleted_at", null)
    .in("role", ["clinic_owner", "clinic_admin", "doctor", "nurse", "professional"])
    .order("created_at", { ascending: true });

  if (options?.scopeToCurrentUser && !access.canManage) {
    if (!access.currentMemberId) {
      return [];
    }

    query = query.eq("id", access.currentMemberId);
  }

  const { data, error } = await query;
  return error ? [] : (data as unknown as ScheduleProfessional[]);
}

export async function listSchedulePatients(clinicId?: string | null): Promise<PatientSummary[]> {
  const access = await getScheduleAccess(clinicId);

  if (!(await canReadClinic(clinicId)) || !access.canManage) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("patients")
    .select(PATIENT_SELECT)
    .eq("clinic_id", clinicId as string)
    .eq("active", true)
    .is("deleted_at", null)
    .order("full_name", { ascending: true })
    .limit(120);

  return error ? [] : (data as PatientSummary[]);
}

export async function listScheduleSettings(clinicId?: string | null): Promise<ScheduleSettings[]> {
  const access = await getScheduleAccess(clinicId);

  if (!(await canReadClinic(clinicId)) || !access.canView) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("schedule_professional_settings")
    .select(
      "id, clinic_id, professional_member_id, slot_minutes, buffer_minutes, timezone, default_location, online_booking_enabled, working_hours",
    )
    .eq("clinic_id", clinicId as string)
    .is("deleted_at", null);

  if (!access.canManage) {
    if (!access.currentMemberId) {
      return [];
    }

    query = query.eq("professional_member_id", access.currentMemberId);
  }

  const { data, error } = await query;
  return error ? [] : (data as ScheduleSettings[]);
}

function getDateRange(filters?: ScheduleFilters) {
  const startDate = filters?.startDate ?? filters?.date;
  const endDate = filters?.endDate ?? filters?.date;

  if (!startDate || !endDate) {
    return null;
  }

  return {
    start: localDateTimeToIso(startDate, "00:00"),
    end: localDateTimeToIso(endDate, "23:59"),
  };
}

export async function listScheduleBlocks(
  clinicId?: string | null,
  filters?: ScheduleFilters,
): Promise<ScheduleBlock[]> {
  const range = getDateRange(filters);
  const access = await getScheduleAccess(clinicId);

  if (!(await canReadClinic(clinicId)) || !range || !access.canView) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("schedule_blocks")
    .select("id, clinic_id, professional_member_id, starts_at, ends_at, block_type, reason")
    .eq("clinic_id", clinicId as string)
    .is("deleted_at", null)
    .lt("starts_at", range.end)
    .gt("ends_at", range.start)
    .order("starts_at", { ascending: true });

  if (!access.canManage) {
    if (!access.currentMemberId) {
      return [];
    }

    query = query.eq("professional_member_id", access.currentMemberId);
  } else if (filters?.professionalIds?.length) {
    query = query.in("professional_member_id", filters.professionalIds.slice(0, 6));
  } else if (filters?.professionalId && filters.professionalId !== "all") {
    query = query.eq("professional_member_id", filters.professionalId);
  }

  const { data, error } = await query;
  return error ? [] : (data as ScheduleBlock[]);
}

export async function listAppointments(
  clinicId?: string | null,
  filters?: ScheduleFilters,
): Promise<AppointmentSummary[]> {
  const range = getDateRange(filters);
  const access = await getScheduleAccess(clinicId);

  if (!(await canReadClinic(clinicId)) || !range || !access.canView) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("appointments")
    .select(
      "id, clinic_id, patient_id, professional_member_id, service_id, room_id, scheduled_by, starts_at, ends_at, status, appointment_type, channel, confirmation_token, confirmation_sent_at, confirmed_at, cancellation_reason, notes",
    )
    .eq("clinic_id", clinicId as string)
    .is("deleted_at", null)
    .gte("starts_at", range.start)
    .lte("starts_at", range.end)
    .order("starts_at", { ascending: true });

  if (!access.canManage) {
    if (!access.currentMemberId) {
      return [];
    }

    query = query.eq("professional_member_id", access.currentMemberId);
  } else if (filters?.professionalIds?.length) {
    query = query.in("professional_member_id", filters.professionalIds.slice(0, 6));
  } else if (filters?.professionalId && filters.professionalId !== "all") {
    query = query.eq("professional_member_id", filters.professionalId);
  }

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  const rows = data as AppointmentRow[];
  const patientIds = [...new Set(rows.map((appointment) => appointment.patient_id).filter(Boolean))];
  const professionalIds = [...new Set(rows.map((appointment) => appointment.professional_member_id).filter(Boolean))];
  const serviceIds = [...new Set(rows.map((appointment) => appointment.service_id).filter(Boolean))] as string[];
  const roomIds = [...new Set(rows.map((appointment) => appointment.room_id).filter(Boolean))] as string[];

  const [{ data: patients }, { data: professionals }, { data: services }, { data: rooms }] =
    await Promise.all([
      patientIds.length
        ? admin.from("patients").select(PATIENT_SELECT).in("id", patientIds)
        : Promise.resolve({ data: [] }),
      professionalIds.length
        ? admin
            .from("clinic_members")
            .select(
              "id, clinic_id, user_id, role, status, profile:profiles!clinic_members_user_id_fkey(full_name, email, phone, cpf, avatar_url)",
            )
            .in("id", professionalIds)
        : Promise.resolve({ data: [] }),
      serviceIds.length
        ? admin
            .from("clinic_services")
            .select(
              "id, clinic_id, code, name, category, description, duration_minutes, price_cents, color, preconsultation_mode, requires_authorization, active",
            )
            .in("id", serviceIds)
        : Promise.resolve({ data: [] }),
      roomIds.length
        ? admin
            .from("clinic_rooms")
            .select("id, clinic_id, code, name, room_type, floor, capacity, resources, notes, active")
            .in("id", roomIds)
        : Promise.resolve({ data: [] }),
    ]);

  const patientsById = new Map((patients ?? []).map((patient) => [patient.id, patient as PatientSummary]));
  const professionalsById = new Map(
    (professionals ?? []).map((professional) => [
      professional.id,
      professional as unknown as ScheduleProfessional,
    ]),
  );
  const servicesById = new Map((services ?? []).map((service) => [service.id, service as ClinicService]));
  const roomsById = new Map((rooms ?? []).map((room) => [room.id, room as ClinicRoom]));

  return rows.map((appointment) => ({
    ...appointment,
    patient: patientsById.get(appointment.patient_id) ?? null,
    professional: professionalsById.get(appointment.professional_member_id) ?? null,
    service: appointment.service_id ? servicesById.get(appointment.service_id) ?? null : null,
    room: appointment.room_id ? roomsById.get(appointment.room_id) ?? null : null,
  }));
}

export async function listAppointmentWorkflowEvents(
  clinicId: string | null | undefined,
  appointmentIds: string[],
): Promise<AppointmentWorkflowEvent[]> {
  const access = await getScheduleAccess(clinicId);

  if (!(await canReadClinic(clinicId)) || !access.canView || appointmentIds.length === 0) {
    return [];
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("appointment_workflow_events")
    .select("id, clinic_id, appointment_id, from_status, to_status, notes, created_at")
    .eq("clinic_id", clinicId as string)
    .in("appointment_id", appointmentIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return error ? [] : (data as AppointmentWorkflowEvent[]);
}

export function isOperationalAppointmentStatus(status: AppointmentStatus) {
  return (OPERATIONAL_APPOINTMENT_STATUSES as readonly string[]).includes(status);
}
