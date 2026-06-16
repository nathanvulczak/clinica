"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  APPOINTMENT_STATUS_TRANSITIONS,
  OPERATIONAL_APPOINTMENT_STATUSES,
} from "@/config/schedule";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  createAppointmentSchema,
  createScheduleBlockSchema,
  deleteAppointmentSchema,
  deleteScheduleBlockSchema,
  rescheduleAppointmentSchema,
  sendAppointmentNotificationSchema,
  updateAppointmentSchema,
  updateAppointmentStatusSchema,
  upsertProfessionalScheduleSettingsSchema,
} from "@/features/schedule/validation";
import { addMinutesIso, formatDateTimeBr, localDateTimeToIso } from "@/lib/dates";
import { getAppUrl } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canManageSchedule,
  getScheduleAccess,
} from "@/repositories/schedule";
import { logAuditEvent } from "@/services/audit/audit-service";
import { sendAppointmentConfirmationEmail } from "@/services/notifications/appointment-notification-service";
import type { AppointmentStatus, ClinicalEncounterStatus, PreconsultationMode } from "@/types/domain";

export type ScheduleActionState = {
  error?: string;
  success?: string;
};

const PATIENT_CONFIRMABLE_STATUSES = ["scheduled", "confirmed"];

type AppointmentClinicalSyncRow = {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_member_id: string;
  service_id: string | null;
  status: AppointmentStatus;
  checked_in_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};

async function getAuthenticatedScheduleContext() {
  const [{ activeClinic }, supabase] = await Promise.all([
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);

  if (!activeClinic) {
    return { error: "Selecione ou cadastre uma clínica antes de usar a agenda." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { activeClinic, user };
}

async function getScheduleActionContext() {
  const context = await getAuthenticatedScheduleContext();

  if ("error" in context) {
    return context;
  }

  const { activeClinic, user } = context;

  if (!(await canManageSchedule(activeClinic.id))) {
    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "access_denied",
      module: "schedule",
      level: "security",
      notes: "Tentativa de gerenciar agenda sem permissão.",
    });

    return { error: "Você não possui permissão para gerenciar a agenda desta clínica." };
  }

  return { activeClinic, user };
}

async function ensureClinicalEncounterForAppointment(
  appointmentId: string,
  actorId: string,
): Promise<{ ok: true; encounterId: string; created: boolean } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("clinical_encounters")
    .select("id")
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, encounterId: existing.id, created: false };
  }

  if (existingError) {
    return {
      ok: false,
      error: "Não foi possível verificar se o atendimento assistencial já existe.",
    };
  }

  const { data: appointment, error: appointmentError } = await admin
    .from("appointments")
    .select(
      "id, clinic_id, patient_id, professional_member_id, service_id, status, checked_in_at, started_at, completed_at, created_by, updated_by",
    )
    .eq("id", appointmentId)
    .is("deleted_at", null)
    .maybeSingle<AppointmentClinicalSyncRow>();

  if (appointmentError || !appointment) {
    return { ok: false, error: "Agendamento não encontrado para iniciar o fluxo assistencial." };
  }

  if (
    !["checked_in", "in_triage", "in_progress", "completed", "billing_pending", "billed"].includes(
      appointment.status,
    )
  ) {
    return {
      ok: false,
      error: "Registre a chegada do paciente antes de iniciar pré-consulta ou atendimento.",
    };
  }

  const [{ data: preferences }, { data: service }] = await Promise.all([
    admin
      .from("registration_preferences")
      .select("preconsultation_mode")
      .eq("clinic_id", appointment.clinic_id)
      .is("deleted_at", null)
      .maybeSingle<{ preconsultation_mode: Exclude<PreconsultationMode, "inherit"> }>(),
    appointment.service_id
      ? admin
          .from("clinic_services")
          .select("preconsultation_mode")
          .eq("id", appointment.service_id)
          .eq("clinic_id", appointment.clinic_id)
          .is("deleted_at", null)
          .maybeSingle<{ preconsultation_mode: PreconsultationMode }>()
      : Promise.resolve({ data: null }),
  ]);

  const clinicMode = preferences?.preconsultation_mode ?? "optional";
  const resolvedMode =
    service?.preconsultation_mode && service.preconsultation_mode !== "inherit"
      ? service.preconsultation_mode
      : clinicMode;
  const statusByAppointment: Partial<Record<AppointmentStatus, ClinicalEncounterStatus>> = {
    in_triage: "triage_in_progress",
    in_progress: "consultation_in_progress",
    completed: "consultation_completed",
    billing_pending: "billing_pending",
    billed: "billed",
  };
  const resolvedStatus =
    appointment.status === "checked_in"
      ? resolvedMode === "required"
        ? "waiting_triage"
        : resolvedMode === "disabled"
          ? "ready_for_consultation"
          : "awaiting_preconsultation_decision"
      : statusByAppointment[appointment.status];

  if (!resolvedStatus) {
    return { ok: false, error: "Etapa assistencial incompatível com o status da agenda." };
  }

  const preconsultationRequired =
    appointment.status === "in_triage" || resolvedMode === "required"
      ? true
      : resolvedMode === "disabled"
        ? false
        : null;
  const responsibleId = appointment.updated_by ?? appointment.created_by ?? actorId;
  const arrivedAt = appointment.checked_in_at ?? new Date().toISOString();
  const { data: created, error: insertError } = await admin
    .from("clinical_encounters")
    .insert({
      clinic_id: appointment.clinic_id,
      appointment_id: appointment.id,
      patient_id: appointment.patient_id,
      professional_member_id: appointment.professional_member_id,
      status: resolvedStatus,
      preconsultation_mode: resolvedMode,
      preconsultation_required: preconsultationRequired,
      routing_source:
        service?.preconsultation_mode && service.preconsultation_mode !== "inherit"
          ? "service"
          : "clinic",
      routing_decided_at: preconsultationRequired === null ? null : new Date().toISOString(),
      arrived_at: arrivedAt,
      triage_started_at:
        appointment.status === "in_triage" ? appointment.started_at ?? new Date().toISOString() : null,
      consultation_started_at:
        appointment.status === "in_progress" ? appointment.started_at ?? new Date().toISOString() : null,
      consultation_completed_at:
        appointment.status === "completed"
          ? appointment.completed_at ?? new Date().toISOString()
          : null,
      created_by: responsibleId,
      updated_by: responsibleId,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message)) {
      const { data: recovered } = await admin
        .from("clinical_encounters")
        .select("id")
        .eq("appointment_id", appointmentId)
        .is("deleted_at", null)
        .maybeSingle<{ id: string }>();

      if (recovered?.id) return { ok: true, encounterId: recovered.id, created: false };
    }

    return { ok: false, error: "Não foi possível iniciar o fluxo assistencial deste agendamento." };
  }

  await admin.from("clinical_encounter_events").insert({
    clinic_id: appointment.clinic_id,
    encounter_id: created.id,
    event_type: "patient_arrived",
    from_status: null,
    to_status: resolvedStatus,
    metadata: { source: "application_repair", appointment_status: appointment.status },
    created_by: responsibleId,
    updated_by: responsibleId,
  });

  return { ok: true, encounterId: created.id, created: true };
}

