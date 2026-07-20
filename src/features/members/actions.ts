"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAppUrl } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  acceptInviteSchema,
  inviteMemberSchema,
  removeMemberSchema,
  updateMemberPermissionSchema,
  updateMemberPermissionsSchema,
  updateMemberRoleSchema,
  updateMemberStatusSchema,
} from "@/features/members/validation";
import {
  CRITICAL_PERMISSION_OPTIONS,
  roleHasDefaultPermission,
} from "@/config/permissions";
import { logAuditEvent } from "@/services/audit/audit-service";

export type MemberActionState = {
  error?: string;
  success?: string;
};

async function canManageMembers(clinicId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("user_has_permission", {
    clinic_uuid: clinicId,
    permission_module: "members",
    permission_action: "manage",
  });

  return data === true;
}

async function canManagePermissions(clinicId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("user_has_permission", {
    clinic_uuid: clinicId,
    permission_module: "permissions",
    permission_action: "manage",
  });

  return data === true;
}

async function hasProtectedMemberReferences({
  memberId,
  userId,
  currentMembershipId,
}: {
  memberId: string;
  userId: string;
  currentMembershipId: string;
}) {
  const admin = createSupabaseAdminClient();

  const userReferenceTables = [
    "permission_catalog",
    "role_permissions",
    "member_permissions",
    "patients",
    "clinic_services",
    "clinic_rooms",
    "registration_preferences",
    "appointment_workflow_events",
    "clinic_invitations",
  ];
  const memberReferenceTables = [
    "clinic_professional_profiles",
    "professional_availability_rules",
    "schedule_professional_settings",
    "schedule_blocks",
  ];

  const checks = [
    admin.from("clinic_members").select("id").eq("user_id", userId).neq("id", currentMembershipId).limit(1),
    admin.from("clinics").select("id").or(`created_by.eq.${userId},updated_by.eq.${userId}`).limit(1),
    admin
      .from("subscriptions")
      .select("id")
      .or(`owner_user_id.eq.${userId},created_by.eq.${userId},updated_by.eq.${userId}`)
      .limit(1),
    admin
      .from("invoices")
      .select("id")
      .or(`owner_user_id.eq.${userId},created_by.eq.${userId},updated_by.eq.${userId}`)
      .limit(1),
    admin
      .from("billing_events")
      .select("id")
      .or(`owner_user_id.eq.${userId},created_by.eq.${userId},updated_by.eq.${userId}`)
      .limit(1),
    admin
      .from("clinic_members")
      .select("id")
      .neq("id", currentMembershipId)
      .or(`invited_by.eq.${userId},created_by.eq.${userId},updated_by.eq.${userId}`)
      .limit(1),
    admin
      .from("appointments")
      .select("id")
      .or(
        `professional_member_id.eq.${memberId},scheduled_by.eq.${userId},created_by.eq.${userId},updated_by.eq.${userId}`,
      )
      .limit(1),
    ...userReferenceTables.map((table) =>
      admin
        .from(table)
        .select("id")
        .or(`created_by.eq.${userId},updated_by.eq.${userId}`)
        .limit(1),
    ),
    ...memberReferenceTables.map((table) =>
      admin.from(table).select("id").eq("professional_member_id", memberId).limit(1),
    ),
  ];

  const results = await Promise.all(checks);
  return results.some((result) => Boolean(result.error) || Boolean(result.data?.length));
}

