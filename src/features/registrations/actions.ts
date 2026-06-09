"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  availabilitySchema,
  patientSchema,
  registrationDeleteSchema,
  registrationPreferencesSchema,
  roomSchema,
  serviceSchema,
} from "@/features/registrations/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRegistrationAccess } from "@/repositories/registrations";
import { logAuditEvent } from "@/services/audit/audit-service";

export type RegistrationActionState = {
  error?: string;
  success?: string;
};

function databaseErrorMessage(error: { message?: string } | null, fallback: string) {
  const message = error?.message?.toLowerCase() ?? "";

  if (message.includes("does not exist") || message.includes("schema cache")) {
    return "A estrutura de Cadastros ainda não está disponível. Execute a migration 009 no Supabase.";
  }

  if (message.includes("duplicate") || message.includes("unique")) {
    return "Já existe um cadastro ativo com estes dados na clínica.";
  }

  return fallback;
}

function parseCurrencyToCents(value: string) {
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;

  return Math.round(Number(normalized) * 100);
}

async function getRegistrationContext() {
  const [{ activeClinic }, supabase] = await Promise.all([
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);

  if (!activeClinic) {
    return { error: "Selecione ou cadastre uma clínica antes de acessar os cadastros." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const access = await getRegistrationAccess(activeClinic.id);
  return { activeClinic, user, access };
}

export async function savePatientAction(
  _state: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const parsed = patientSchema.safeParse({
    id: formData.get("id") || undefined,
    full_name: formData.get("full_name"),
    social_name: formData.get("social_name"),
    cpf: formData.get("cpf"),
    rg: formData.get("rg"),
    issuing_authority: formData.get("issuing_authority"),
    birth_date: formData.get("birth_date"),
    sex_at_birth: formData.get("sex_at_birth"),
    gender_identity: formData.get("gender_identity"),
    marital_status: formData.get("marital_status"),
    occupation: formData.get("occupation"),
    nationality: formData.get("nationality"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    preferred_contact: formData.get("preferred_contact"),
    postal_code: formData.get("postal_code"),
    address_line: formData.get("address_line"),
    address_number: formData.get("address_number"),
    address_complement: formData.get("address_complement"),
    neighborhood: formData.get("neighborhood"),
    city: formData.get("city"),
    state: formData.get("state"),
    emergency_contact_name: formData.get("emergency_contact_name"),
    emergency_contact_relationship: formData.get("emergency_contact_relationship"),
    emergency_contact_phone: formData.get("emergency_contact_phone"),
    health_plan_name: formData.get("health_plan_name"),
    health_plan_number: formData.get("health_plan_number"),
    health_plan_valid_until: formData.get("health_plan_valid_until"),
    clinical_alerts: formData.get("clinical_alerts"),
    notes: formData.get("notes"),
    consent_lgpd: formData.get("consent_lgpd") ?? "off",
    active: formData.get("active") ?? "off",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = await getRegistrationContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user, access } = context;
  const isEditing = Boolean(parsed.data.id);

  if ((isEditing && !access.canEditPatients) || (!isEditing && !access.canCreatePatients)) {
    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "access_denied",
      module: "patients",
      level: "security",
      notes: `Tentativa de ${isEditing ? "editar" : "criar"} paciente sem permissão.`,
    });

    return { error: "Você não possui permissão para esta ação em pacientes." };
  }

  const admin = createSupabaseAdminClient();
  const { data: preferences } = await admin
    .from("registration_preferences")
    .select("require_patient_cpf, require_patient_email")
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (preferences?.require_patient_cpf && !parsed.data.cpf) {
    return { error: "O CPF é obrigatório conforme as preferências da clínica." };
  }

  if (preferences?.require_patient_email && !parsed.data.email) {
    return { error: "O e-mail é obrigatório conforme as preferências da clínica." };
  }

  if (parsed.data.cpf) {
    let duplicateQuery = admin
      .from("patients")
      .select("id")
      .eq("clinic_id", activeClinic.id)
      .eq("cpf", parsed.data.cpf)
      .is("deleted_at", null);

    if (parsed.data.id) {
      duplicateQuery = duplicateQuery.neq("id", parsed.data.id);
    }

    const { data: duplicate } = await duplicateQuery.maybeSingle();

    if (duplicate) {
      return { error: "Este CPF já está vinculado a outro paciente da clínica." };
    }
  }

  const payload = {
    full_name: parsed.data.full_name,
    social_name: parsed.data.social_name,
    cpf: parsed.data.cpf,
    rg: parsed.data.rg,
    issuing_authority: parsed.data.issuing_authority,
    birth_date: parsed.data.birth_date,
    sex_at_birth: parsed.data.sex_at_birth,
    gender_identity: parsed.data.gender_identity,
    marital_status: parsed.data.marital_status,
    occupation: parsed.data.occupation,
    nationality: parsed.data.nationality,
    phone: parsed.data.phone,
    email: parsed.data.email,
    preferred_contact: parsed.data.preferred_contact,
    postal_code: parsed.data.postal_code,
    address_line: parsed.data.address_line,
    address_number: parsed.data.address_number,
    address_complement: parsed.data.address_complement,
    neighborhood: parsed.data.neighborhood,
    city: parsed.data.city,
    state: parsed.data.state,
    emergency_contact_name: parsed.data.emergency_contact_name,
    emergency_contact_relationship: parsed.data.emergency_contact_relationship,
    emergency_contact_phone: parsed.data.emergency_contact_phone,
    health_plan_name: parsed.data.health_plan_name,
    health_plan_number: parsed.data.health_plan_number,
    health_plan_valid_until: parsed.data.health_plan_valid_until,
    clinical_alerts: parsed.data.clinical_alerts,
    notes: parsed.data.notes,
    consent_lgpd_at: parsed.data.consent_lgpd ? new Date().toISOString() : null,
    active: parsed.data.active,
    updated_by: user.id,
  };

  if (parsed.data.id) {
    const { data: previous } = await admin
      .from("patients")
      .select("*")
      .eq("id", parsed.data.id)
      .eq("clinic_id", activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!previous) {
      return { error: "Paciente não encontrado na clínica ativa." };
    }

    const { error } = await admin.from("patients").update(payload).eq("id", parsed.data.id);

    if (error) {
      return { error: databaseErrorMessage(error, "Não foi possível atualizar o paciente.") };
    }

    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "patient_updated",
      module: "patients",
      recordTable: "patients",
      recordId: parsed.data.id,
      oldValues: previous,
      newValues: payload,
      level: "security",
      notes: "Cadastro do paciente atualizado.",
    });
  } else {
    const { data: patient, error } = await admin
      .from("patients")
      .insert({
        clinic_id: activeClinic.id,
        ...payload,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !patient) {
      return { error: databaseErrorMessage(error, "Não foi possível cadastrar o paciente.") };
    }

    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "patient_created",
      module: "patients",
      recordTable: "patients",
      recordId: patient.id,
      newValues: payload,
      level: "security",
      notes: "Paciente cadastrado na clínica ativa.",
    });
  }

  revalidatePath("/cadastros");
  revalidatePath("/agenda");
  revalidatePath("/auditoria");
  return { success: isEditing ? "Paciente atualizado." : "Paciente cadastrado." };
}

