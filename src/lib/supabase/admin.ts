import { createClient } from "@supabase/supabase-js";
import { getRequiredServerEnv, getSupabaseUrl } from "@/lib/env";

export function createSupabaseAdminClient() {
  return createClient(getSupabaseUrl(), getRequiredServerEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
