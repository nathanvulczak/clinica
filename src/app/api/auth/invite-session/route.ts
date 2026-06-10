import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let payload: { access_token?: unknown; refresh_token?: unknown };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  const refreshToken =
    typeof payload.refresh_token === "string" ? payload.refresh_token.trim() : "";

  if (
    !accessToken ||
    !refreshToken ||
    accessToken.length > 16_384 ||
    refreshToken.length > 16_384
  ) {
    return NextResponse.json({ error: "Tokens do convite não identificados." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    return NextResponse.json(
      {
        error: error.code === "refresh_token_not_found" ? "expired" : "invalid",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