export async function saveServiceAction(
  _state: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const parsed = serviceSchema.safeParse({
    id: formData.get("id") || undefined,
    code: formData.get("code"),
    name: formData.get("name"),
    category: formData.get("category"),
    description: formData.get("description"),
    duration_minutes: formData.get("duration_minutes"),
    price: formData.get("price"),
    color: formData.get("color"),
    requires_authorization: formData.get("requires_authorization") ?? "off",
    active: formData.get("active") ?? "off",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = await getRegistrationContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user, access } = context;
  const isEditing = Boolean(parsed.data.id);

  if ((isEditing && !access.canEditCatalog) || (!isEditing && !access.canCreateCatalog)) {
    return { error: "Você não possui permissão para salvar serviços." };
  }

  const admin = createSupabaseAdminClient();
  const payload = {
    code: parsed.data.code,
    name: parsed.data.name,
    category: parsed.data.category,
    description: parsed.data.description,
    duration_minutes: parsed.data.duration_minutes,
    price_cents: parseCurrencyToCents(parsed.data.price),
    color: parsed.data.color,
    requires_authorization: parsed.data.requires_authorization,
    active: parsed.data.active,
    updated_by: user.id,
  };

  if (parsed.data.id) {
    const { data: previous } = await admin
      .from("clinic_services")
      .select("*")
      .eq("id", parsed.data.id)
      .eq("clinic_id", activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!previous) {
      return { error: "Serviço não encontrado na clínica ativa." };
    }

    const { error } = await admin.from("clinic_services").update(payload).eq("id", parsed.data.id);

    if (error) {
      return { error: databaseErrorMessage(error, "Não foi possível atualizar o serviço.") };
    }

    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "service_updated",
      module: "schedule",
      recordTable: "clinic_services",
      recordId: parsed.data.id,
      oldValues: previous,
      newValues: payload,
    });
  } else {
    const { data: service, error } = await admin
      .from("clinic_services")
      .insert({ clinic_id: activeClinic.id, ...payload, created_by: user.id })
      .select("id")
      .single();

    if (error || !service) {
      return { error: databaseErrorMessage(error, "Não foi possível cadastrar o serviço.") };
    }

    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "service_created",
      module: "schedule",
      recordTable: "clinic_services",
      recordId: service.id,
      newValues: payload,
    });
  }

  revalidatePath("/cadastros");
  revalidatePath("/agenda");
  revalidatePath("/auditoria");
  return { success: isEditing ? "Serviço atualizado." : "Serviço cadastrado." };
}

