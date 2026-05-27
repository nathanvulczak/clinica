"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PLAN_LIMITS } from "@/config/plans";
import { ACTIVE_CLINIC_COOKIE } from "@/features/clinics/context";
import { clinicSchema } from "@/features/clinics/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentSubscription } from "@/repositories/subscriptions";
import type { PlanSlug } from "@/types/domain";

type ClinicState = {
  error?: string;
};

export async function createClinicAction(_state: ClinicState, formData: FormData): Promise<ClinicState> {
  const parsed = clinicSchema.safeParse({
    legal_name: formData.get("legal_name"),
    trade_name: formData.get("trade_name"),
    document: formData.get("document"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    city: formData.get("city"),
    state: formData.get("state"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const subscription = await getCurrentSubscription();

  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    return {
      error:
        "Para cadastrar clínicas, sua assinatura precisa estar ativa. Assine um plano ou aguarde o webhook do Stripe confirmar o pagamento.",
    };
  }

  const maxClinics = PLAN_LIMITS[subscription.plan_slug as PlanSlug];
  const admin = createSupabaseAdminClient();
  const { count } = await admin
    .from("clinics")
    .select("id", { count: "exact", head: true })
    .eq("created_by", user.id)
    .is("deleted_at", null);

  if ((count ?? 0) >= maxClinics) {
    return {
      error: `Seu plano atual permite até ${maxClinics} clínica${maxClinics > 1 ? "s" : ""}. Faça upgrade para cadastrar outra unidade.`,
    };
  }

  const { data, error } = await admin
    .from("clinics")
    .insert({
      ...parsed.data,
      email: parsed.data.email || null,
      city: parsed.data.city || null,
      state: parsed.data.state?.toUpperCase() || null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.toLowerCase().includes("row-level security")) {
      return {
        error:
          "O banco bloqueou este cadastro por segurança. Confirme se sua assinatura está ativa e se o SQL mais recente foi aplicado no Supabase.",
      };
    }

    return { error: error.message };
  }

  if (data?.id) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_CLINIC_COOKIE, data.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  redirect("/clinicas");
}