async function assertProfessionalBelongsToClinic(professionalMemberId: string, clinicId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("clinic_members")
    .select("id, role, status")
    .eq("id", professionalMemberId)
    .eq("clinic_id", clinicId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  return data;
}

async function findAppointmentConflict(
  clinicId: string,
  professionalMemberId: string,
  startsAt: string,
  endsAt: string,
  excludeAppointmentId?: string,
) {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("appointments")
    .select("id, starts_at, ends_at, status")
    .eq("clinic_id", clinicId)
    .eq("professional_member_id", professionalMemberId)
    .is("deleted_at", null)
    .in("status", [...OPERATIONAL_APPOINTMENT_STATUSES])
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  if (excludeAppointmentId) {
    query = query.neq("id", excludeAppointmentId);
  }

  const { data } = await query.limit(1);

  return data?.[0] ?? null;
}

async function findBlockConflict(
  clinicId: string,
  professionalMemberId: string,
  startsAt: string,
  endsAt: string,
  excludeBlockId?: string,
) {
  const admin = createSupabaseAdminClient();
  let query = admin
    .from("schedule_blocks")
    .select("id, starts_at, ends_at, reason")
    .eq("clinic_id", clinicId)
    .eq("professional_member_id", professionalMemberId)
    .is("deleted_at", null)
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  if (excludeBlockId) {
    query = query.neq("id", excludeBlockId);
  }

  const { data } = await query.limit(1);

  return data?.[0] ?? null;
}

async function findRoomConflict(
  clinicId: string,
  roomId: string | null,
  startsAt: string,
  endsAt: string,
  excludeAppointmentId?: string,
) {
  if (!roomId) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("appointments")
    .select("id, starts_at, ends_at, status")
    .eq("clinic_id", clinicId)
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .in("status", [...OPERATIONAL_APPOINTMENT_STATUSES])
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  if (excludeAppointmentId) {
    query = query.neq("id", excludeAppointmentId);
  }

  const { data } = await query.limit(1);

  return data?.[0] ?? null;
}

async function validateAppointmentReferences({
  clinicId,
  patientId,
  professionalMemberId,
  serviceId,
  roomId,
}: {
  clinicId: string;
  patientId: string;
  professionalMemberId: string;
  serviceId: string | null;
  roomId: string | null;
}) {
  const admin = createSupabaseAdminClient();
  const [professional, patientResult, serviceResult, roomResult] = await Promise.all([
    assertProfessionalBelongsToClinic(professionalMemberId, clinicId),
    admin
      .from("patients")
      .select("id")
      .eq("id", patientId)
      .eq("clinic_id", clinicId)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle(),
    serviceId
      ? admin
          .from("clinic_services")
          .select("id")
          .eq("id", serviceId)
          .eq("clinic_id", clinicId)
          .eq("active", true)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: { id: null } }),
    roomId
      ? admin
          .from("clinic_rooms")
          .select("id")
          .eq("id", roomId)
          .eq("clinic_id", clinicId)
          .eq("active", true)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: { id: null } }),
  ]);

  if (!professional) {
    return "Profissional não encontrado na clínica ativa.";
  }

  if (!patientResult.data) {
    return "Paciente não encontrado ou inativo na clínica atual.";
  }

  if (serviceId && !serviceResult.data) {
    return "Serviço não encontrado na clínica ativa.";
  }

  if (roomId && !roomResult.data) {
    return "Consultório não encontrado na clínica ativa.";
  }

  return null;
}

async function validateAppointmentAvailability({
  clinicId,
  professionalMemberId,
  roomId,
  startsAt,
  endsAt,
  excludeAppointmentId,
}: {
  clinicId: string;
  professionalMemberId: string;
  roomId: string | null;
  startsAt: string;
  endsAt: string;
  excludeAppointmentId?: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: settings } = await admin
    .from("schedule_professional_settings")
    .select("buffer_minutes, working_hours")
    .eq("clinic_id", clinicId)
    .eq("professional_member_id", professionalMemberId)
    .is("deleted_at", null)
    .maybeSingle();
  const bufferMinutes = Number(settings?.buffer_minutes ?? 0);
  const bufferedStartsAt = addMinutesIso(startsAt, -bufferMinutes);
  const bufferedEndsAt = addMinutesIso(endsAt, bufferMinutes);
  const [appointmentConflict, blockConflict, roomConflict] = await Promise.all([
    findAppointmentConflict(
      clinicId,
      professionalMemberId,
      bufferedStartsAt,
      bufferedEndsAt,
      excludeAppointmentId,
    ),
    findBlockConflict(clinicId, professionalMemberId, bufferedStartsAt, bufferedEndsAt),
    findRoomConflict(clinicId, roomId, startsAt, endsAt, excludeAppointmentId),
  ]);

  if (appointmentConflict) {
    return "Este profissional já possui compromisso nesse intervalo.";
  }

  if (blockConflict) {
    return "Este horário está bloqueado na agenda do profissional.";
  }

  if (roomConflict) {
    return "O consultório selecionado já está ocupado nesse intervalo.";
  }

  const availabilityError = await validateProfessionalWorkingHours({
    clinicId,
    professionalMemberId,
    startsAt,
    endsAt,
    workingHours: settings?.working_hours,
  });

  if (availabilityError) {
    return availabilityError;
  }

  return null;
}

function localAppointmentParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    year: "numeric",
  }).formatToParts(new Date(value));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    date: `${values.get("year")}-${values.get("month")}-${values.get("day")}`,
    time: `${values.get("hour")}:${values.get("minute")}`,
    weekday: weekdayMap[values.get("weekday") ?? ""] ?? -1,
  };
}

async function validateProfessionalWorkingHours({
  clinicId,
  professionalMemberId,
  startsAt,
  endsAt,
  workingHours,
}: {
  clinicId: string;
  professionalMemberId: string;
  startsAt: string;
  endsAt: string;
  workingHours: unknown;
}) {
  const admin = createSupabaseAdminClient();
  const start = localAppointmentParts(startsAt);
  const end = localAppointmentParts(endsAt);

  if (start.date !== end.date) {
    return "O compromisso deve começar e terminar no mesmo dia.";
  }

  const { data: rules } = await admin
    .from("professional_availability_rules")
    .select(
      "recurrence_type, weekday, specific_date, valid_from, valid_until, start_time, end_time",
    )
    .eq("clinic_id", clinicId)
    .eq("professional_member_id", professionalMemberId)
    .eq("active", true)
    .is("deleted_at", null);

  if (rules && rules.length > 0) {
    const matchesRule = rules.some((rule) => {
      const appliesToDate =
        rule.recurrence_type === "specific_date"
          ? rule.specific_date === start.date
          : rule.weekday === start.weekday &&
            (!rule.valid_from || rule.valid_from <= start.date) &&
            (!rule.valid_until || rule.valid_until >= start.date);

      return (
        appliesToDate &&
        String(rule.start_time).slice(0, 5) <= start.time &&
        String(rule.end_time).slice(0, 5) >= end.time
      );
    });

    return matchesRule
      ? null
      : "O horário está fora da disponibilidade cadastrada para este profissional.";
  }

  if (workingHours && typeof workingHours === "object") {
    const data = workingHours as { days?: string[]; start?: string; end?: string };
    const configured = Boolean(data.days?.length && data.start && data.end);
    const matchesSettings =
      configured &&
      data.days?.includes(String(start.weekday)) &&
      data.start! <= start.time &&
      data.end! >= end.time;

    if (configured && !matchesSettings) {
      return "O horário está fora do expediente configurado para este profissional.";
    }
  }

  return null;
}

export async function createAppointmentAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const parsed = createAppointmentSchema.safeParse({
    patient_id: formData.get("patient_id"),
    professional_member_id: formData.get("professional_member_id"),
    service_id: formData.get("service_id"),
    room_id: formData.get("room_id"),
    appointment_date: formData.get("appointment_date"),
    start_time: formData.get("start_time"),
    duration_minutes: formData.get("duration_minutes"),
    appointment_type: formData.get("appointment_type"),
    channel: formData.get("channel"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = await getScheduleActionContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user } = context;
  const admin = createSupabaseAdminClient();
  const startsAt = localDateTimeToIso(parsed.data.appointment_date, parsed.data.start_time);
  const endsAt = addMinutesIso(startsAt, parsed.data.duration_minutes);
  const [referenceError, availabilityError] = await Promise.all([
    validateAppointmentReferences({
      clinicId: activeClinic.id,
      patientId: parsed.data.patient_id,
      professionalMemberId: parsed.data.professional_member_id,
      serviceId: parsed.data.service_id,
      roomId: parsed.data.room_id,
    }),
    validateAppointmentAvailability({
      clinicId: activeClinic.id,
      professionalMemberId: parsed.data.professional_member_id,
      roomId: parsed.data.room_id,
      startsAt,
      endsAt,
    }),
  ]);

  if (referenceError || availabilityError) {
    return { error: referenceError ?? availabilityError ?? "Agendamento inválido." };
  }

  const { data: appointment, error } = await admin
    .from("appointments")
    .insert({
      clinic_id: activeClinic.id,
      patient_id: parsed.data.patient_id,
      professional_member_id: parsed.data.professional_member_id,
      service_id: parsed.data.service_id,
      room_id: parsed.data.room_id,
      scheduled_by: user.id,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "scheduled",
      appointment_type: parsed.data.appointment_type,
      channel: parsed.data.channel,
      notes: parsed.data.notes,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !appointment) {
    const errorMessage = error?.message.toLowerCase() ?? "";
    const isProfessionalConflict = errorMessage.includes("appointments_no_active_overlap");
    const isRoomConflict = errorMessage.includes("appointments_no_active_room_overlap");
    return {
      error: isProfessionalConflict
        ? "Outro compromisso foi criado nesse mesmo intervalo. Atualize a agenda e tente outro horário."
        : isRoomConflict
          ? "O consultório acabou de ser ocupado nesse intervalo. Selecione outro espaço."
        : "Não foi possível criar o agendamento.",
    };
  }

  await admin.from("appointment_workflow_events").insert({
    clinic_id: activeClinic.id,
    appointment_id: appointment.id,
    to_status: "scheduled",
    notes: "Compromisso criado na agenda.",
    created_by: user.id,
    updated_by: user.id,
  });

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "appointment_created",
    module: "schedule",
    recordTable: "appointments",
    recordId: appointment.id,
    newValues: {
      patient_id: parsed.data.patient_id,
      professional_member_id: parsed.data.professional_member_id,
      service_id: parsed.data.service_id,
      room_id: parsed.data.room_id,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "scheduled",
    },
    notes: "Consulta agendada para a clínica ativa.",
  });

  revalidatePath("/agenda");
  revalidatePath("/auditoria");
  return { success: "Consulta agendada com segurança." };
}

