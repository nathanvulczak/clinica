"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  acceptInviteSchema,
  cancelInvitationSchema,
  inviteMemberSchema,
  invitationIdSchema,
} from "@/features/members/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/env";
import { logAuditEvent } from "@/services/audit/audit-service";

export type InvitationActionState = { error?: string; success?: string; inviteLink?: string };

const MAX_INVITATION_SENDS = 5;
const MIN_RESEND_INTERVAL_MS = 60_000;

async function canManageMembers(clinicId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("user_has_permission", {
    clinic_uuid: clinicId,
    permission_module: "members",
    permission_action: "manage",
  });
  return data === true;
}

async function expireInvitationRows(admin: ReturnType<typeof createSupabaseAdminClient>) {
  await admin.rpc("expire_clinic_invitations");
}

async function getInvitationTtlHours(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  clinicId: string,
) {
  const { data } = await admin
    .from("registration_preferences")
    .select("invitation_ttl_hours")
    .eq("clinic_id", clinicId)
    .maybeSingle<{ invitation_ttl_hours?: number | null }>();
  return Math.min(168, Math.max(24, data?.invitation_ttl_hours ?? 72));
}

async function sendInvitationEmail({
  admin,
  supabase,
  email,
  userId,
  redirectUrl,
  metadata,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  email: string;
  userId?: string | null;
  redirectUrl: string;
  metadata: Record<string, string>;
}) {
  if (!userId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectUrl,
      data: metadata,
    });
    if (error || !data.user) return { userId: null, error: error?.message ?? "Nao foi possivel criar o acesso." };
    return { userId: data.user.id, error: null };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
  return { userId, error: error?.message ?? null };
}

