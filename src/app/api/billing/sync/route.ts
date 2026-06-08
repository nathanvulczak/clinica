import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasBillableAccess } from "@/services/billing/access";
import { syncUserSubscriptionFromStripe } from "@/services/billing/stripe-sync";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/assinatura", request.url));
  }

  try {
    const subscription = await syncUserSubscriptionFromStripe({
      ownerUserId: user.id,
      email: user.email,
    });

    if (!hasBillableAccess(subscription)) {
      return NextResponse.redirect(new URL("/assinatura?billing=subscription_not_found", request.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/assinatura?billing=sync_failed", request.url));
  }

  return NextResponse.redirect(new URL("/assinatura?billing=synced", request.url));
}