export async function updateAppointmentAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const parsed = updateAppointmentSchema.safeParse({
    appointment_id: formData.get("appointment_id"),
    patient_id: formData.get("patient_id"),
    professional_member_id: formData.get("professional_member_id"),
    service_id: formData.get("service_id"),
    room_id: formData.get("room_id"),
    appointment_date: formData.get("appointment_date"),
    start_time: formData.get("start_time"),
    duration_minutes: formData.get("duration_minutes"),
    appointment_type: formData.get("appointment_type"),
    channel: formData.get("channel"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = await getScheduleActionContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user } = context;
  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("appointments")
    .select("*")
    .eq("id", parsed.data.appointment_id)
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!previous) {
    return { error: "Compromisso não encontrado na clínica ativa." };
  }

  if (!["scheduled", "confirmed", "checked_in"].includes(previous.status)) {
    return { error: "Este compromisso não pode mais ser editado. Consulte o histórico da operação." };
  }

  const referenceError = await validateAppointmentReferences({
    clinicId: activeClinic.id,
    patientId: parsed.data.patient_id,
    professionalMemberId: parsed.data.professional_member_id,
    serviceId: parsed.data.service_id,
    roomId: parsed.data.room_id,
  });

  if (referenceError) {
    return { error: referenceError };
  }

  const startsAt = localDateTimeToIso(parsed.data.appointment_date, parsed.data.start_time);
  const endsAt = addMinutesIso(startsAt, parsed.data.duration_minutes);
  const availabilityError = await validateAppointmentAvailability({
    clinicId: activeClinic.id,
    professionalMemberId: parsed.data.professional_member_id,
    roomId: parsed.data.room_id,
    startsAt,
    endsAt,
    excludeAppointmentId: previous.id,
  });

  if (availabilityError) {
    return { error: availabilityError };
  }

  const updatePayload = {
    patient_id: parsed.data.patient_id,
    professional_member_id: parsed.data.professional_member_id,
    service_id: parsed.data.service_id,
    room_id: parsed.data.room_id,
    starts_at: startsAt,
    ends_at: endsAt,
    appointment_type: parsed.data.appointment_type,
    channel: parsed.data.channel,
    notes: parsed.data.notes,
    updated_by: user.id,
  };
  const { error } = await admin
    .from("appointments")
    .update(updatePayload)
    .eq("id", previous.id)
    .eq("clinic_id", activeClinic.id);

  if (error) {
    const message = error.message.toLowerCase();
    return {
      error: message.includes("appointments_no_active_overlap")
        ? "Outro compromisso ocupou este horário. Atualize a agenda e tente novamente."
        : message.includes("appointments_no_active_room_overlap")
          ? "O consultório foi ocupado neste intervalo. Selecione outro espaço."
          : "Não foi possível atualizar o compromisso.",
    };
  }

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "appointment_updated",
    module: "schedule",
    recordTable: "appointments",
    recordId: previous.id,
    oldValues: previous,
    newValues: updatePayload,
    notes: "Dados operacionais do compromisso atualizados.",
  });

  revalidatePath("/agenda");
  revalidatePath("/auditoria");
  return { success: "Compromisso atualizado." };
}

export async function rescheduleAppointmentAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const parsed = rescheduleAppointmentSchema.safeParse({
    appointment_id: formData.get("appointment_id"),
    patient_id: formData.get("patient_id"),
    professional_member_id: formData.get("professional_member_id"),
    service_id: formData.get("service_id"),
    room_id: formData.get("room_id"),
    appointment_date: formData.get("appointment_date"),
    start_time: formData.get("start_time"),
    duration_minutes: formData.get("duration_minutes"),
    appointment_type: formData.get("appointment_type"),
    channel: formData.get("channel"),
    notes: formData.get("notes"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = await getScheduleActionContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user } = context;
  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("appointments")
    .select("*")
    .eq("id", parsed.data.appointment_id)
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!previous || !["scheduled", "confirmed", "checked_in"].includes(previous.status)) {
    return { error: "Este compromisso não pode mais ser remarcado." };
  }

  const referenceError = await validateAppointmentReferences({
    clinicId: activeClinic.id,
    patientId: parsed.data.patient_id,
    professionalMemberId: parsed.data.professional_member_id,
    serviceId: parsed.data.service_id,
    roomId: parsed.data.room_id,
  });

  if (referenceError) {
    return { error: referenceError };
  }

  const startsAt = localDateTimeToIso(parsed.data.appointment_date, parsed.data.start_time);
  const endsAt = addMinutesIso(startsAt, parsed.data.duration_minutes);
  const availabilityError = await validateAppointmentAvailability({
    clinicId: activeClinic.id,
    professionalMemberId: parsed.data.professional_member_id,
    roomId: parsed.data.room_id,
    startsAt,
    endsAt,
    excludeAppointmentId: previous.id,
  });

  if (availabilityError) {
    return { error: availabilityError };
  }

  const { data: newAppointmentId, error } = await admin.rpc("reschedule_appointment", {
    source_appointment_id: previous.id,
    clinic_uuid: activeClinic.id,
    patient_uuid: parsed.data.patient_id,
    professional_member_uuid: parsed.data.professional_member_id,
    service_uuid: parsed.data.service_id,
    room_uuid: parsed.data.room_id,
    new_starts_at: startsAt,
    new_ends_at: endsAt,
    new_appointment_type: parsed.data.appointment_type,
    new_channel: parsed.data.channel,
    new_notes: parsed.data.notes,
    reschedule_reason: parsed.data.reason,
    actor_uuid: user.id,
  });

  if (error || !newAppointmentId) {
    const message = error?.message.toLowerCase() ?? "";
    return {
      error: message.includes("appointments_no_active_overlap")
        ? "O novo horário acabou de ser ocupado por outro compromisso."
        : message.includes("appointments_no_active_room_overlap")
          ? "O consultório acabou de ser ocupado no novo horário."
          : "Não foi possível concluir a remarcação.",
    };
  }

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "appointment_rescheduled",
    module: "schedule",
    recordTable: "appointments",
    recordId: previous.id,
    oldValues: previous,
    newValues: {
      replacement_appointment_id: newAppointmentId,
      starts_at: startsAt,
      ends_at: endsAt,
      reason: parsed.data.reason,
    },
    notes: "Compromisso anterior preservado e novo horário criado.",
  });

  revalidatePath("/agenda");
  revalidatePath("/auditoria");
  return { success: "Consulta remarcada e histórico preservado." };
}

