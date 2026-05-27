import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccessLog = {
  id: string;
  action_type: string;
  created_at: string;
  notes: string | null;
};

export async function listCurrentUserAccessLogs(): Promise<AccessLog[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action_type, created_at, notes")
    .eq("user_id", user.id)
    .in("action_type", ["login", "logout", "password_changed"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return [];
  }

  return data as AccessLog[];
}
