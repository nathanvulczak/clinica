import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ logs: [] }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const actionType = params.get("action_type");
  const dateFrom = params.get("from");
  const dateTo = params.get("to");
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("audit_logs")
    .select("id, action_type, created_at, notes, level, module, record_table")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (actionType && actionType !== "all") {
    query = query.eq("action_type", actionType);
  }

  if (dateFrom) {
    query = query.gte("created_at", new Date(`${dateFrom}T00:00:00-03:00`).toISOString());
  }

  if (dateTo) {
    query = query.lte("created_at", new Date(`${dateTo}T23:59:59-03:00`).toISOString());
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ logs: [] }, { status: 200 });
  }

  return NextResponse.json({ logs: data ?? [] });
}
