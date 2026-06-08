import Stripe from "stripe";
import { getStripePriceEnvName } from "@/config/plans";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasBillableAccess } from "@/services/billing/access";
import { ensureBillingReferenceData } from "@/services/billing/reference-data";
import type { PlanSlug, SubscriptionStatus } from "@/types/domain";

const planSlugs: PlanSlug[] = ["singular", "duo", "master"];

export function normalizeSubscriptionStatus(status?: Stripe.Subscription.Status): SubscriptionStatus {
  if (status === "active" || status === "trialing" || status === "past_due" || status === "canceled") {
    return status;
  }

  return "inactive";
}

export function planFromMetadata(metadata?: Stripe.Metadata | null): PlanSlug {
  const plan = metadata?.plan_slug;
  return plan === "duo" || plan === "master" ? plan : "singular";
}

export function planFromSubscription(subscription: Stripe.Subscription): PlanSlug {
  const subscriptionPriceIds = new Set(
    subscription.items.data
      .map((item) => item.price?.id)
      .filter((priceId): priceId is string => Boolean(priceId)),
  );

  for (const plan of planSlugs) {
    const configuredPriceId = process.env[getStripePriceEnvName(plan)];

    if (configuredPriceId && subscriptionPriceIds.has(configuredPriceId)) {
      return plan;
    }
  }

  return planFromMetadata(subscription.metadata);
}

function getSubscriptionPeriods(subscription: Stripe.Subscription) {
  const periodSource = subscription as Stripe.Subscription & {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };
  const firstItem = subscription.items.data[0] as Stripe.SubscriptionItem & {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };

  return {
    start: periodSource.current_period_start ?? firstItem?.current_period_start ?? null,
    end: periodSource.current_period_end ?? firstItem?.current_period_end ?? null,
  };
}

function isUsableSubscriptionId(subscriptionId?: string | null) {
  return Boolean(subscriptionId?.startsWith("sub_"));
}