export async function saveRoomAction(
  _state: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const parsed = roomSchema.safeParse({
    id: formData.get("id") || undefined,
    code: formData.get("code"),
    name: formData.get("name"),
    room_type: formData.get("room_type"),
    floor: formData.get("floor"),
    capacity: formData.get("capacity"),
    resources: formData.get("resources"),
    notes: formData.get("notes"),
    active: formData.get("active") ?? "off",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = await getRegistrationContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user, access } = context;
  const isEditing = Boolean(parsed.data.id);

  if ((isEditing && !access.canEditCatalog) || (!isEditing && !access.canCreateCatalog)) {
    return { error: "Você não possui permissão para salvar consultórios." };
  }

  const admin = createSupabaseAdminClient();
  const payload = {
    code: parsed.data.code,
    name: parsed.data.name,
    room_type: parsed.data.room_type,
    floor: parsed.data.floor,
    capacity: parsed.data.capacity,
    resources: parsed.data.resources,
    notes: parsed.data.notes,
    active: parsed.data.active,
    updated_by: user.id,
  };

  if (parsed.data.id) {
    const { data: previous } = await admin
      .from("clinic_rooms")
      .select("*")
      .eq("id", parsed.data.id)
      .eq("clinic_id", activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!previous) {
      return { error: "Consultório não encontrado na clínica ativa." };
    }

    const { error } = await admin.from("clinic_rooms").update(payload).eq("id", parsed.data.id);

    if (error) {
      return { error: databaseErrorMessage(error, "Não foi possível atualizar o consultório.") };
    }

    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "room_updated",
      module: "schedule",
      recordTable: "clinic_rooms",
      recordId: parsed.data.id,
      oldValues: previous,
      newValues: payload,
    });
  } else {
    const { data: room, error } = await admin
      .from("clinic_rooms")
      .insert({ clinic_id: activeClinic.id, ...payload, created_by: user.id })
      .select("id")
      .single();

    if (error || !room) {
      return { error: databaseErrorMessage(error, "Não foi possível cadastrar o consultório.") };
    }

    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "room_created",
      module: "schedule",
      recordTable: "clinic_rooms",
      recordId: room.id,
      newValues: payload,
    });
  }

  revalidatePath("/cadastros");
  revalidatePath("/agenda");
  revalidatePath("/auditoria");
  return { success: isEditing ? "Consultório atualizado." : "Consultório cadastrado." };
}

