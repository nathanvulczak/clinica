import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const errorSchema = z.object({
  error_code: z.string().trim().min(2).max(120),
  message: z.string().trim().min(2).max(500),
  route: z.string().trim().max(240).optional(),
  digest: z.string().trim().max(160).optional(),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const parsed = errorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { activeClinic } = await getActiveClinicContext();
  const admin = createSupabaseAdminClient();
  await admin.from("platform_error_events").insert({
    user_id: user.id,
    clinic_id: activeClinic?.id ?? null,
    source: "client",
    error_code: parsed.data.error_code,
    severity: "error",
    status: "open",
    message: parsed.data.message,
    route: parsed.data.route ?? null,
    fingerprint: parsed.data.digest ?? null,
    metadata: {
      digest: parsed.data.digest ?? null,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
