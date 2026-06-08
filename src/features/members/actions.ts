"use server";

import { revalidatePath } from "next/cache";
import { getAppUrl } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  inviteMemberSchema,
  updateMemberPermissionSchema,
  updateMemberRoleSchema,
  updateMemberStatusSchema,
} from "@/features/members/validation";
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

  if (!targetUserId) {
    const inviteRedirectUrl = new URL("/auth/callback", getAppUrl());
    inviteRedirectUrl.searchParams.set("next", "/login?invite=accepted");

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

  const { data: membership, error: memberError } = await admin
    .from("clinic_members")
    .upsert(
      {
        clinic_id: activeClinic.id,
        user_id: targetUserId,
        role: parsed.data.role,
        status: existingProfile ? "active" : "invited",
        joined_at: existingProfile ? new Date().toISOString() : null,
        invited_by: user.id,
        created_by: user.id,
        updated_by: user.id,
      },
      { onConflict: "clinic_id,user_id" },
    )
    .select("id")
    .single();

  if (memberError) {
    return { error: "Não foi possível vincular o usuário à clínica." };
  }

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: previousMembership ? "member_updated" : existingProfile ? "member_added" : "member_invited",
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
      status: existingProfile ? "active" : "invited",
    },
    notes: existingProfile ? "Usuário existente vinculado à clínica." : "Usuário convidado e vinculado à clínica.",
  });

  revalidatePath("/usuarios");
  return { success: existingProfile ? "Usuário cadastrado e vinculado à clínica." : "Usuário convidado por e-mail." };
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

  if (parsed.data.enabled) {
    const { data: permission, error } = await admin
      .from("member_permissions")
      .upsert(
        {
          clinic_id: member.clinic_id,
          member_id: member.id,
          module: parsed.data.module,
          action: parsed.data.action,
          allowed: true,
          reason: "Permissão individual liberada pelo painel de usuários.",
          deleted_at: null,
          created_by: user.id,
          updated_by: user.id,
        },
        { onConflict: "clinic_id,member_id,module,action" },
      )
      .select("id")
      .single();

    if (error) {
      return { error: "Não foi possível liberar a permissão." };
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
        allowed: true,
      },
      level: "security",
      notes: "Permissão individual liberada para membro da clínica.",
    });
  } else if (previous?.id) {
    const { error } = await admin
      .from("member_permissions")
      .update({
        allowed: false,
        deleted_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", previous.id);

    if (error) {
      return { error: "Não foi possível remover a permissão." };
    }

    await logAuditEvent({
      clinicId: member.clinic_id,
      userId: user.id,
      actionType: "member_permission_updated",
      module: "permissions",
      recordTable: "member_permissions",
      recordId: previous.id,
      oldValues: { allowed: previous.allowed },
      newValues: {
        member_id: member.id,
        module: parsed.data.module,
        action: parsed.data.action,
        allowed: false,
      },
      level: "security",
      notes: "Permissão individual removida de membro da clínica.",
    });
  }

  revalidatePath("/usuarios");
  revalidatePath("/auditoria");
  return { success: parsed.data.enabled ? "Permissão individual liberada." : "Permissão individual removida." };
}