export async function saveAvailabilityAction(
  _state: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const parsed = availabilitySchema.safeParse({
    id: formData.get("id") || undefined,
    professional_member_id: formData.get("professional_member_id"),
    room_id: formData.get("room_id"),
    service_id: formData.get("service_id"),
    recurrence_type: formData.get("recurrence_type"),
    weekday: formData.get("weekday"),
    specific_date: formData.get("specific_date"),
    valid_from: formData.get("valid_from"),
    valid_until: formData.get("valid_until"),
    start_time: formData.get("start_time"),
    end_time: formData.get("end_time"),
    slot_minutes: formData.get("slot_minutes"),
    notes: formData.get("notes"),
    active: formData.get("active") ?? "off",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = await getRegistrationContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user, access } = context;
  const isEditing = Boolean(parsed.data.id);
  const ownsAvailability =
    access.currentMemberId === parsed.data.professional_member_id;
  const canWriteAvailability =
    (isEditing ? access.canEditCatalog : access.canCreateCatalog) ||
    (access.canManageOwnAvailability && ownsAvailability);

  if (!canWriteAvailability) {
    return { error: "Você não possui permissão para salvar disponibilidade." };
  }

  if (!access.canManageSchedule && !ownsAvailability) {
    return { error: "Você só pode configurar a própria disponibilidade." };
  }

  const admin = createSupabaseAdminClient();
  const { data: professional } = await admin
    .from("clinic_members")
    .select("id")
    .eq("id", parsed.data.professional_member_id)
    .eq("clinic_id", activeClinic.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!professional) {
    return { error: "Profissional não encontrado na clínica ativa." };
  }

  if (parsed.data.room_id) {
    const { data: room } = await admin
      .from("clinic_rooms")
      .select("id")
      .eq("id", parsed.data.room_id)
      .eq("clinic_id", activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!room) {
      return { error: "Consultório não encontrado na clínica ativa." };
    }
  }

  if (parsed.data.service_id) {
    const { data: service } = await admin
      .from("clinic_services")
      .select("id")
      .eq("id", parsed.data.service_id)
      .eq("clinic_id", activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!service) {
      return { error: "Serviço não encontrado na clínica ativa." };
    }
  }

  const payload = {
    professional_member_id: parsed.data.professional_member_id,
    room_id: parsed.data.room_id,
    service_id: parsed.data.service_id,
    recurrence_type: parsed.data.recurrence_type,
    weekday: parsed.data.recurrence_type === "weekly" ? parsed.data.weekday : null,
    specific_date: parsed.data.recurrence_type === "specific_date" ? parsed.data.specific_date : null,
    valid_from: parsed.data.valid_from,
    valid_until: parsed.data.valid_until,
    start_time: parsed.data.start_time,
    end_time: parsed.data.end_time,
    slot_minutes: parsed.data.slot_minutes,
    notes: parsed.data.notes,
    active: parsed.data.active,
    updated_by: user.id,
  };

  if (parsed.data.id) {
    const { data: previous } = await admin
      .from("professional_availability_rules")
      .select("*")
      .eq("id", parsed.data.id)
      .eq("clinic_id", activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!previous) {
      return { error: "Regra de disponibilidade não encontrada." };
    }

    if (
      !access.canManageSchedule &&
      previous.professional_member_id !== access.currentMemberId
    ) {
      await logAuditEvent({
        clinicId: activeClinic.id,
        userId: user.id,
        actionType: "access_denied",
        module: "schedule",
        recordTable: "professional_availability_rules",
        recordId: parsed.data.id,
        level: "security",
        notes: "Tentativa de editar a disponibilidade de outro profissional.",
      });

      return { error: "Você só pode editar a própria disponibilidade." };
    }

    const { error } = await admin
      .from("professional_availability_rules")
      .update(payload)
      .eq("id", parsed.data.id);

    if (error) {
      return { error: databaseErrorMessage(error, "Não foi possível atualizar a disponibilidade.") };
    }

    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "availability_updated",
      module: "schedule",
      recordTable: "professional_availability_rules",
      recordId: parsed.data.id,
      oldValues: previous,
      newValues: payload,
    });
  } else {
    const { data: availability, error } = await admin
      .from("professional_availability_rules")
      .insert({ clinic_id: activeClinic.id, ...payload, created_by: user.id })
      .select("id")
      .single();

    if (error || !availability) {
      return { error: databaseErrorMessage(error, "Não foi possível cadastrar a disponibilidade.") };
    }

    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "availability_created",
      module: "schedule",
      recordTable: "professional_availability_rules",
      recordId: availability.id,
      newValues: payload,
    });
  }

  revalidatePath("/cadastros");
  revalidatePath("/agenda");
  revalidatePath("/auditoria");
  return { success: isEditing ? "Disponibilidade atualizada." : "Disponibilidade cadastrada." };
}