export async function sendAppointmentNotificationAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const parsed = sendAppointmentNotificationSchema.safeParse({
    appointment_id: formData.get("appointment_id"),
    channel: formData.get("channel"),
  });

  if (!parsed.success) {
    return { error: "Notificação não identificada." };
  }

  const context = await getScheduleActionContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user } = context;
  const admin = createSupabaseAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "id, clinic_id, patient_id, professional_member_id, starts_at, confirmation_token, status",
    )
    .eq("id", parsed.data.appointment_id)
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!appointment || !["scheduled", "confirmed"].includes(appointment.status)) {
    return { error: "A confirmação só pode ser enviada para consultas agendadas ou confirmadas." };
  }

  const [{ data: patient }, { data: clinic }, { data: professional }] = await Promise.all([
    admin.from("patients").select("full_name, email, phone").eq("id", appointment.patient_id).single(),
    admin.from("clinics").select("trade_name").eq("id", activeClinic.id).single(),
    admin
      .from("clinic_members")
      .select("profile:profiles!clinic_members_user_id_fkey(full_name)")
      .eq("id", appointment.professional_member_id)
      .single(),
  ]);
  const professionalProfile = Array.isArray(professional?.profile)
    ? professional.profile[0]
    : professional?.profile;
  const recipient = parsed.data.channel === "email" ? patient?.email : patient?.phone;

  if (!recipient) {
    return {
      error:
        parsed.data.channel === "email"
          ? "O paciente não possui e-mail cadastrado."
          : "O paciente não possui telefone cadastrado.",
    };
  }

  const confirmationUrl = `${getAppUrl()}/confirmar-consulta/${appointment.confirmation_token}`;
  const { data: notification, error: notificationError } = await admin
    .from("appointment_notifications")
    .insert({
      clinic_id: activeClinic.id,
      appointment_id: appointment.id,
      channel: parsed.data.channel,
      recipient,
      status: "pending",
      payload: {
        confirmation_url: confirmationUrl,
        patient_name: patient?.full_name,
        professional_name: professionalProfile?.full_name,
        starts_at: appointment.starts_at,
      },
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (notificationError || !notification) {
    return { error: "Não foi possível registrar a notificação." };
  }

  if (parsed.data.channel === "whatsapp") {
    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "appointment_whatsapp_queued",
      module: "schedule",
      recordTable: "appointment_notifications",
      recordId: notification.id,
      newValues: { appointment_id: appointment.id, channel: "whatsapp", recipient },
      notes: "Mensagem preparada para futura integração oficial com WhatsApp.",
    });

    revalidatePath("/agenda");
    revalidatePath("/auditoria");
    return { success: "Mensagem de WhatsApp preparada na fila de notificações." };
  }

  const emailResult = await sendAppointmentConfirmationEmail({
    to: recipient,
    patientName: patient?.full_name ?? "Paciente",
    clinicName: clinic?.trade_name ?? "Clínica",
    professionalName: professionalProfile?.full_name ?? "Profissional",
    startsAtLabel: formatDateTimeBr(appointment.starts_at),
    confirmationUrl,
    idempotencyKey: `appointment-confirmation-${notification.id}`,
  });
  const now = new Date().toISOString();

  await admin
    .from("appointment_notifications")
    .update({
      status: emailResult.sent ? "sent" : "failed",
      provider_message_id: emailResult.sent ? emailResult.providerMessageId : null,
      error_message: emailResult.sent ? null : emailResult.error,
      sent_at: emailResult.sent ? now : null,
      updated_by: user.id,
    })
    .eq("id", notification.id);

  if (!emailResult.sent) {
    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "appointment_notification_failed",
      module: "schedule",
      recordTable: "appointment_notifications",
      recordId: notification.id,
      newValues: {
        appointment_id: appointment.id,
        channel: "email",
        reason: emailResult.reason,
      },
      level: "warning",
      notes: "Tentativa de envio da confirmação por e-mail não concluída.",
    });
    revalidatePath("/auditoria");

    return {
      error:
        emailResult.reason === "not_configured"
          ? "E-mail registrado, mas o provedor ainda não está configurado."
          : `O provedor recusou o envio: ${emailResult.error}`,
    };
  }

  await admin
    .from("appointments")
    .update({
      confirmation_sent_at: now,
      last_notification_at: now,
      updated_by: user.id,
    })
    .eq("id", appointment.id);

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "appointment_confirmation_email_sent",
    module: "schedule",
    recordTable: "appointment_notifications",
    recordId: notification.id,
    newValues: { appointment_id: appointment.id, channel: "email", recipient },
    notes: "Confirmação de consulta enviada por e-mail.",
  });

  revalidatePath("/agenda");
  revalidatePath("/auditoria");
  return { success: "Confirmação enviada por e-mail." };
}

