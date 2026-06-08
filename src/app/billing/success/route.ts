import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasBillableAccess } from "@/services/billing/access";
import { syncCheckoutSession } from "@/services/billing/stripe-sync";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.redirect(new URL("/planos?reason=subscription_required&checkout_error=missing_session", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  try {
    const syncedSubscription = await syncCheckoutSession(sessionId, user?.id);

    if (!hasBillableAccess(syncedSubscription)) {
      return NextResponse.redirect(new URL("/planos?reason=subscription_required&checkout_error=sync_failed", request.url));
    }
  } catch (error) {
    const message = error instanceof Error ? encodeURIComponent(error.message.slice(0, 160)) : "sync_failed";
    return NextResponse.redirect(
      new URL(`/planos?reason=subscription_required&checkout_error=sync_failed&details=${message}`, request.url),
    );
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", "/clinicas/nova?checkout=success");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL("/clinicas/nova?checkout=success", request.url));
}
