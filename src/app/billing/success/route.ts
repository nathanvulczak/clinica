import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncCheckoutSession } from "@/services/billing/stripe-sync";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.redirect(new URL("/assinatura?billing=missing_session", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=/billing/success?session_id=${sessionId}`, request.url));
  }

  try {
    await syncCheckoutSession(sessionId, user.id);
  } catch {
    return NextResponse.redirect(new URL("/assinatura?billing=sync_failed", request.url));
  }

  return NextResponse.redirect(new URL("/clinicas/nova?checkout=success", request.url));
}
