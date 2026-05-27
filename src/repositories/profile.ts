import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserProfile } from "@/types/domain";

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, avatar_url, platform_role, app_preferences")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data as UserProfile | null;
}