export async function updateAppointmentStatusAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const parsed = updateAppointmentStatusSchema.safeParse({
    appointment_id: formData.get("appointment_id"),
    status: formData.get("status"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = await getAuthenticatedScheduleContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user } = context;
  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("appointments")
    .select("id, clinic_id, professional_member_id, status, confirmed_at, cancellation_reason")
    .eq("id", parsed.data.appointment_id)
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!previous) {
    return { error: "Agendamento não encontrado na clínica ativa." };
  }

  const access = await getScheduleAccess(activeClinic.id);

  if (
    !access.canManage &&
    (!access.canOperateOwn ||
      !access.currentMemberId ||
      previous.professional_member_id !== access.currentMemberId)
  ) {
    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "access_denied",
      module: "schedule",
      recordTable: "appointments",
      recordId: parsed.data.appointment_id,
      level: "security",
      notes: "Tentativa de atualizar consulta de outro profissional.",
    });

    return { error: "Você só pode atualizar consultas vinculadas ao seu próprio perfil." };
  }

  if (previous.status === parsed.data.status) {
    return { success: "Status já estava atualizado." };
  }

  if (["in_triage", "in_progress", "completed"].includes(parsed.data.status)) {
    return {
      error:
        "Após registrar a chegada, avance a pré-consulta em Enfermagem e a consulta em Atendimentos.",
    };
  }

  const previousStatus = previous.status as AppointmentStatus;

  if (!APPOINTMENT_STATUS_TRANSITIONS[previousStatus].includes(parsed.data.status)) {
    return { error: "Esta mudança de etapa não é permitida pelo fluxo operacional." };
  }

  if (
    ["cancelled", "no_show", "rescheduled"].includes(parsed.data.status) &&
    !parsed.data.notes
  ) {
    return { error: "Informe o motivo desta alteração de status." };
  }

  const changedAt = new Date().toISOString();
  const baseUpdatePayload = {
    status: parsed.data.status,
    confirmed_at:
      parsed.data.status === "confirmed" && !previous.confirmed_at
        ? changedAt
        : previous.confirmed_at,
    cancellation_reason: ["cancelled", "no_show", "rescheduled"].includes(parsed.data.status)
      ? parsed.data.notes
      : previous.cancellation_reason,
    updated_by: user.id,
  };
  const updatePayload = {
    ...baseUpdatePayload,
    checked_in_at: parsed.data.status === "checked_in" ? changedAt : undefined,
    started_at: parsed.data.status === "in_progress" ? changedAt : undefined,
    completed_at: parsed.data.status === "completed" ? changedAt : undefined,
    cancelled_at: parsed.data.status === "cancelled" ? changedAt : undefined,
    no_show_at: parsed.data.status === "no_show" ? changedAt : undefined,
  };

  let { error } = await admin
    .from("appointments")
    .update(updatePayload)
    .eq("id", parsed.data.appointment_id);

  if (error && /checked_in_at|started_at|completed_at|cancelled_at|no_show_at/i.test(error.message)) {
    const fallbackResult = await admin
      .from("appointments")
      .update(baseUpdatePayload)
      .eq("id", parsed.data.appointment_id);
    error = fallbackResult.error;
  }

  if (error) {
    return { error: "Não foi possível atualizar o status da consulta." };
  }

  await admin.from("appointment_workflow_events").insert({
    clinic_id: activeClinic.id,
    appointment_id: parsed.data.appointment_id,
    from_status: previous.status,
    to_status: parsed.data.status,
    notes: parsed.data.notes,
    created_by: user.id,
    updated_by: user.id,
  });

  if (parsed.data.status === "checked_in") {
    const syncResult = await ensureClinicalEncounterForAppointment(
      parsed.data.appointment_id,
      user.id,
    );

    if (!syncResult.ok) {
      await logAuditEvent({
        clinicId: activeClinic.id,
        userId: user.id,
        actionType: "clinical_workflow_sync_failed",
        module: "schedule",
        recordTable: "appointments",
        recordId: parsed.data.appointment_id,
        oldValues: { status: previous.status },
        newValues: { status: parsed.data.status, sync_error: syncResult.error },
        level: "warning",
        notes: "Chegada registrada, mas o atendimento assistencial não foi inicializado.",
      });

      revalidatePath("/agenda");
      revalidatePath("/atendimentos");
      revalidatePath("/enfermagem");
      revalidatePath("/auditoria");
      return {
        error:
          "Chegada registrada, mas o fluxo assistencial não foi iniciado. Atualize a Agenda ou peça a um administrador para revisar o vínculo do atendimento.",
      };
    }

    if (syncResult.created) {
      await logAuditEvent({
        clinicId: activeClinic.id,
        userId: user.id,
        actionType: "clinical_workflow_created",
        module: "schedule",
        recordTable: "clinical_encounters",
        recordId: syncResult.encounterId,
        newValues: { appointment_id: parsed.data.appointment_id },
        level: "security",
        notes: "Atendimento assistencial criado automaticamente após chegada do paciente.",
      });
    }
  }

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "appointment_status_updated",
    module: "schedule",
    recordTable: "appointments",
    recordId: parsed.data.appointment_id,
    oldValues: { status: previous.status, cancellation_reason: previous.cancellation_reason },
    newValues: {
      status: parsed.data.status,
      cancellation_reason: updatePayload.cancellation_reason,
      notes: parsed.data.notes,
    },
    notes: "Status da consulta atualizado no fluxo operacional.",
  });

  revalidatePath("/agenda");
  revalidatePath("/atendimentos");
  revalidatePath("/enfermagem");
  revalidatePath("/auditoria");
  return { success: "Status da consulta atualizado." };
}