export async function inviteMemberAction(
  _state: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const parsed = inviteMemberSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    cpf: formData.get("cpf"),
    phone: formData.get("phone"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const [{ activeClinic }, supabase] = await Promise.all([
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);

  if (!activeClinic) {
    return { error: "Selecione ou cadastre uma clínica antes de cadastrar usuários." };
  }

  if (!(await canManageMembers(activeClinic.id))) {
    return { error: "Você não possui permissão para cadastrar usuários nesta clínica." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const admin = createSupabaseAdminClient();
  const { data: existingCpf } = await admin
    .from("profiles")
    .select("id, email")
    .eq("cpf", parsed.data.cpf)
    .maybeSingle();

  if (existingCpf && existingCpf.email !== parsed.data.email) {
    return { error: "Este CPF já está vinculado a outro e-mail." };
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("email", parsed.data.email)
    .maybeSingle();

  let targetUserId = existingProfile?.id as string | undefined;
  const inviteRedirectUrl = new URL("/aceitar-convite", getAppUrl());
  inviteRedirectUrl.searchParams.set("clinic", activeClinic.id);

  if (!targetUserId) {
    const { data: invitedUser, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo: inviteRedirectUrl.toString(),
      data: {
        full_name: parsed.data.full_name,
        cpf: parsed.data.cpf,
        phone: parsed.data.phone,
        invited_clinic_id: activeClinic.id,
        invited_role: parsed.data.role,
        invited_by: user.id,
      },
    });

    if (inviteError) {
      return { error: `Não foi possível enviar o convite: ${inviteError.message}` };
    }

    targetUserId = invitedUser.user?.id;

    if (targetUserId) {
      await admin.from("profiles").upsert(
        {
          id: targetUserId,
          full_name: parsed.data.full_name,
          cpf: parsed.data.cpf,
          phone: parsed.data.phone || null,
          email: parsed.data.email,
          updated_by: user.id,
        },
        { onConflict: "id" },
      );
    }
  } else {
    await admin
      .from("profiles")
      .update({
        full_name: parsed.data.full_name,
        cpf: parsed.data.cpf,
        phone: parsed.data.phone || null,
        updated_by: user.id,
      })
      .eq("id", targetUserId);
  }

  if (!targetUserId) {
    return { error: "Não foi possível identificar o usuário cadastrado." };
  }

  const { data: previousMembership } = await admin
    .from("clinic_members")
    .select("id, role, status")
    .eq("clinic_id", activeClinic.id)
    .eq("user_id", targetUserId)
    .maybeSingle();

  const [{ data: clinicLimit }, { count: memberCount }, { count: professionalCount }] = await Promise.all([
    admin
      .from("platform_clinic_limits")
      .select("max_active_users, max_active_professionals")
      .eq("clinic_id", activeClinic.id)
      .maybeSingle(),
    admin
      .from("clinic_members")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", activeClinic.id)
      .in("status", ["active", "invited"])
      .is("deleted_at", null),
    admin
      .from("clinic_members")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", activeClinic.id)
      .in("role", ["doctor", "nurse", "professional"])
      .in("status", ["active", "invited"])
      .is("deleted_at", null),
  ]);
  const maxUsers = clinicLimit?.max_active_users ?? 25;
  const maxProfessionals = clinicLimit?.max_active_professionals ?? 10;
  const isExistingActiveMember = previousMembership?.status === "active" || previousMembership?.status === "invited";
  if (!isExistingActiveMember && (memberCount ?? 0) >= maxUsers) {
    return { error: `Limite da clínica atingido: até ${maxUsers} usuários ativos ou convidados.` };
  }
  if (!isExistingActiveMember && ["doctor", "nurse", "professional"].includes(parsed.data.role) && (professionalCount ?? 0) >= maxProfessionals) {
    return { error: `Limite da clínica atingido: até ${maxProfessionals} profissionais ativos ou convidados.` };
  }

  const { data: targetAuth } = await admin.auth.admin.getUserById(targetUserId);
  const hasConfirmedAccount = Boolean(targetAuth.user?.email_confirmed_at);
  const shouldRemainInvited =
    !existingProfile || previousMembership?.status === "invited" || !hasConfirmedAccount;
  const nextStatus = shouldRemainInvited ? "invited" : "active";

  if (existingProfile && shouldRemainInvited) {
    const { error: resendError } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: inviteRedirectUrl.toString(),
    });

    if (resendError) {
      return { error: `Não foi possível reenviar o acesso: ${resendError.message}` };
    }
  }

  const { data: membership, error: memberError } = await admin
    .from("clinic_members")
    .upsert(
      {
        clinic_id: activeClinic.id,
        user_id: targetUserId,
        role: parsed.data.role,
        status: nextStatus,
        joined_at: nextStatus === "active" ? new Date().toISOString() : null,
        invited_by: user.id,
        created_by: user.id,
        updated_by: user.id,
      },
      { onConflict: "clinic_id,user_id" },
    )
    .select("id")
    .single();

  if (memberError) {
    if (memberError.message.includes("clinic_user_limit_reached")) {
      return { error: `Limite da clínica atingido: até ${maxUsers} usuários ativos ou convidados.` };
    }
    if (memberError.message.includes("clinic_professional_limit_reached")) {
      return { error: `Limite da clínica atingido: até ${maxProfessionals} profissionais ativos ou convidados.` };
    }
    return { error: "Não foi possível vincular o usuário à clínica." };
  }

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: previousMembership ? "member_updated" : nextStatus === "active" ? "member_added" : "member_invited",
    module: "members",
    recordTable: "clinic_members",
    recordId: membership.id,
    oldValues: previousMembership
      ? {
          role: previousMembership.role,
          status: previousMembership.status,
        }
      : null,
    newValues: {
      email: parsed.data.email,
      role: parsed.data.role,
      status: nextStatus,
    },
    notes:
      nextStatus === "active"
        ? "Usuário existente vinculado à clínica."
        : existingProfile
          ? "Acesso pendente reenviado ao usuário convidado."
          : "Usuário convidado e vinculado à clínica.",
  });

  revalidatePath("/usuarios");
  return {
    success:
      nextStatus === "active"
        ? "Usuário cadastrado e vinculado à clínica."
        : existingProfile
          ? "Convite pendente reenviado por e-mail."
          : "Usuário convidado por e-mail.",
  };
}

