import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";

const protectedPrefixes = [
  "/dashboard",
  "/clinicas",
  "/cadastros",
  "/assinatura",
  "/usuarios",
  "/auditoria",
  "/perfil",
  "/agenda",
  "/enfermagem",
  "/atendimentos",
  "/prontuarios",
  "/financeiro",
];
const authPrefixes = ["/login", "/cadastro"];
const subscriptionRequiredPrefixes = [
  "/dashboard",
  "/clinicas",
  "/cadastros",
  "/usuarios",
  "/auditoria",
  "/agenda",
  "/enfermagem",
  "/atendimentos",
  "/prontuarios",
  "/financeiro",
];

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function hasValidSupabasePublicConfig() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (!url || !anonKey || anonKey === "missing-anon-key") {
    return false;
  }

  if (/example\.supabase\.co|seu_|sua_|xxx|placeholder/i.test(`${url} ${anonKey}`)) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:" && parsedUrl.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export async function updateSession(request: NextRequest) {
  if (
    request.nextUrl.searchParams.has("code") &&
    !request.nextUrl.pathname.startsWith("/auth/callback")
  ) {
    const callbackUrl = request.nextUrl.clone();
    const originalPath = request.nextUrl.pathname;
    const originalSearch = new URLSearchParams(request.nextUrl.searchParams);
    const code = originalSearch.get("code");

    originalSearch.delete("code");
    callbackUrl.pathname = "/auth/callback";
    callbackUrl.search = "";

    if (code) {
      callbackUrl.searchParams.set("code", code);
    }

    callbackUrl.searchParams.set(
      "next",
      `${originalPath}${originalSearch.toString() ? `?${originalSearch.toString()}` : ""}`,
    );

    return NextResponse.redirect(callbackUrl);
  }

  let response = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some((prefix) => matchesRoute(pathname, prefix));
  const isAuthPage = authPrefixes.some((prefix) => matchesRoute(pathname, prefix));
  const requiresSubscription = subscriptionRequiredPrefixes.some((prefix) =>
    matchesRoute(pathname, prefix),
  );

  if (!hasValidSupabasePublicConfig()) {
    if (isProtected) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.search = "";
      redirectUrl.searchParams.set("config", "supabase_missing");
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  }

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  let user = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    if (isProtected) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.search = "";
      redirectUrl.searchParams.set("auth", "session_error");
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  }

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    const nextPath = `${pathname}${request.nextUrl.search}`;
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(redirectUrl);
  }

  const userId = user?.id;
  const shouldCheckSubscription = Boolean(userId && (requiresSubscription || isAuthPage));

  if (shouldCheckSubscription) {
    const { data: canAccess } = await supabase.rpc("user_has_billable_access");

    if (isAuthPage) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = canAccess ? "/dashboard" : "/planos";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }

    if (requiresSubscription && !canAccess) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/planos";
      redirectUrl.search = "";
      redirectUrl.searchParams.set("reason", "subscription_required");
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}
