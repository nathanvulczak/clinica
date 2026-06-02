import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { resolveActiveStripeSubscription } from "@/services/billing/stripe-sync";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/assinatura", request.url));
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!subscription?.stripe_customer_id) {
    return NextResponse.redirect(new URL("/assinatura", request.url));
  }

  try {
    await resolveActiveStripeSubscription({
      customerId: subscription.stripe_customer_id,
      storedSubscriptionId: subscription.stripe_subscription_id,
      ownerUserId: user.id,
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
