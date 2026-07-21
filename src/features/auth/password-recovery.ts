"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getAppUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/services/audit/audit-service";
import { isValidEmail } from "@/lib/validators";

export type PasswordRecoveryState = { error?: string; success?: string };

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().refine(isValidEmail, "Informe um e-mail valido."),
});

const newPasswordSchema = z
  .object({
    password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
    password_confirm: z.string().min(8, "Confirme a nova senha."),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: "As senhas nao conferem.",
    path: ["password_confirm"],
  })
  .refine((data) => /[A-Z]/.test(data.password) && /[a-z]/.test(data.password) && /\d/.test(data.password), {
    message: "Use ao menos uma letra maiuscula, uma minuscula e um numero.",
    path: ["password"],
  });

function getRecoveryDestination(value: FormDataEntryValue | null) {
  return value === "/console/login" ? "/console/login" : "/login";
}

export async function requestPasswordResetAction(
  _state: PasswordRecoveryState,
  formData: FormData,
): Promise<PasswordRecoveryState> {
  const parsed = requestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Informe um e-mail valido." };

  const supabase = await createSupabaseServerClient();
  const destination = getRecoveryDestination(formData.get("next"));
  const recoveryPage = new URL("/redefinir-senha/nova", getAppUrl());
  recoveryPage.searchParams.set("next", destination);
  const redirectUrl = new URL("/auth/callback", getAppUrl());
  redirectUrl.searchParams.set("next", `${recoveryPage.pathname}${recoveryPage.search}`);
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: redirectUrl.toString() });

  await logAuditEvent({
    actionType: "password_reset_requested",
    userId: null,
    level: "security",
    notes: "Solicitacao de redefinicao de senha processada sem revelar a existencia da conta.",
  });
  return { success: "Se o e-mail estiver cadastrado, voce recebera um link para criar uma nova senha." };
}

export async function updateRecoveredPasswordAction(
  _state: PasswordRecoveryState,
  formData: FormData,
): Promise<PasswordRecoveryState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    password_confirm: formData.get("password_confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revise a nova senha." };

  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getUser();
  if (!session.user) return { error: "O link expirou. Solicite uma nova redefinicao de senha." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Nao foi possivel atualizar a senha. Solicite um novo link." };

  await logAuditEvent({
    userId: session.user.id,
    actionType: "password_reset_completed",
    level: "security",
    notes: "Senha redefinida por link de recuperacao.",
  });
  await supabase.auth.signOut({ scope: "local" });
  const destination = getRecoveryDestination(formData.get("next"));
  redirect(`${destination}?password=updated`);
}
