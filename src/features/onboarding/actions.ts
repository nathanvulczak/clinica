"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function dismissWelcomeAction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  await supabase
    .from("profiles")
    .update({
      app_preferences: {
        hide_welcome: true,
      },
      updated_by: user.id,
    })
    .eq("id", user.id);

  revalidatePath("/", "layout");
}