async function profileExists(userId?: string | null) {
  if (!userId) {
    return false;
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();

  return Boolean(data);
}

export async function upsertSubscriptionFromStripe(subscription: Stripe.Subscription, fallbackUserId?: string) {
  await ensureBillingReferenceData();

  const admin = createSupabaseAdminClient();
  const userId = fallbackUserId || subscription.metadata.user_id;
  const periods = getSubscriptionPeriods(subscription);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  let ownerUserId = userId;

  if (!ownerUserId) {
    const { data } = await admin
      .from("subscriptions")
      .select("owner_user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    ownerUserId = data?.owner_user_id;
  }

  if (!ownerUserId) {
    return null;
  }

  if (!(await profileExists(ownerUserId))) {
    return null;
  }

  const payload = {
    owner_user_id: ownerUserId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    plan_slug: planFromSubscription(subscription),
    status: normalizeSubscriptionStatus(subscription.status),
    current_period_start: periods.start ? new Date(periods.start * 1000).toISOString() : null,
    current_period_end: periods.end ? new Date(periods.end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    updated_by: ownerUserId,
  };

  const { error } = await admin.from("subscriptions").upsert(payload, { onConflict: "owner_user_id" });

  if (error) {
    throw new Error(`Falha ao salvar assinatura no Supabase: ${error.message}`);
  }

  return payload;
}

export async function saveInvoiceFromStripe(invoice: Stripe.Invoice) {
  const admin = createSupabaseAdminClient();
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const invoiceWithSubscription = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  const subscriptionId =
    typeof invoiceWithSubscription.subscription === "string"
      ? invoiceWithSubscription.subscription
      : invoiceWithSubscription.subscription?.id;

  if (!customerId) return;

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("owner_user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!subscription?.owner_user_id) return;

  const { error } = await admin.from("invoices").upsert(
    {
      owner_user_id: subscription.owner_user_id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_invoice_id: invoice.id,
      status: invoice.status,
      amount_due: invoice.amount_due,
      amount_paid: invoice.amount_paid,
      currency: invoice.currency,
      hosted_invoice_url: invoice.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf,
      paid_at: invoice.status_transitions.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : null,
    },
    { onConflict: "stripe_invoice_id" },
  );

  if (error) {
    throw new Error(`Falha ao salvar invoice no Supabase: ${error.message}`);
  }
}

export async function syncCheckoutSession(sessionId: string, userId?: string) {
  const admin = createSupabaseAdminClient();
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  if (!session.subscription) {
    return null;
  }

  const subscription =
    typeof session.subscription === "string"
      ? await stripe.subscriptions.retrieve(session.subscription)
      : session.subscription;

  let ownerUserId = userId || session.client_reference_id || session.metadata?.user_id || undefined;

  if (!ownerUserId && session.customer_details?.email) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", session.customer_details.email)
      .maybeSingle();

    ownerUserId = profile?.id;
  }

  const syncedSubscription = await upsertSubscriptionFromStripe(subscription, ownerUserId);

  if (syncedSubscription && typeof session.customer === "string") {
    await admin
      .from("subscriptions")
      .update({
        stripe_customer_id: session.customer,
        updated_by: syncedSubscription.owner_user_id,
      })
      .eq("owner_user_id", syncedSubscription.owner_user_id);
  }

  return syncedSubscription;
}

export async function resolveActiveStripeSubscription({
  customerId,
  storedSubscriptionId,
  ownerUserId,
}: {
  customerId: string;
  storedSubscriptionId?: string | null;
  ownerUserId: string;
}) {
  const stripe = getStripe();

  if (isUsableSubscriptionId(storedSubscriptionId)) {
    try {
      const subscription = await stripe.subscriptions.retrieve(storedSubscriptionId as string);

      if (subscription.customer === customerId && subscription.status !== "canceled") {
        await upsertSubscriptionFromStripe(subscription, ownerUserId);
        return subscription;
      }
    } catch {
      // Stale or cross-environment IDs are repaired by listing customer subscriptions below.
    }
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    limit: 10,
    status: "all",
  });

  const orderedSubscriptions = [...subscriptions.data].sort((left, right) => right.created - left.created);
  const activeSubscription =
    orderedSubscriptions.find((subscription) => subscription.status === "active") ??
    orderedSubscriptions.find((subscription) => subscription.status === "trialing") ??
    orderedSubscriptions.find((subscription) => subscription.status === "past_due") ??
    null;

  if (activeSubscription) {
    await upsertSubscriptionFromStripe(activeSubscription, ownerUserId);
  }

  return activeSubscription;
}

export async function syncUserSubscriptionFromStripe({
  ownerUserId,
  email,
}: {
  ownerUserId: string;
  email?: string | null;
}) {
  const admin = createSupabaseAdminClient();
  const stripe = getStripe();
  const { data: storedSubscription } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  const customerIds = new Set<string>();

  if (storedSubscription?.stripe_customer_id) {
    customerIds.add(storedSubscription.stripe_customer_id);
  }

  if (email) {
    const customers = await stripe.customers.list({ email, limit: 10 });
    customers.data
      .filter((customer) => customer.metadata?.user_id === ownerUserId)
      .sort((left, right) => right.created - left.created)
      .forEach((customer) => customerIds.add(customer.id));
  }

  let lastError: unknown = null;

  for (const customerId of customerIds) {
    try {
      await resolveActiveStripeSubscription({
        customerId,
        storedSubscriptionId:
          customerId === storedSubscription?.stripe_customer_id ? storedSubscription?.stripe_subscription_id : null,
        ownerUserId,
      });

      const { data: currentSubscription } = await admin
        .from("subscriptions")
        .select("plan_slug, status, current_period_end, stripe_customer_id, stripe_subscription_id, cancel_at_period_end")
        .eq("owner_user_id", ownerUserId)
        .maybeSingle();

      if (hasBillableAccess(currentSubscription)) {
        return currentSubscription;
      }
    } catch (error) {
      lastError = error;
    }
  }

  const { data } = await admin
    .from("subscriptions")
    .select("plan_slug, status, current_period_end, stripe_customer_id, stripe_subscription_id, cancel_at_period_end")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (!data && lastError instanceof Error) {
    throw lastError;
  }

  return data;
}
