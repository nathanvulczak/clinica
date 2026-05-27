"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updatePasswordSchema, updateProfileSchema } from "@/features/profile/validation";

type ProfileState = {
  error?: string;
  success?: string;
};

export async function updateProfileAction(
  _state: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const parsed = updateProfileSchema.safeParse({
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
    avatar_url: formData.get("avatar_url"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sessão expirada." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
      avatar_url: parsed.data.avatar_url || null,
      updated_by: user.id,
    })
    .eq("id", user.id);

  if (error) {
    return { error: "Não foi possível atualizar seu perfil." };
  }

  revalidatePath("/perfil");
  revalidatePath("/", "layout");
  return { success: "Perfil atualizado." };
}

export async function updatePasswordAction(
  _state: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  await supabase.from("audit_logs").insert({
    user_id: (await supabase.auth.getUser()).data.user?.id,
    action_type: "password_changed",
    module: "permissions",
    level: "security",
    notes: "Senha alterada pelo usuário em Meu Perfil.",
  });

  return { success: "Senha atualizada." };
}
