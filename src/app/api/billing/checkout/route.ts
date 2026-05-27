import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl } from "@/lib/env";
import { getStripePriceEnvName, PLAN_LIMITS } from "@/config/plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { resolveActiveStripeSubscription } from "@/services/billing/stripe-sync";
import type { PlanSlug } from "@/types/domain";

const validPlans: PlanSlug[] = ["singular", "duo", "master"];
const activeStatuses = ["active", "trialing", "past_due"];

export async function GET(request: NextRequest) {
  const plan = (request.nextUrl.searchParams.get("plan") ?? "singular") as PlanSlug;

  if (!validPlans.includes(plan)) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(
      new URL(`/login?next=/api/billing/checkout?plan=${plan}`, request.url),
    );
  }

  const priceId = process.env[getStripePriceEnvName(plan)];

  if (!priceId) {
    return NextResponse.json({ error: `Configure ${getStripePriceEnvName(plan)} no .env.local.` }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existingSubscription } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, plan_slug, status")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  const stripe = getStripe();
  let customerId = existingSubscription?.stripe_customer_id as string | undefined;

  if (customerId && activeStatuses.includes(String(existingSubscription?.status))) {
    const currentPlan = existingSubscription?.plan_slug as PlanSlug | undefined;
    const activeSubscription = await resolveActiveStripeSubscription({
      customerId,
      storedSubscriptionId: existingSubscription?.stripe_subscription_id,
      ownerUserId: user.id,
    });

    if (!activeSubscription) {
      return NextResponse.redirect(new URL("/assinatura?billing=subscription_not_found", request.url));
    }

    if (currentPlan === plan) {
      return NextResponse.redirect(new URL("/assinatura?billing=same_plan", request.url));
    }

    const currentLimit = currentPlan ? PLAN_LIMITS[currentPlan] : 0;
    const targetLimit = PLAN_LIMITS[plan];

    if (targetLimit < currentLimit) {
      const { count } = await admin
        .from("clinic_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("role", "clinic_owner")
        .eq("status", "active")
        .is("deleted_at", null);

      if ((count ?? 0) > targetLimit) {
        return NextResponse.redirect(
          new URL(`/assinatura?billing=downgrade_blocked&target=${plan}`, request.url),
        );
      }
    }

    let portalSession;

    try {
      portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${getAppUrl()}/assinatura?billing=portal_return`,
        flow_data: {
          type: "subscription_update",
          subscription_update: {
            subscription: activeSubscription.id,
          },
        },
      });
    } catch {
      portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${getAppUrl()}/assinatura?billing=portal_return`,
      });
    }

    return NextResponse.redirect(portalSession.url);
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: String(user.user_metadata?.full_name ?? ""),
      metadata: {
        user_id: user.id,
      },
    });

    customerId = customer.id;

    await admin.from("subscriptions").upsert(
      {
        owner_user_id: user.id,
        stripe_customer_id: customerId,
        plan_slug: plan,
        status: "inactive",
        updated_by: user.id,
      },
      { onConflict: "owner_user_id" },
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${getAppUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getAppUrl()}/planos?selected=${plan}&checkout=cancelled&reason=subscription_required`,
    client_reference_id: user.id,
    subscription_data: {
      metadata: {
        user_id: user.id,
        plan_slug: plan,
      },
    },
    metadata: {
      user_id: user.id,
      plan_slug: plan,
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "Não foi possível iniciar o checkout." }, { status: 500 });
  }

  return NextResponse.redirect(session.url);
}