export async function acceptInviteAction(
  _state: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const parsed = acceptInviteSchema.safeParse({
    clinic_id: formData.get("clinic_id"),
    password: formData.get("password"),
    password_confirm: formData.get("password_confirm"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "O convite expirou. Solicite um novo convite à clínica." };
  }

  const admin = createSupabaseAdminClient();
  const { data: membership } = await admin
    .from("clinic_members")
    .select("id, clinic_id, role, status")
    .eq("clinic_id", parsed.data.clinic_id)
    .eq("user_id", user.id)
    .in("status", ["invited", "active"])
    .is("deleted_at", null)
    .maybeSingle();

  if (!membership) {
    return { error: "Este convite não está mais disponível para o seu usuário." };
  }

  const { error: passwordError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (passwordError) {
    return { error: `Não foi possível definir a senha: ${passwordError.message}` };
  }

  const joinedAt = new Date().toISOString();
  const membershipUpdate =
    membership.status === "active"
      ? { status: "active" as const, updated_by: user.id }
      : { status: "active" as const, joined_at: joinedAt, updated_by: user.id };
  const { error: membershipError } = await admin
    .from("clinic_members")
    .update(membershipUpdate)
    .eq("id", membership.id);

  if (membershipError) {
    return { error: "A senha foi definida, mas não foi possível ativar o acesso à clínica." };
  }

  await logAuditEvent({
    clinicId: membership.clinic_id,
    userId: user.id,
    actionType: "member_invite_accepted",
    module: "members",
    recordTable: "clinic_members",
    recordId: membership.id,
    oldValues: { status: membership.status },
    newValues: { status: "active", joined_at: joinedAt },
    level: "security",
    notes: "Convite aceito e senha inicial definida pelo usuário.",
  });

  revalidatePath("/usuarios");
  redirect("/dashboard?invite=accepted");
}

export async function updateMemberRoleAction(
  _state: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const parsed = updateMemberRoleSchema.safeParse({
    member_id: formData.get("member_id"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("clinic_members")
    .select("clinic_id, user_id, role, status")
    .eq("id", parsed.data.member_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!previous || !(await canManageMembers(previous.clinic_id))) {
    return { error: "Você não possui permissão para alterar membros desta clínica." };
  }

  if (previous.role === "clinic_owner") {
    return { error: "O proprietário principal da clínica não pode ter o papel alterado por esta tela." };
  }

  if (parsed.data.role === "clinic_owner") {
    return { error: "A elevação para proprietário exige um fluxo administrativo específico." };
  }

  if (previous.role === parsed.data.role) {
    return { success: "Nenhuma alteração necessária." };
  }

  const { error } = await admin
    .from("clinic_members")
    .update({
      role: parsed.data.role,
      updated_by: user.id,
    })
    .eq("id", parsed.data.member_id);

  if (error) {
    return { error: "Não foi possível alterar o perfil do usuário." };
  }

  await logAuditEvent({
    clinicId: previous.clinic_id,
    userId: user.id,
    actionType: "member_role_updated",
    module: "members",
    recordTable: "clinic_members",
    recordId: parsed.data.member_id,
    oldValues: { role: previous.role },
    newValues: { role: parsed.data.role },
  });

  revalidatePath("/usuarios");
  return { success: "Perfil do usuário atualizado." };
}

export async function updateMemberStatusAction(
  _state: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const parsed = updateMemberStatusSchema.safeParse({
    member_id: formData.get("member_id"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("clinic_members")
    .select("clinic_id, user_id, role, status")
    .eq("id", parsed.data.member_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!previous || !(await canManageMembers(previous.clinic_id))) {
    return { error: "Você não possui permissão para alterar membros desta clínica." };
  }

  if (previous.user_id === user.id || previous.role === "clinic_owner") {
    return { error: "Você não pode alterar o próprio status nem suspender o proprietário da clínica." };
  }

  if (previous.status === parsed.data.status) {
    return { success: "Nenhuma alteração necessária." };
  }

  const { error } = await admin
    .from("clinic_members")
    .update({
      status: parsed.data.status,
      deleted_at: parsed.data.status === "removed" ? new Date().toISOString() : null,
      updated_by: user.id,
    })
    .eq("id", parsed.data.member_id);

  if (error) {
    return { error: "Não foi possível alterar o status do usuário." };
  }

  await logAuditEvent({
    clinicId: previous.clinic_id,
    userId: user.id,
    actionType: parsed.data.status === "suspended" ? "member_suspended" : "member_status_updated",
    module: "members",
    recordTable: "clinic_members",
    recordId: parsed.data.member_id,
    oldValues: { status: previous.status },
    newValues: { status: parsed.data.status },
    level: parsed.data.status === "suspended" || parsed.data.status === "removed" ? "warning" : "info",
  });

  revalidatePath("/usuarios");
  return { success: "Status do usuário atualizado." };
}

export async function updateMemberPermissionAction(
  _state: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const parsed = updateMemberPermissionSchema.safeParse({
    member_id: formData.get("member_id"),
    module: formData.get("module"),
    action: formData.get("action"),
    enabled: formData.get("enabled"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const admin = createSupabaseAdminClient();
  const { data: member } = await admin
    .from("clinic_members")
    .select("id, clinic_id, user_id, role")
    .eq("id", parsed.data.member_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!member || !(await canManagePermissions(member.clinic_id))) {
    return { error: "Você não possui permissão para gerenciar permissões nesta clínica." };
  }

  if (member.role === "clinic_owner") {
    return { error: "O proprietário já possui acesso total por definição." };
  }

  const { data: previous } = await admin
    .from("member_permissions")
    .select("id, allowed")
    .eq("clinic_id", member.clinic_id)
    .eq("member_id", member.id)
    .eq("module", parsed.data.module)
    .eq("action", parsed.data.action)
    .maybeSingle();

  const { data: permission, error } = await admin
    .from("member_permissions")
    .upsert(
      {
        clinic_id: member.clinic_id,
        member_id: member.id,
        module: parsed.data.module,
        action: parsed.data.action,
        allowed: parsed.data.enabled,
        reason: "Permissão individual configurada pelo painel de usuários.",
        deleted_at: null,
        created_by: user.id,
        updated_by: user.id,
      },
      { onConflict: "clinic_id,member_id,module,action" },
    )
    .select("id")
    .single();

  if (error) {
    return { error: "Não foi possível atualizar a permissão individual." };
  }

  await logAuditEvent({
    clinicId: member.clinic_id,
    userId: user.id,
    actionType: "member_permission_updated",
    module: "permissions",
    recordTable: "member_permissions",
    recordId: permission.id,
    oldValues: previous ? { allowed: previous.allowed } : null,
    newValues: {
      member_id: member.id,
      module: parsed.data.module,
      action: parsed.data.action,
      allowed: parsed.data.enabled,
    },
    level: "security",
    notes: "Permissão individual atualizada para membro da clínica.",
  });

  revalidatePath("/usuarios");
  revalidatePath("/auditoria");
  return { success: parsed.data.enabled ? "Permissão individual liberada." : "Permissão individual removida." };
}

export async function updateMemberPermissionsAction(
  _state: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const parsed = updateMemberPermissionsSchema.safeParse({
    member_id: formData.get("member_id"),
    permissions: formData.getAll("permissions").map(String),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const admin = createSupabaseAdminClient();
  const { data: member } = await admin
    .from("clinic_members")
    .select("id, clinic_id, user_id, role")
    .eq("id", parsed.data.member_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!member || !(await canManagePermissions(member.clinic_id))) {
    return { error: "Você não possui permissão para gerenciar permissões nesta clínica." };
  }

  if (member.role === "clinic_owner") {
    return { error: "O proprietário já possui acesso total por definição." };
  }

  const allowedKeys = new Set(
    CRITICAL_PERMISSION_OPTIONS.map((option) => `${option.module}:${option.action}`),
  );
  const selectedKeys = new Set(parsed.data.permissions.filter((key) => allowedKeys.has(key)));

  const { data: existingPermissions, error: listError } = await admin
    .from("member_permissions")
    .select("id, module, action, allowed, deleted_at")
    .eq("clinic_id", member.clinic_id)
    .eq("member_id", member.id);

  if (listError) {
    return { error: "Não foi possível consultar as permissões atuais." };
  }

  const currentKeys = new Set(
    CRITICAL_PERMISSION_OPTIONS.filter((option) => {
      const existing = (existingPermissions ?? []).find(
        (permission) =>
          permission.module === option.module &&
          permission.action === option.action &&
          !permission.deleted_at,
      );

      return existing
        ? existing.allowed
        : roleHasDefaultPermission(member.role, option.module, option.action);
    }).map((option) => `${option.module}:${option.action}`),
  );

  const changed = [...allowedKeys].some(
    (key) => selectedKeys.has(key) !== currentKeys.has(key),
  );

  if (!changed) {
    return { success: "Nenhuma alteração necessária." };
  }

  for (const option of CRITICAL_PERMISSION_OPTIONS) {
    const key = `${option.module}:${option.action}`;
    const shouldEnable = selectedKeys.has(key);
    const existing = (existingPermissions ?? []).find(
      (permission) =>
        permission.module === option.module &&
        permission.action === option.action &&
        !permission.deleted_at,
    );
    const roleDefault = roleHasDefaultPermission(member.role, option.module, option.action);

    if (existing && existing.allowed !== shouldEnable) {
      const { error } = await admin
        .from("member_permissions")
        .update({
          allowed: shouldEnable,
          deleted_at: null,
          reason: "Permissão individual configurada pelo painel de usuários.",
          updated_by: user.id,
        })
        .eq("id", existing.id);

      if (error) {
        return { error: "Não foi possível atualizar todas as permissões selecionadas." };
      }
    } else if (!existing && shouldEnable !== roleDefault) {
      const { error } = await admin.from("member_permissions").upsert(
        {
          clinic_id: member.clinic_id,
          member_id: member.id,
          module: option.module,
          action: option.action,
          allowed: shouldEnable,
          reason: "Permissão individual configurada pelo painel de usuários.",
          deleted_at: null,
          created_by: user.id,
          updated_by: user.id,
        },
        { onConflict: "clinic_id,member_id,module,action" },
      );

      if (error) {
        return { error: "Não foi possível salvar todas as permissões selecionadas." };
      }
    }
  }

  await logAuditEvent({
    clinicId: member.clinic_id,
    userId: user.id,
    actionType: "member_permissions_updated",
    module: "permissions",
    recordTable: "member_permissions",
    recordId: member.id,
    oldValues: { permissions: [...currentKeys].sort() },
    newValues: { permissions: [...selectedKeys].sort() },
    level: "security",
    notes: "Conjunto de permissões individuais do membro atualizado.",
  });

  revalidatePath("/usuarios");
  revalidatePath("/auditoria");
  return { success: "Permissões individuais atualizadas." };
}

export async function deleteMemberAccountAction(
  _state: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const parsed = removeMemberSchema.safeParse({
    member_id: formData.get("member_id"),
  });

  if (!parsed.success) {
    return { error: "Usuário não identificado." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const admin = createSupabaseAdminClient();
  const { data: member } = await admin
    .from("clinic_members")
    .select("id, clinic_id, user_id, role, status, profile:profiles!clinic_members_user_id_fkey(full_name, email, avatar_url)")
    .eq("id", parsed.data.member_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!member || !(await canManageMembers(member.clinic_id))) {
    return { error: "Você não possui permissão para excluir usuários desta clínica." };
  }

  if (member.user_id === user.id) {
    return { error: "Você não pode excluir a própria conta por esta tela." };
  }

  if (member.role === "clinic_owner") {
    return { error: "O proprietário da clínica não pode ser excluído." };
  }

  if (
    await hasProtectedMemberReferences({
      memberId: member.id,
      userId: member.user_id,
      currentMembershipId: member.id,
    })
  ) {
    return {
      error:
        "Este usuário possui vínculos ou registros no sistema. Para preservar o histórico, altere o status para Suspenso.",
    };
  }

  const profile = member.profile as unknown as {
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;

  if (profile?.avatar_url) {
    const { data: avatarFiles } = await admin.storage.from("avatars").list(member.user_id);
    const paths = (avatarFiles ?? []).map((file) => `${member.user_id}/${file.name}`);

    if (paths.length > 0) {
      await admin.storage.from("avatars").remove(paths);
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(member.user_id, true);

  if (deleteError) {
    return {
      error:
        "A conta não pôde ser excluída porque ainda existe uma referência protegida. Suspenda o acesso e revise a auditoria.",
    };
  }

  const deletedAt = new Date().toISOString();
  const [{ error: membershipError }, { error: profileError }] = await Promise.all([
    admin
      .from("clinic_members")
      .update({
        status: "removed",
        deleted_at: deletedAt,
        updated_by: user.id,
      })
      .eq("id", member.id),
    admin
      .from("profiles")
      .update({
        full_name: "Usuário excluído",
        cpf: null,
        phone: null,
        email: null,
        avatar_url: null,
        app_preferences: {},
        deleted_at: deletedAt,
        updated_by: user.id,
      })
      .eq("id", member.user_id),
  ]);

  if (membershipError || profileError) {
    return {
      error:
        "O acesso foi bloqueado, mas a anonimização cadastral precisa ser revisada por um administrador.",
    };
  }

  await admin
    .from("member_permissions")
    .update({
      allowed: false,
      deleted_at: deletedAt,
      updated_by: user.id,
    })
    .eq("member_id", member.id);

  await logAuditEvent({
    clinicId: member.clinic_id,
    userId: user.id,
    actionType: "member_account_deleted",
    module: "members",
    recordTable: "clinic_members",
    recordId: member.id,
    oldValues: {
      user_id: member.user_id,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      role: member.role,
      status: member.status,
    },
    newValues: {
      status: "removed",
      deleted_at: deletedAt,
      personal_data_anonymized: true,
    },
    level: "critical",
    notes: "Conta sem vínculos operacionais excluída e dados pessoais anonimizados.",
  });

  revalidatePath("/usuarios");
  revalidatePath("/auditoria");
  return { success: "Usuário excluído e dados pessoais anonimizados." };
}
