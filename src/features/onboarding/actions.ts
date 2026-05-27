"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/services/audit/audit-service";

export async function dismissWelcomeAction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("app_preferences")
    .eq("id", user.id)
    .maybeSingle();

  const previousPreferences = (profile?.app_preferences ?? {}) as Record<string, unknown>;
  const nextPreferences = {
    ...previousPreferences,
    hide_welcome: true,
  };

  await admin
    .from("profiles")
    .update({
      app_preferences: nextPreferences,
      updated_by: user.id,
    })
    .eq("id", user.id);

  await logAuditEvent({
    userId: user.id,
    actionType: "preferences_updated",
    recordTable: "profiles",
    recordId: user.id,
    oldValues: { app_preferences: previousPreferences },
    newValues: { app_preferences: nextPreferences },
    notes: "Tela de boas-vindas desativada pelo atalho inicial.",
  });

  revalidatePath("/", "layout");
}