function newInvitationHash() {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

export async function inviteMemberLifecycleAction(
  _state: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const parsed = inviteMemberSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    cpf: formData.get("cpf"),
    phone: formData.get("phone"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };

  const [{ activeClinic }, supabase] = await Promise.all([
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);
  if (!activeClinic) return { error: "Selecione uma clinica antes de cadastrar usuarios." };
  if (!(await canManageMembers(activeClinic.id))) return { error: "Voce nao possui permissao para gerenciar usuarios." };

  const { data: actor } = await supabase.auth.getUser();
  if (!actor.user) return { error: "Sessao expirada. Faca login novamente." };
  if (actor.user.email?.toLowerCase() === parsed.data.email) return { error: "Nao e permitido convidar a propria conta." };

  const admin = createSupabaseAdminClient();
  await expireInvitationRows(admin);
  const { data: existingCpf } = await admin.from("profiles").select("id, email").eq("cpf", parsed.data.cpf).maybeSingle();
  if (existingCpf && existingCpf.email?.toLowerCase() !== parsed.data.email) return { error: "Este CPF ja esta vinculado a outro e-mail." };

  const { data: existingProfile } = await admin.from("profiles").select("id").ilike("email", parsed.data.email).maybeSingle();
  const targetUserId = existingProfile?.id ?? null;
  const { data: openInvitation } = await admin
    .from("clinic_invitations")
    .select("id")
    .eq("clinic_id", activeClinic.id)
    .ilike("email", parsed.data.email)
    .in("status", ["pending", "sent"])
    .is("deleted_at", null)
    .maybeSingle();
  if (openInvitation) return { error: "Ja existe um convite pendente. Use Reenviar convite." };

  const { data: previousMembership } = targetUserId
    ? await admin.from("clinic_members").select("id, role, status").eq("clinic_id", activeClinic.id).eq("user_id", targetUserId).maybeSingle()
    : { data: null };
  if (previousMembership?.status === "active") return { error: "Este usuario ja esta ativo nesta clinica." };

  const [{ data: clinicLimit }, { count: memberCount }, { count: professionalCount }] = await Promise.all([
    admin.from("platform_clinic_limits").select("max_active_users, max_active_professionals").eq("clinic_id", activeClinic.id).maybeSingle(),
    admin.from("clinic_members").select("id", { count: "exact", head: true }).eq("clinic_id", activeClinic.id).in("status", ["active", "invited"]).is("deleted_at", null),
    admin.from("clinic_members").select("id", { count: "exact", head: true }).eq("clinic_id", activeClinic.id).in("role", ["doctor", "nurse", "professional"]).in("status", ["active", "invited"]).is("deleted_at", null),
  ]);
  const maxUsers = clinicLimit?.max_active_users ?? 25;
  const maxProfessionals = clinicLimit?.max_active_professionals ?? 10;
  const restoringMember = previousMembership?.status === "removed" || previousMembership?.status === "suspended";
  if (!restoringMember && (memberCount ?? 0) >= maxUsers) return { error: `Limite atingido: ate ${maxUsers} usuarios ativos ou convidados.` };
  if (!restoringMember && ["doctor", "nurse", "professional"].includes(parsed.data.role) && (professionalCount ?? 0) >= maxProfessionals) return { error: `Limite atingido: ate ${maxProfessionals} profissionais ativos ou convidados.` };

  const ttlHours = await getInvitationTtlHours(admin, activeClinic.id);
  const invitationId = randomUUID();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const { error: invitationError } = await admin.from("clinic_invitations").insert({
    id: invitationId,
    clinic_id: activeClinic.id,
    user_id: targetUserId,
    email: parsed.data.email,
    role: parsed.data.role,
    status: "pending",
    expires_at: expiresAt,
    token_hash: newInvitationHash(),
    created_by: actor.user.id,
    updated_by: actor.user.id,
  });
  if (invitationError) return { error: "Nao foi possivel criar o registro do convite." };

  const redirectUrl = new URL("/aceitar-convite", getAppUrl());
  redirectUrl.searchParams.set("clinic", activeClinic.id);
  redirectUrl.searchParams.set("invitation", invitationId);
  const sent = await sendInvitationEmail({
    admin,
    supabase,
    email: parsed.data.email,
    userId: targetUserId,
    redirectUrl: redirectUrl.toString(),
    metadata: {
      full_name: parsed.data.full_name,
      cpf: parsed.data.cpf,
      phone: parsed.data.phone,
      invited_clinic_id: activeClinic.id,
      invited_role: parsed.data.role,
      invitation_id: invitationId,
      invited_by: actor.user.id,
    },
  });
  if (sent.error || !sent.userId) {
    await admin.from("clinic_invitations").update({ status: "failed", failure_reason: sent.error ?? "Falha de envio", updated_by: actor.user.id }).eq("id", invitationId);
    await logAuditEvent({ clinicId: activeClinic.id, userId: actor.user.id, actionType: "member_invite_failed", module: "members", recordTable: "clinic_invitations", recordId: invitationId, level: "warning", notes: "Falha no envio do convite." });
    return { error: "Nao foi possivel enviar o e-mail. Verifique o SMTP e tente novamente." };
  }

  await admin.from("profiles").upsert({ id: sent.userId, full_name: parsed.data.full_name, cpf: parsed.data.cpf, phone: parsed.data.phone || null, email: parsed.data.email, updated_by: actor.user.id }, { onConflict: "id" });
  const { data: membership, error: memberError } = await admin.from("clinic_members").upsert({ clinic_id: activeClinic.id, user_id: sent.userId, role: parsed.data.role, status: "invited", joined_at: null, invited_by: actor.user.id, created_by: actor.user.id, updated_by: actor.user.id, deleted_at: null }, { onConflict: "clinic_id,user_id" }).select("id").single();
  if (memberError || !membership) {
    await admin.from("clinic_invitations").update({ status: "failed", failure_reason: "Falha ao vincular a clinica", updated_by: actor.user.id }).eq("id", invitationId);
    return { error: "O e-mail foi enviado, mas nao foi possivel vincular a clinica." };
  }

  await admin.from("clinic_invitations").update({ user_id: sent.userId, status: "sent", last_sent_at: new Date().toISOString(), send_count: 1, updated_by: actor.user.id }).eq("id", invitationId);
  await logAuditEvent({ clinicId: activeClinic.id, userId: actor.user.id, actionType: "member_invited", module: "members", recordTable: "clinic_invitations", recordId: invitationId, oldValues: previousMembership ? { status: previousMembership.status } : null, newValues: { email: parsed.data.email, role: parsed.data.role, status: "sent", expires_at: expiresAt, send_count: 1 }, notes: "Convite emitido com validade e criacao de senha pelo proprio usuario." });
  revalidatePath("/usuarios");
  return { success: `Convite enviado. Expira em ${new Date(expiresAt).toLocaleString("pt-BR")}.` };
}

export async function resendInvitationAction(
  _state: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const parsed = invitationIdSchema.safeParse({ invitation_id: formData.get("invitation_id") });
  if (!parsed.success) return { error: "Convite nao identificado." };
  const [{ activeClinic }, supabase] = await Promise.all([getActiveClinicContext(), createSupabaseServerClient()]);
  if (!activeClinic || !(await canManageMembers(activeClinic.id))) return { error: "Voce nao possui permissao para reenviar convites." };
  const { data: actor } = await supabase.auth.getUser();
  if (!actor.user) return { error: "Sessao expirada. Faca login novamente." };
  const admin = createSupabaseAdminClient();
  await expireInvitationRows(admin);
  const { data: previous } = await admin.from("clinic_invitations").select("id, clinic_id, user_id, email, role, status, last_sent_at, send_count").eq("id", parsed.data.invitation_id).eq("clinic_id", activeClinic.id).is("deleted_at", null).maybeSingle();
  if (!previous) return { error: "Convite nao encontrado." };
  if (previous.status === "accepted") return { error: "Este convite ja foi aceito. Suspenda o usuario para bloquear o acesso." };
  if (["canceled", "expired", "failed"].includes(previous.status)) return { error: "Este convite nao esta mais ativo. Emita um novo convite pelo cadastro." };
  if (previous.last_sent_at && Date.now() - new Date(previous.last_sent_at).getTime() < MIN_RESEND_INTERVAL_MS) return { error: "Aguarde um minuto antes de reenviar." };
  if ((previous.send_count ?? 0) >= MAX_INVITATION_SENDS) return { error: "Limite de reenvios atingido. Cancele e emita um novo convite." };

  await admin.from("clinic_invitations").update({ status: "canceled", canceled_at: new Date().toISOString(), canceled_by: actor.user.id, failure_reason: "Convite substituido por reenvio.", updated_by: actor.user.id }).eq("id", previous.id);
  const ttlHours = await getInvitationTtlHours(admin, activeClinic.id);
  const invitationId = randomUUID();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const { error: newError } = await admin.from("clinic_invitations").insert({ id: invitationId, clinic_id: activeClinic.id, user_id: previous.user_id, email: previous.email, role: previous.role, status: "pending", expires_at: expiresAt, token_hash: newInvitationHash(), created_by: actor.user.id, updated_by: actor.user.id });
  if (newError) return { error: "Nao foi possivel preparar o novo convite." };
  const redirectUrl = new URL("/aceitar-convite", getAppUrl());
  redirectUrl.searchParams.set("clinic", activeClinic.id);
  redirectUrl.searchParams.set("invitation", invitationId);
  const sent = await sendInvitationEmail({ admin, supabase, email: previous.email, userId: previous.user_id, redirectUrl: redirectUrl.toString(), metadata: { invited_clinic_id: activeClinic.id, invited_role: previous.role, invitation_id: invitationId, invited_by: actor.user.id } });
  if (sent.error) {
    await admin.from("clinic_invitations").update({ status: "failed", failure_reason: sent.error, updated_by: actor.user.id }).eq("id", invitationId);
    await logAuditEvent({ clinicId: activeClinic.id, userId: actor.user.id, actionType: "member_invite_failed", module: "members", recordTable: "clinic_invitations", recordId: invitationId, level: "warning", notes: "Falha no reenvio do convite." });
    return { error: "Nao foi possivel reenviar o e-mail. Verifique o SMTP." };
  }
  await admin.from("clinic_invitations").update({ user_id: sent.userId ?? previous.user_id, status: "sent", last_sent_at: new Date().toISOString(), send_count: (previous.send_count ?? 0) + 1, updated_by: actor.user.id }).eq("id", invitationId);
  await logAuditEvent({ clinicId: activeClinic.id, userId: actor.user.id, actionType: "member_invite_resent", module: "members", recordTable: "clinic_invitations", recordId: invitationId, oldValues: { replaced_invitation_id: previous.id }, newValues: { status: "sent", expires_at: expiresAt, send_count: (previous.send_count ?? 0) + 1 }, notes: "Convite anterior invalidado e novo convite enviado." });
  revalidatePath("/usuarios");
  return { success: "Convite reenviado. O link anterior foi invalidado." };
}

export async function cancelInvitationAction(
  _state: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const parsed = cancelInvitationSchema.safeParse({ invitation_id: formData.get("invitation_id"), reason: formData.get("reason") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Convite invalido." };
  const [{ activeClinic }, supabase] = await Promise.all([getActiveClinicContext(), createSupabaseServerClient()]);
  if (!activeClinic || !(await canManageMembers(activeClinic.id))) return { error: "Voce nao possui permissao para cancelar convites." };
  const { data: actor } = await supabase.auth.getUser();
  if (!actor.user) return { error: "Sessao expirada. Faca login novamente." };
  const admin = createSupabaseAdminClient();
  const { data: invitation } = await admin.from("clinic_invitations").select("id, clinic_id, user_id, status").eq("id", parsed.data.invitation_id).eq("clinic_id", activeClinic.id).is("deleted_at", null).maybeSingle();
  if (!invitation) return { error: "Convite nao encontrado." };
  if (invitation.status === "accepted") return { error: "Convite aceito nao pode ser cancelado. Suspenda o usuario ativo." };
  if (["canceled", "expired"].includes(invitation.status)) return { success: "Este convite ja nao esta ativo." };
  await admin.from("clinic_invitations").update({ status: "canceled", canceled_at: new Date().toISOString(), canceled_by: actor.user.id, failure_reason: parsed.data.reason || "Cancelado pelo administrador da clinica.", updated_by: actor.user.id }).eq("id", invitation.id);
  if (invitation.user_id) await admin.from("clinic_members").update({ status: "removed", deleted_at: new Date().toISOString(), updated_by: actor.user.id }).eq("clinic_id", activeClinic.id).eq("user_id", invitation.user_id).eq("status", "invited");
  await logAuditEvent({ clinicId: activeClinic.id, userId: actor.user.id, actionType: "member_invite_canceled", module: "members", recordTable: "clinic_invitations", recordId: invitation.id, oldValues: { status: invitation.status }, newValues: { status: "canceled", reason: parsed.data.reason || null }, level: "security", notes: "Convite cancelado sem apagar a conta Auth." });
  revalidatePath("/usuarios");
  return { success: "Convite cancelado. A conta nao foi apagada." };
}

export async function copyInvitationLinkAction(
  _state: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const parsed = invitationIdSchema.safeParse({ invitation_id: formData.get("invitation_id") });
  if (!parsed.success) return { error: "Convite nao identificado." };
  const [{ activeClinic }, supabase] = await Promise.all([getActiveClinicContext(), createSupabaseServerClient()]);
  if (!activeClinic || !(await canManageMembers(activeClinic.id))) return { error: "Voce nao possui permissao para copiar convites." };
  const { data: actor } = await supabase.auth.getUser();
  if (!actor.user) return { error: "Sessao expirada. Faca login novamente." };
  const admin = createSupabaseAdminClient();
  await expireInvitationRows(admin);
  const { data: invitation } = await admin.from("clinic_invitations").select("id, email, status, expires_at").eq("id", parsed.data.invitation_id).eq("clinic_id", activeClinic.id).is("deleted_at", null).maybeSingle();
  if (!invitation || !["pending", "sent"].includes(invitation.status)) return { error: "Este convite nao esta ativo para gerar um link." };
  if (new Date(invitation.expires_at).getTime() <= Date.now()) return { error: "Este convite expirou. Emita um novo convite." };
  const redirectUrl = new URL("/aceitar-convite", getAppUrl());
  redirectUrl.searchParams.set("clinic", activeClinic.id);
  redirectUrl.searchParams.set("invitation", invitation.id);
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email: invitation.email, options: { redirectTo: redirectUrl.toString() } });
  if (error || !data.properties?.action_link) return { error: "Nao foi possivel gerar o link seguro." };
  await logAuditEvent({ clinicId: activeClinic.id, userId: actor.user.id, actionType: "member_invite_link_generated", module: "members", recordTable: "clinic_invitations", recordId: invitation.id, level: "security", notes: "Link temporario gerado sob demanda e nao armazenado." });
  return { success: "Link seguro gerado. Nao compartilhe fora do destinatario.", inviteLink: data.properties.action_link };
}

export async function acceptInvitationLifecycleAction(
  _state: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const parsed = acceptInviteSchema.safeParse({ clinic_id: formData.get("clinic_id"), invitation_id: formData.get("invitation_id") || undefined, password: formData.get("password"), password_confirm: formData.get("password_confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getUser();
  if (!session.user) return { error: "O convite expirou. Solicite um novo convite a clinica." };
  const admin = createSupabaseAdminClient();
  let invitation: { id: string; clinic_id: string; user_id: string | null; email: string; status: string; expires_at: string } | null = null;
  if (parsed.data.invitation_id) {
    const { data } = await admin.from("clinic_invitations").select("id, clinic_id, user_id, email, status, expires_at").eq("id", parsed.data.invitation_id).maybeSingle();
    invitation = data;
    if (!invitation) return { error: "Convite nao encontrado." };
    if (invitation.user_id !== session.user.id || invitation.email.toLowerCase() !== (session.user.email ?? "").toLowerCase()) return { error: "Este convite nao pertence ao e-mail autenticado." };
    if (invitation.clinic_id !== parsed.data.clinic_id) return { error: "A clinica deste convite nao confere." };
    if (new Date(invitation.expires_at).getTime() <= Date.now() && ["pending", "sent"].includes(invitation.status)) {
      await admin.from("clinic_invitations").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", invitation.id);
      return { error: "Este convite expirou. Solicite um novo convite a clinica." };
    }
    if (!["sent", "pending"].includes(invitation.status)) return { error: "Este convite ja foi utilizado, cancelado ou invalidado." };
  }
  const { data: membership } = await admin.from("clinic_members").select("id, clinic_id, role, status").eq("clinic_id", parsed.data.clinic_id).eq("user_id", session.user.id).in("status", ["invited", "active"]).is("deleted_at", null).maybeSingle();
  if (!membership) return { error: "Este convite nao esta mais disponivel para o seu usuario." };
  const { error: passwordError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (passwordError) return { error: `Nao foi possivel definir a senha: ${passwordError.message}` };
  const joinedAt = new Date().toISOString();
  const { error: membershipError } = await admin.from("clinic_members").update({ status: "active", joined_at: joinedAt, updated_by: session.user.id, deleted_at: null }).eq("id", membership.id);
  if (membershipError) return { error: "A senha foi definida, mas nao foi possivel ativar o acesso a clinica." };
  if (invitation) await admin.from("clinic_invitations").update({ status: "accepted", accepted_at: joinedAt, accepted_by: session.user.id, updated_by: session.user.id }).eq("id", invitation.id).in("status", ["pending", "sent"]);
  await logAuditEvent({ clinicId: membership.clinic_id, userId: session.user.id, actionType: "member_invite_accepted", module: "members", recordTable: "clinic_members", recordId: membership.id, oldValues: { status: membership.status }, newValues: { status: "active", joined_at: joinedAt }, level: "security", notes: "Convite aceito e senha inicial definida pelo usuario." });
  revalidatePath("/usuarios");
  redirect("/dashboard?invite=accepted");
}
