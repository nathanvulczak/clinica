import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const USER_VISIBLE_ACTIONS = [
  "login",
  "logout",
  "password_changed",
  "profile_updated",
  "preferences_updated",
  "avatar_uploaded",
  "record_updated",
];

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

  let query = supabase
    .from("audit_logs")
    .select("id, action_type, created_at, notes, level")
    .eq("user_id", user.id)
    .in("action_type", actionType && actionType !== "all" ? [actionType] : USER_VISIBLE_ACTIONS)
    .order("created_at", { ascending: false })
    .limit(50);

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