export async function createScheduleBlockAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const parsed = createScheduleBlockSchema.safeParse({
    id: formData.get("id") || undefined,
    professional_member_id: formData.get("professional_member_id"),
    block_date: formData.get("block_date"),
    start_time: formData.get("start_time"),
    end_time: formData.get("end_time"),
    block_type: formData.get("block_type"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = await getScheduleActionContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user } = context;
  const admin = createSupabaseAdminClient();
  const professional = await assertProfessionalBelongsToClinic(
    parsed.data.professional_member_id,
    activeClinic.id,
  );

  if (!professional) {
    return { error: "Profissional não encontrado na clínica ativa." };
  }

  const startsAt = localDateTimeToIso(parsed.data.block_date, parsed.data.start_time);
  const endsAt = localDateTimeToIso(parsed.data.block_date, parsed.data.end_time);
  const [appointmentConflict, blockConflict] = await Promise.all([
    findAppointmentConflict(activeClinic.id, parsed.data.professional_member_id, startsAt, endsAt),
    findBlockConflict(
      activeClinic.id,
      parsed.data.professional_member_id,
      startsAt,
      endsAt,
      parsed.data.id,
    ),
  ]);

  if (appointmentConflict) {
    return { error: "Não é possível bloquear horário com consulta ativa nesse intervalo." };
  }

  if (blockConflict) {
    return { error: "Já existe um bloqueio nesse intervalo." };
  }

  const payload = {
    professional_member_id: parsed.data.professional_member_id,
    starts_at: startsAt,
    ends_at: endsAt,
    block_type: parsed.data.block_type,
    reason: parsed.data.reason,
    updated_by: user.id,
  };
  const { data: previous } = parsed.data.id
    ? await admin
        .from("schedule_blocks")
        .select("*")
        .eq("id", parsed.data.id)
        .eq("clinic_id", activeClinic.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  if (parsed.data.id && !previous) {
    return { error: "Bloqueio não encontrado na clínica ativa." };
  }

  const result = parsed.data.id
    ? await admin.from("schedule_blocks").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("schedule_blocks")
        .insert({
          clinic_id: activeClinic.id,
          ...payload,
          created_by: user.id,
        })
        .select("id")
        .single();
  const { data: block, error } = result;

  if (error || !block) {
    return { error: "Não foi possível bloquear o horário." };
  }

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: parsed.data.id ? "schedule_block_updated" : "schedule_block_created",
    module: "schedule",
    recordTable: "schedule_blocks",
    recordId: block.id,
    oldValues: previous,
    newValues: payload,
    notes: parsed.data.id
      ? "Bloqueio atualizado na agenda do profissional."
      : "Bloqueio criado na agenda do profissional.",
  });

  revalidatePath("/agenda");
  revalidatePath("/cadastros");
  revalidatePath("/auditoria");
  return { success: parsed.data.id ? "Bloqueio atualizado." : "Horário bloqueado na agenda." };
}

export async function deleteScheduleBlockAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const parsed = deleteScheduleBlockSchema.safeParse({ id: formData.get("id") });

  if (!parsed.success) {
    return { error: "Bloqueio não identificado." };
  }

  const context = await getScheduleActionContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user } = context;
  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("schedule_blocks")
    .select("*")
    .eq("id", parsed.data.id)
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!previous) {
    return { error: "Bloqueio não encontrado na clínica ativa." };
  }

  const deletedAt = new Date().toISOString();
  const { error } = await admin
    .from("schedule_blocks")
    .update({ deleted_at: deletedAt, updated_by: user.id })
    .eq("id", parsed.data.id);

  if (error) {
    return { error: "Não foi possível remover o bloqueio." };
  }

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "schedule_block_deleted",
    module: "schedule",
    recordTable: "schedule_blocks",
    recordId: parsed.data.id,
    oldValues: previous,
    newValues: { deleted_at: deletedAt },
    level: "warning",
    notes: "Bloqueio removido por soft delete.",
  });

  revalidatePath("/agenda");
  revalidatePath("/cadastros");
  revalidatePath("/auditoria");
  return { success: "Bloqueio removido." };
}

export async function deleteAppointmentAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const parsed = deleteAppointmentSchema.safeParse({
    appointment_id: formData.get("appointment_id"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados de exclusão inválidos." };
  }

  const context = await getAuthenticatedScheduleContext();
  if ("error" in context) return { error: context.error };

  const { activeClinic, user } = context;
  const access = await getScheduleAccess(activeClinic.id);

  if (!access.canDelete) {
    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "access_denied",
      module: "schedule",
      recordTable: "appointments",
      recordId: parsed.data.appointment_id,
      level: "security",
      notes: "Tentativa de excluir compromisso sem permissão schedule.delete.",
    });
    return { error: "Seu perfil não possui permissão para excluir agendamentos." };
  }

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("appointments")
    .select("*")
    .eq("id", parsed.data.appointment_id)
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!previous) return { error: "Agendamento não encontrado na clínica ativa." };

  if (!["scheduled", "confirmed"].includes(previous.status)) {
    return {
      error:
        "Após a chegada do paciente, preserve o histórico usando cancelamento, falta ou remarcação.",
    };
  }

  const { count: encounterCount, error: encounterError } = await admin
    .from("clinical_encounters")
    .select("id", { count: "exact", head: true })
    .eq("appointment_id", previous.id)
    .is("deleted_at", null);

  if (encounterError) {
    return {
      error:
        "Não foi possível validar o vínculo assistencial. Confirme se as migrations clínicas foram aplicadas.",
    };
  }

  if ((encounterCount ?? 0) > 0) {
    return { error: "Este agendamento já possui fluxo assistencial e não pode ser excluído." };
  }

  const changedAt = new Date().toISOString();
  const payload = {
    status: "cancelled" as const,
    cancellation_reason: parsed.data.reason,
    cancelled_at: changedAt,
    deleted_at: changedAt,
    updated_by: user.id,
  };
  const { error } = await admin
    .from("appointments")
    .update(payload)
    .eq("id", previous.id)
    .eq("clinic_id", activeClinic.id);

  if (error) return { error: "Não foi possível excluir o agendamento." };

  await admin.from("appointment_workflow_events").insert({
    clinic_id: activeClinic.id,
    appointment_id: previous.id,
    from_status: previous.status,
    to_status: "cancelled",
    notes: `Agendamento excluído: ${parsed.data.reason}`,
    created_by: user.id,
    updated_by: user.id,
  });

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "appointment_deleted",
    module: "schedule",
    recordTable: "appointments",
    recordId: previous.id,
    oldValues: previous,
    newValues: payload,
    level: "warning",
    notes: "Agendamento removido por soft delete antes do início assistencial.",
  });

  revalidatePath("/agenda");
  revalidatePath("/auditoria");
  return { success: "Agendamento excluído com rastreabilidade." };
}

export async function upsertProfessionalScheduleSettingsAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const parsed = upsertProfessionalScheduleSettingsSchema.safeParse({
    professional_member_id: formData.get("professional_member_id"),
    slot_minutes: formData.get("slot_minutes"),
    buffer_minutes: formData.get("buffer_minutes"),
    default_location: formData.get("default_location"),
    online_booking_enabled: formData.get("online_booking_enabled") ?? "off",
    workday_start: formData.get("workday_start"),
    workday_end: formData.get("workday_end"),
    weekdays: formData.getAll("weekdays").map(String),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = await getScheduleActionContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user } = context;
  const admin = createSupabaseAdminClient();
  const professional = await assertProfessionalBelongsToClinic(
    parsed.data.professional_member_id,
    activeClinic.id,
  );

  if (!professional) {
    return { error: "Profissional não encontrado na clínica ativa." };
  }

  const { data: previous } = await admin
    .from("schedule_professional_settings")
    .select("id, slot_minutes, buffer_minutes, default_location, online_booking_enabled, working_hours")
    .eq("clinic_id", activeClinic.id)
    .eq("professional_member_id", parsed.data.professional_member_id)
    .is("deleted_at", null)
    .maybeSingle();

  const workingHours = {
    days: parsed.data.weekdays,
    start: parsed.data.workday_start,
    end: parsed.data.workday_end,
  };

  const { data: settings, error } = await admin
    .from("schedule_professional_settings")
    .upsert(
      {
        clinic_id: activeClinic.id,
        professional_member_id: parsed.data.professional_member_id,
        slot_minutes: parsed.data.slot_minutes,
        buffer_minutes: parsed.data.buffer_minutes,
        default_location: parsed.data.default_location,
        online_booking_enabled: parsed.data.online_booking_enabled,
        working_hours: workingHours,
        deleted_at: null,
        created_by: user.id,
        updated_by: user.id,
      },
      { onConflict: "clinic_id,professional_member_id" },
    )
    .select("id")
    .single();

  if (error || !settings) {
    return { error: "Não foi possível salvar a configuração do profissional." };
  }

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "schedule_settings_updated",
    module: "schedule",
    recordTable: "schedule_professional_settings",
    recordId: settings.id,
    oldValues: previous
      ? {
          slot_minutes: previous.slot_minutes,
          buffer_minutes: previous.buffer_minutes,
          default_location: previous.default_location,
          online_booking_enabled: previous.online_booking_enabled,
          working_hours: previous.working_hours,
        }
      : null,
    newValues: {
      slot_minutes: parsed.data.slot_minutes,
      buffer_minutes: parsed.data.buffer_minutes,
      default_location: parsed.data.default_location,
      online_booking_enabled: parsed.data.online_booking_enabled,
      working_hours: workingHours,
    },
    notes: "Configuração da agenda do profissional atualizada.",
  });

  revalidatePath("/agenda");
  revalidatePath("/cadastros");
  revalidatePath("/auditoria");
  return { success: "Configuração da agenda salva." };
}

export async function confirmPatientAppointmentAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const token = String(formData.get("token") ?? "").trim();

  if (!token || token.length < 20) {
    return { error: "Link de confirmação inválido." };
  }

  const admin = createSupabaseAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, clinic_id, status, confirmed_at")
    .eq("confirmation_token", token)
    .is("deleted_at", null)
    .maybeSingle();

  if (!appointment) {
    return { error: "Consulta não encontrada para este link." };
  }

  if (!PATIENT_CONFIRMABLE_STATUSES.includes(appointment.status)) {
    return { error: "Esta consulta não pode mais ser confirmada por link." };
  }

  if (appointment.status === "confirmed" && appointment.confirmed_at) {
    return { success: "Consulta já estava confirmada." };
  }

  const confirmedAt = new Date().toISOString();
  const { error } = await admin
    .from("appointments")
    .update({
      status: "confirmed",
      confirmed_at: confirmedAt,
      updated_by: null,
    })
    .eq("id", appointment.id);

  if (error) {
    return { error: "Não foi possível confirmar a consulta. Tente novamente." };
  }

  await admin.from("appointment_workflow_events").insert({
    clinic_id: appointment.clinic_id,
    appointment_id: appointment.id,
    from_status: appointment.status,
    to_status: "confirmed",
    notes: "Paciente confirmou a consulta por link público.",
  });

  await logAuditEvent({
    clinicId: appointment.clinic_id,
    userId: null,
    actionType: "patient_appointment_confirmed",
    module: "schedule",
    recordTable: "appointments",
    recordId: appointment.id,
    oldValues: { status: appointment.status, confirmed_at: appointment.confirmed_at },
    newValues: { status: "confirmed", confirmed_at: confirmedAt },
    notes: "Paciente confirmou a consulta pelo link de confirmação.",
  });

  revalidatePath(`/confirmar-consulta/${token}`);
  revalidatePath("/agenda");
  revalidatePath("/auditoria");
  return { success: "Consulta confirmada com sucesso." };
}
