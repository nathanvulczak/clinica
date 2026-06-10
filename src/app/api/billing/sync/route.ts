import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasBillableAccess } from "@/services/billing/access";
import { syncUserSubscriptionFromStripe } from "@/services/billing/stripe-sync";
import { getBillingAuthorization } from "@/services/billing/authorization";
import { auditDeniedModuleAccess } from "@/services/authorization/clinic-access";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/assinatura", request.url));
  }

  const billingAuthorization = await getBillingAuthorization();

  if (!billingAuthorization.canManage || !billingAuthorization.ownerUserId) {
    await auditDeniedModuleAccess(
      billingAuthorization.activeClinic?.id,
      "billing",
      "Tentativa de sincronizar assinatura sem permissão de gerenciamento.",
    );
    return NextResponse.redirect(new URL("/dashboard?access=denied&module=billing", request.url));
  }

  try {
    const { data: ownerProfile } = await createSupabaseAdminClient()
      .from("profiles")
      .select("email")
      .eq("id", billingAuthorization.ownerUserId)
      .maybeSingle();
    const subscription = await syncUserSubscriptionFromStripe({
      ownerUserId: billingAuthorization.ownerUserId,
      email: ownerProfile?.email ?? user.email,
    });

    if (!hasBillableAccess(subscription)) {
      return NextResponse.redirect(new URL("/assinatura?billing=subscription_not_found", request.url));
    }
  } catch (error) {
    const url = new URL("/assinatura", request.url);
    url.searchParams.set("billing", "sync_failed");
    url.searchParams.set(
      "details",
      error instanceof Error ? error.message.slice(0, 180) : "Erro desconhecido na sincronização.",
    );
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(new URL("/assinatura?billing=synced", request.url));
}
