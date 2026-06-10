import { NextResponse, type NextRequest } from "next/server";
import { getAppUrl } from "@/lib/env";
import { getStripePriceEnvName, PLAN_LIMITS } from "@/config/plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { ensureBillingReferenceData } from "@/services/billing/reference-data";
import { resolveActiveStripeSubscription } from "@/services/billing/stripe-sync";
import { getBillingAuthorization } from "@/services/billing/authorization";
import { auditDeniedModuleAccess } from "@/services/authorization/clinic-access";
import type { PlanSlug } from "@/types/domain";

const validPlans: PlanSlug[] = ["singular", "duo", "master"];
const activeStatuses = ["active", "trialing", "past_due"];

function redirectWithBillingError(request: NextRequest, code: string, plan: PlanSlug) {
  const url = new URL("/planos", request.url);
  url.searchParams.set("selected", plan);
  url.searchParams.set("checkout_error", code);
  return NextResponse.redirect(url);
}

function hasValue(value?: string) {
  return Boolean(value && !/temporario|placeholder|missing|xxx|sua_|seu_/i.test(value));
}

export async function GET(request: NextRequest) {
  const plan = (request.nextUrl.searchParams.get("plan") ?? "singular") as PlanSlug;

  if (!validPlans.includes(plan)) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?next=/api/billing/checkout?plan=${plan}`, request.url),
    );
  }

  const billingAuthorization = await getBillingAuthorization();

  if (!billingAuthorization.canManage || !billingAuthorization.ownerUserId) {
    await auditDeniedModuleAccess(
      billingAuthorization.activeClinic?.id,
      "billing",
      "Tentativa de iniciar checkout sem permissão para gerenciar assinatura.",
    );
    return NextResponse.redirect(new URL("/dashboard?access=denied&module=billing", request.url));
  }

  const ownerUserId = billingAuthorization.ownerUserId;

  const priceId = process.env[getStripePriceEnvName(plan)];

  if (!hasValue(priceId)) {
    return redirectWithBillingError(request, `missing_${getStripePriceEnvName(plan).toLowerCase()}`, plan);
  }

  if (!hasValue(process.env.STRIPE_SECRET_KEY)) {
    return redirectWithBillingError(request, "missing_stripe_secret_key", plan);
  }

  if (!hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return redirectWithBillingError(request, "missing_supabase_service_role_key", plan);
  }

  const admin = createSupabaseAdminClient();
  const { data: ownerProfile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", ownerUserId)
    .maybeSingle();
  const billingEmail = ownerProfile?.email ?? user.email;

  if (!billingEmail) {
    return redirectWithBillingError(request, "missing_billing_email", plan);
  }

  try {
    await ensureBillingReferenceData();
  } catch {
    return redirectWithBillingError(request, "billing_reference_failed", plan);
  }

  const { data: existingSubscription } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, plan_slug, status")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  const stripe = getStripe();
  let customerId = existingSubscription?.stripe_customer_id as string | undefined;

  if (customerId && activeStatuses.includes(String(existingSubscription?.status))) {
    const currentPlan = existingSubscription?.plan_slug as PlanSlug | undefined;
    let activeSubscription;

    try {
      activeSubscription = await resolveActiveStripeSubscription({
        customerId,
        storedSubscriptionId: existingSubscription?.stripe_subscription_id,
        ownerUserId,
      });
    } catch {
      return redirectWithBillingError(request, "stripe_subscription_sync_failed", plan);
    }

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
        .from("clinics")
        .select("id", { count: "exact", head: true })
        .eq("created_by", ownerUserId)
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
      try {
        portalSession = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${getAppUrl()}/assinatura?billing=portal_return`,
        });
      } catch {
        return redirectWithBillingError(request, "stripe_portal_failed", plan);
      }
    }

    return NextResponse.redirect(portalSession.url);
  }

  if (!customerId) {
    let customer;

    try {
      customer = await stripe.customers.create({
        email: billingEmail,
        name: ownerProfile?.full_name ?? String(user.user_metadata?.full_name ?? ""),
        metadata: {
          user_id: ownerUserId,
        },
      });
    } catch {
      return redirectWithBillingError(request, "stripe_customer_failed", plan);
    }

    customerId = customer.id;

    await admin.from("subscriptions").upsert(
      {
        owner_user_id: ownerUserId,
        stripe_customer_id: customerId,
        plan_slug: plan,
        status: "inactive",
        updated_by: user.id,
      },
      { onConflict: "owner_user_id" },
    );
  }

  let session;

  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${getAppUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getAppUrl()}/planos?selected=${plan}&checkout=cancelled&reason=subscription_required`,
      client_reference_id: ownerUserId,
      subscription_data: {
        metadata: {
          user_id: ownerUserId,
          actor_user_id: user.id,
          plan_slug: plan,
        },
      },
      metadata: {
        user_id: ownerUserId,
        actor_user_id: user.id,
        plan_slug: plan,
      },
    });
  } catch {
    return redirectWithBillingError(request, "stripe_checkout_failed", plan);
  }

  if (!session.url) {
    return NextResponse.json({ error: "Não foi possível iniciar o checkout." }, { status: 500 });
  }

  return NextResponse.redirect(session.url);
}
