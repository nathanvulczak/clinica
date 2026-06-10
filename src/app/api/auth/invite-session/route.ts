import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let payload: { access_token?: unknown; refresh_token?: unknown };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  if (
    typeof payload.access_token !== "string" ||
    typeof payload.refresh_token !== "string" ||
    payload.access_token.length < 20 ||
    payload.refresh_token.length < 20
  ) {
    return NextResponse.json({ error: "Tokens do convite não identificados." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
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
