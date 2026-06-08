"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PLAN_LIMITS } from "@/config/plans";
import { ACTIVE_CLINIC_COOKIE } from "@/features/clinics/context";
import { clinicSchema } from "@/features/clinics/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureOwnerMembership } from "@/repositories/clinics";
import { getCurrentSubscription } from "@/repositories/subscriptions";
import { logAuditEvent } from "@/services/audit/audit-service";
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
    await ensureOwnerMembership(data.id, user.id);

    await logAuditEvent({
      clinicId: data.id,
      userId: user.id,
      actionType: "clinic_created",
      module: "clinics",
      recordTable: "clinics",
      recordId: data.id,
      newValues: {
        trade_name: parsed.data.trade_name,
        legal_name: parsed.data.legal_name,
      },
      notes: "Clínica cadastrada e usuário criador vinculado como clinic_owner.",
    });

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_CLINIC_COOKIE, data.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  redirect("/clinicas?clinic=created");
}

export async function updateClinicAction(_state: ClinicState, formData: FormData): Promise<ClinicState> {
  const clinicId = String(formData.get("clinic_id") ?? "");
  const parsed = clinicSchema.safeParse({
    legal_name: formData.get("legal_name"),
    trade_name: formData.get("trade_name"),
    document: formData.get("document"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    city: formData.get("city"),
    state: formData.get("state"),
  });

  if (!clinicId) {
    return { error: "Clínica não identificada." };
  }

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

  const admin = createSupabaseAdminClient();
  const { data: previous, error: previousError } = await admin
    .from("clinics")
    .select("id, legal_name, trade_name, document, email, phone, city, state, created_by")
    .eq("id", clinicId)
    .is("deleted_at", null)
    .maybeSingle();

  if (previousError || !previous) {
    return { error: "Clínica não encontrada." };
  }

  let canEdit = previous.created_by === user.id;

  if (canEdit) {
    await ensureOwnerMembership(clinicId, user.id);
  } else {
    const { data } = await supabase.rpc("user_has_permission", {
      clinic_uuid: clinicId,
      permission_module: "clinics",
      permission_action: "edit",
    });

    canEdit = data === true;
  }

  if (!canEdit) {
    await logAuditEvent({
      clinicId,
      userId: user.id,
      actionType: "access_denied",
      module: "clinics",
      recordTable: "clinics",
      recordId: clinicId,
      level: "security",
      notes: "Tentativa de editar clínica sem permissão.",
    });

    return { error: "Você não possui permissão para editar esta clínica." };
  }

  const nextData = {
    legal_name: parsed.data.legal_name,
    trade_name: parsed.data.trade_name,
    document: parsed.data.document,
    email: parsed.data.email || null,
    phone: parsed.data.phone,
    city: parsed.data.city || null,
    state: parsed.data.state?.toUpperCase() || null,
  };

  const { error } = await admin
    .from("clinics")
    .update({
      ...nextData,
      updated_by: user.id,
    })
    .eq("id", clinicId);

  if (error) {
    return { error: error.message };
  }

  await logAuditEvent({
    clinicId,
    userId: user.id,
    actionType: "clinic_updated",
    module: "clinics",
    recordTable: "clinics",
    recordId: clinicId,
    oldValues: {
      legal_name: previous.legal_name,
      trade_name: previous.trade_name,
      document: previous.document,
      email: previous.email,
      phone: previous.phone,
      city: previous.city,
      state: previous.state,
    },
    newValues: nextData,
    notes: "Cadastro da clínica atualizado.",
  });

  revalidatePath("/clinicas");
  revalidatePath(`/clinicas/${clinicId}/editar`);
  redirect("/clinicas?clinic=updated");
}
