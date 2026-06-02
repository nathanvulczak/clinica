import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAppUrl, getRequiredServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { saveInvoiceFromStripe, upsertSubscriptionFromStripe } from "@/services/billing/stripe-sync";

export function GET() {
  return NextResponse.json({
    ok: true,
    message: "Stripe webhook endpoint ativo. Configure este endpoint na Stripe usando método POST.",
    endpoint: `${getAppUrl()}/api/stripe/webhook`,
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const headerStore = await headers();
  const signature = headerStore.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Assinatura Stripe ausente." }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      getRequiredServerEnv("STRIPE_WEBHOOK_SECRET"),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook inválido." },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (typeof session.subscription === "string") {
          const subscription = await getStripe().subscriptions.retrieve(session.subscription);
          await upsertSubscriptionFromStripe(subscription, session.client_reference_id ?? undefined);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await upsertSubscriptionFromStripe(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
      case "invoice.finalized": {
        await saveInvoiceFromStripe(event.data.object as Stripe.Invoice);
        break;
      }
    }

    const admin = createSupabaseAdminClient();
    await admin.from("billing_events").upsert(
      {
        stripe_event_id: event.id,
        type: event.type,
        payload: event as unknown as Record<string, unknown>,
      },
      { onConflict: "stripe_event_id" },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao processar webhook Stripe." },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
