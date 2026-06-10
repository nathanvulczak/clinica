import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { resolveActiveStripeSubscription } from "@/services/billing/stripe-sync";
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
      "Tentativa de abrir o portal Stripe sem permissão para gerenciar assinatura.",
    );
    return NextResponse.redirect(new URL("/dashboard?access=denied&module=billing", request.url));
  }

  const { data: subscription } = await createSupabaseAdminClient()
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("owner_user_id", billingAuthorization.ownerUserId)
    .maybeSingle();

  if (!subscription?.stripe_customer_id) {
    return NextResponse.redirect(new URL("/assinatura", request.url));
  }

  try {
    await resolveActiveStripeSubscription({
      customerId: subscription.stripe_customer_id,
      storedSubscriptionId: subscription.stripe_subscription_id,
      ownerUserId: billingAuthorization.ownerUserId,
    });
  } catch {
    return NextResponse.redirect(new URL("/assinatura?billing=subscription_not_found", request.url));
  }

  let session;

  try {
    session = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${getAppUrl()}/assinatura`,
    });
  } catch {
    return NextResponse.redirect(new URL("/assinatura?billing=portal_failed", request.url));
  }

  return NextResponse.redirect(session.url);
}
