import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getSafeNext(request: NextRequest, value: string | null) {
  if (!value) {
    return "/planos";
  }

  try {
    const nextUrl = new URL(value, request.url);

    if (nextUrl.origin !== request.nextUrl.origin) {
      return "/planos";
    }

    return `${nextUrl.pathname}${nextUrl.search}`;
  } catch {
    return "/planos";
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = getSafeNext(request, requestUrl.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  const isRecovery = next.startsWith("/redefinir-senha");
  const errorUrl = new URL(isRecovery ? "/recuperar-senha" : "/login", request.url);
  errorUrl.searchParams.set("auth", "callback_error");

  if (type === "invite") {
    errorUrl.searchParams.set("invite", "expired");
  }
  if (isRecovery) {
    errorUrl.searchParams.set("recovery", "expired");
  }

  return NextResponse.redirect(errorUrl);
}
