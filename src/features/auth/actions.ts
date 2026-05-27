"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/features/auth/validation";
import { getAppUrl } from "@/lib/env";
import { isPlaceholderValue } from "@/lib/validators";
import { hasBillableAccess } from "@/services/billing/access";
import { logAuditEvent } from "@/services/audit/audit-service";

type AuthState = {
  error?: string;
};

function getSupabaseConfigError() {
  if (
    isPlaceholderValue(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    isPlaceholderValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    return "Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local antes de autenticar.";
  }

  return null;
}

function getSignUpConfigError() {
  const authError = getSupabaseConfigError();

  if (authError) {
    return authError;
  }

  if (isPlaceholderValue(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return "Configure SUPABASE_SERVICE_ROLE_KEY no .env.local antes de cadastrar usuários.";
  }

  return null;
}

export async function signInAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const configError = getSupabaseConfigError();

  if (configError) {
    return { error: configError };
  }

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);

    if (error) {
      return { error: "E-mail ou senha inválidos." };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await logAuditEvent({
        userId: user.id,
        actionType: "login",
        level: "security",
        notes: "Login realizado com e-mail e senha.",
      });
    }
  } catch {
    return { error: "Não foi possível conectar ao Supabase. Confira a URL e as chaves no .env.local." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: subscription } = user
    ? await supabase
        .from("subscriptions")
        .select("plan_slug, status, current_period_end, stripe_customer_id")
        .eq("owner_user_id", user.id)
        .maybeSingle()
    : { data: null };

  const next = String(formData.get("next") ?? "");

  if (next.startsWith("/api/billing/checkout")) {
    redirect(next);
  }

  if (!hasBillableAccess(subscription)) {
    redirect("/planos?reason=subscription_required");
  }

  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function signUpAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const configError = getSignUpConfigError();

  if (configError) {
    return { error: configError };
  }

  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    cpf: formData.get("cpf"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    plan: formData.get("plan"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  let hasSession = false;

  try {
    const admin = createSupabaseAdminClient();
    const { data: existingCpf, error: cpfError } = await admin
      .from("profiles")
      .select("id")
      .eq("cpf", parsed.data.cpf)
      .maybeSingle();

    if (cpfError) {
      return { error: "Não foi possível validar o CPF. Confirme se o SQL foi aplicado no Supabase." };
    }

    if (existingCpf) {
      return { error: "Este CPF já está cadastrado." };
    }

    const emailRedirectUrl = new URL("/auth/callback", getAppUrl());
    emailRedirectUrl.searchParams.set("next", `/planos?selected=${parsed.data.plan}`);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: emailRedirectUrl.toString(),
        data: {
          full_name: parsed.data.fullName,
          cpf: parsed.data.cpf,
          phone: parsed.data.phone,
          desired_plan: parsed.data.plan,
        },
      },
    });

    if (error) {
      return { error: error.message };
    }

    hasSession = Boolean(data.session);
  } catch {
    return { error: "Não foi possível conectar ao Supabase. Confira a URL e as chaves no .env.local." };
  }

  if (hasSession) {
    redirect(`/planos?selected=${parsed.data.plan}`);
  }

  redirect(`/confirmar-email?email=${encodeURIComponent(parsed.data.email)}&plan=${parsed.data.plan}`);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await logAuditEvent({
      userId: user.id,
      actionType: "logout",
      level: "security",
      notes: "Logout realizado pelo usuário.",
    });
  }

  await supabase.auth.signOut();
  redirect("/login");
}
