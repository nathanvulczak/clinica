"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OPERATIONAL_APPOINTMENT_STATUSES } from "@/config/schedule";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  createAppointmentSchema,
  createScheduleBlockSchema,
  deleteScheduleBlockSchema,
  updateAppointmentStatusSchema,
  upsertProfessionalScheduleSettingsSchema,
} from "@/features/schedule/validation";
import { addMinutesIso, localDateTimeToIso } from "@/lib/dates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canManageSchedule,
  getScheduleAccess,
  userHasClinicPermission,
} from "@/repositories/schedule";
import { logAuditEvent } from "@/services/audit/audit-service";

export type ScheduleActionState = {
  error?: string;
  success?: string;
};

const PATIENT_CONFIRMABLE_STATUSES = ["scheduled", "confirmed"];

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
) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("appointments")
    .select("id, starts_at, ends_at, status")
    .eq("clinic_id", clinicId)
    .eq("professional_member_id", professionalMemberId)
    .is("deleted_at", null)
    .in("status", [...OPERATIONAL_APPOINTMENT_STATUSES])
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt)
    .limit(1);

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
) {
  if (!roomId) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("appointments")
    .select("id, starts_at, ends_at, status")
    .eq("clinic_id", clinicId)
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .in("status", [...OPERATIONAL_APPOINTMENT_STATUSES])
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt)
    .limit(1);

  return data?.[0] ?? null;
}

export async function createAppointmentAction(
  _state: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const parsed = createAppointmentSchema.safeParse({
    patient_id: formData.get("patient_id"),
    patient_full_name: formData.get("patient_full_name"),
    patient_cpf: formData.get("patient_cpf"),
    patient_phone: formData.get("patient_phone"),
    patient_email: formData.get("patient_email"),
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
  const professional = await assertProfessionalBelongsToClinic(
    parsed.data.professional_member_id,
    activeClinic.id,
  );

  if (!professional) {
    return { error: "Profissional não encontrado na clínica ativa." };
  }

  const startsAt = localDateTimeToIso(parsed.data.appointment_date, parsed.data.start_time);
  const endsAt = addMinutesIso(startsAt, parsed.data.duration_minutes);
  const [appointmentConflict, blockConflict, roomConflict] = await Promise.all([
    findAppointmentConflict(activeClinic.id, parsed.data.professional_member_id, startsAt, endsAt),
    findBlockConflict(activeClinic.id, parsed.data.professional_member_id, startsAt, endsAt),
    findRoomConflict(activeClinic.id, parsed.data.room_id, startsAt, endsAt),
  ]);

  if (appointmentConflict) {
    return { error: "Este profissional já possui compromisso nesse intervalo." };
  }

  if (blockConflict) {
    return { error: "Este horário está bloqueado na agenda do profissional." };
  }

  if (roomConflict) {
    return { error: "O consultório selecionado já está ocupado nesse intervalo." };
  }

  if (parsed.data.service_id) {
    const { data: service } = await admin
      .from("clinic_services")
      .select("id")
      .eq("id", parsed.data.service_id)
      .eq("clinic_id", activeClinic.id)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (!service) {
      return { error: "Serviço não encontrado na clínica ativa." };
    }
  }

  if (parsed.data.room_id) {
    const { data: room } = await admin
      .from("clinic_rooms")
      .select("id")
      .eq("id", parsed.data.room_id)
      .eq("clinic_id", activeClinic.id)
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (!room) {
      return { error: "Consultório não encontrado na clínica ativa." };
    }
  }

  let patientId = parsed.data.patient_id;

  if (patientId) {
    const { data: selectedPatient } = await admin
      .from("patients")
      .select("id")
      .eq("id", patientId)
      .eq("clinic_id", activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!selectedPatient) {
      return { error: "Paciente não encontrado na clínica ativa." };
    }
  } else {
    const canCreatePatient = await userHasClinicPermission(activeClinic.id, "patients", "create");

    if (!canCreatePatient) {
      return { error: "Você pode agendar pacientes existentes, mas não pode cadastrar novo paciente." };
    }

    if (parsed.data.patient_cpf) {
      const { data: existingPatient } = await admin
        .from("patients")
        .select("id")
        .eq("clinic_id", activeClinic.id)
        .eq("cpf", parsed.data.patient_cpf)
        .is("deleted_at", null)
        .maybeSingle();

      patientId = existingPatient?.id ?? null;
    }

    if (!patientId) {
      const { data: patient, error: patientError } = await admin
        .from("patients")
        .insert({
          clinic_id: activeClinic.id,
          full_name: parsed.data.patient_full_name,
          cpf: parsed.data.patient_cpf,
          phone: parsed.data.patient_phone,
          email: parsed.data.patient_email,
          created_by: user.id,
          updated_by: user.id,
        })
        .select("id")
        .single();

      if (patientError || !patient) {
        return { error: "Não foi possível cadastrar o paciente para o agendamento." };
      }

      patientId = patient.id;
    }
  }

  const { data: appointment, error } = await admin
    .from("appointments")
    .insert({
      clinic_id: activeClinic.id,
      patient_id: patientId,
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
      patient_id: patientId,
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

  const updatePayload = {
    status: parsed.data.status,
    confirmed_at:
      parsed.data.status === "confirmed" && !previous.confirmed_at
        ? new Date().toISOString()
        : previous.confirmed_at,
    cancellation_reason: ["cancelled", "no_show", "rescheduled"].includes(parsed.data.status)
      ? parsed.data.notes
      : previous.cancellation_reason,
    updated_by: user.id,
  };

  const { error } = await admin
    .from("appointments")
    .update(updatePayload)
    .eq("id", parsed.data.appointment_id);

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