export async function saveRegistrationPreferencesAction(
  _state: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const parsed = registrationPreferencesSchema.safeParse({
    require_patient_cpf: formData.get("require_patient_cpf") ?? "off",
    require_patient_email: formData.get("require_patient_email") ?? "off",
    default_service_duration: formData.get("default_service_duration"),
    patient_display_name: formData.get("patient_display_name"),
    show_inactive_records: formData.get("show_inactive_records") ?? "off",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const context = await getRegistrationContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user, access } = context;

  if (!access.canManageSchedule) {
    return { error: "Você não possui permissão para alterar as preferências da clínica." };
  }

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("registration_preferences")
    .select("*")
    .eq("clinic_id", activeClinic.id)
    .maybeSingle();

  const payload = {
    clinic_id: activeClinic.id,
    ...parsed.data,
    default_export_format: "csv",
    deleted_at: null,
    updated_by: user.id,
    created_by: previous?.created_by ?? user.id,
  };

  const { data: preferences, error } = await admin
    .from("registration_preferences")
    .upsert(payload, { onConflict: "clinic_id" })
    .select("id")
    .single();

  if (error || !preferences) {
    return { error: databaseErrorMessage(error, "Não foi possível salvar as preferências.") };
  }

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "registration_preferences_updated",
    module: "schedule",
    recordTable: "registration_preferences",
    recordId: preferences.id,
    oldValues: previous,
    newValues: payload,
  });

  revalidatePath("/cadastros");
  revalidatePath("/auditoria");
  return { success: "Preferências de cadastro atualizadas." };
}

export async function deleteRegistrationAction(
  _state: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  const parsed = registrationDeleteSchema.safeParse({
    id: formData.get("id"),
    resource: formData.get("resource"),
  });

  if (!parsed.success) {
    return { error: "Cadastro não identificado." };
  }

  const context = await getRegistrationContext();

  if ("error" in context) {
    return { error: context.error };
  }

  const { activeClinic, user, access } = context;
  const isPatient = parsed.data.resource === "patient";

  const canDeleteOwnAvailability =
    parsed.data.resource === "availability" && access.canManageOwnAvailability;

  if (
    (isPatient && !access.canDeletePatients) ||
    (!isPatient && !access.canDeleteCatalog && !canDeleteOwnAvailability)
  ) {
    return { error: "Você não possui permissão para excluir este cadastro." };
  }

  const resourceMap = {
    patient: { table: "patients", module: "patients" as const, action: "patient_deleted" },
    service: { table: "clinic_services", module: "schedule" as const, action: "service_deleted" },
    room: { table: "clinic_rooms", module: "schedule" as const, action: "room_deleted" },
    availability: {
      table: "professional_availability_rules",
      module: "schedule" as const,
      action: "availability_deleted",
    },
  };
  const resource = resourceMap[parsed.data.resource];
  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from(resource.table)
    .select("*")
    .eq("id", parsed.data.id)
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!previous) {
    return { error: "Cadastro não encontrado na clínica ativa." };
  }

  if (
    parsed.data.resource === "availability" &&
    !access.canManageSchedule &&
    previous.professional_member_id !== access.currentMemberId
  ) {
    return { error: "Você só pode excluir a própria disponibilidade." };
  }

  const deletedAt = new Date().toISOString();
  const { error } = await admin
    .from(resource.table)
    .update({
      deleted_at: deletedAt,
      active: false,
      updated_by: user.id,
    })
    .eq("id", parsed.data.id);

  if (error) {
    return { error: databaseErrorMessage(error, "Não foi possível excluir o cadastro.") };
  }

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: resource.action,
    module: resource.module,
    recordTable: resource.table,
    recordId: parsed.data.id,
    oldValues: previous,
    newValues: { deleted_at: deletedAt, active: false },
    level: isPatient ? "security" : "warning",
    notes: "Cadastro removido por soft delete.",
  });

  revalidatePath("/cadastros");
  revalidatePath("/agenda");
  revalidatePath("/auditoria");
  return { success: "Cadastro excluído com rastreabilidade." };
}
