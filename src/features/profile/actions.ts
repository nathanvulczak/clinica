"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updatePasswordSchema, updateProfileSchema } from "@/features/profile/validation";
import { formatPhone } from "@/lib/formatters";
import { logAuditEvent } from "@/services/audit/audit-service";

type ProfileState = {
  error?: string;
  success?: string;
};

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getAvatarExtension(type: string) {
  if (type === "image/png") {
    return "png";
  }

  if (type === "image/webp") {
    return "webp";
  }

  return "jpg";
}

function getChangedValues(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(next)) {
    if ((previous[key] ?? null) !== (value ?? null)) {
      oldValues[key] = previous[key] ?? null;
      newValues[key] = value ?? null;
    }
  }

  return {
    oldValues: Object.keys(oldValues).length > 0 ? oldValues : null,
    newValues: Object.keys(newValues).length > 0 ? newValues : null,
    changedFields: Object.keys(newValues),
  };
}

export async function updateProfileAction(
  _state: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const parsed = updateProfileSchema.safeParse({
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
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

  const admin = createSupabaseAdminClient();
  const { data: previousProfile } = await admin
    .from("profiles")
    .select("full_name, phone, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  let avatarUrl = previousProfile?.avatar_url ?? null;
  const avatarFile = formData.get("avatar_file");

  if (avatarFile instanceof File && avatarFile.size > 0) {
    if (avatarFile.size > MAX_AVATAR_SIZE) {
      return { error: "A imagem deve ter no máximo 2 MB." };
    }

    if (!ALLOWED_AVATAR_TYPES.has(avatarFile.type)) {
      return { error: "Use uma imagem JPG, PNG ou WEBP." };
    }

    await admin.storage.createBucket(AVATAR_BUCKET, {
      public: true,
      fileSizeLimit: MAX_AVATAR_SIZE,
      allowedMimeTypes: Array.from(ALLOWED_AVATAR_TYPES),
    });

    const avatarPath = `${user.id}/${crypto.randomUUID()}.${getAvatarExtension(avatarFile.type)}`;
    const { error: uploadError } = await admin.storage
      .from(AVATAR_BUCKET)
      .upload(avatarPath, avatarFile, {
        cacheControl: "3600",
        contentType: avatarFile.type,
        upsert: false,
      });

    if (uploadError) {
      return { error: "Não foi possível enviar a imagem de perfil." };
    }

    avatarUrl = admin.storage.from(AVATAR_BUCKET).getPublicUrl(avatarPath).data.publicUrl;
  }

  const nextProfile = {
    full_name: parsed.data.full_name,
    phone: parsed.data.phone ? formatPhone(parsed.data.phone) : null,
    avatar_url: avatarUrl,
  };

  const { error } = await admin
    .from("profiles")
    .update({
      ...nextProfile,
      updated_by: user.id,
    })
    .eq("id", user.id);

  if (error) {
    return { error: "Não foi possível atualizar seu perfil." };
  }

  const { oldValues, newValues, changedFields } = getChangedValues(previousProfile ?? {}, nextProfile);

  if (changedFields.length > 0) {
    await logAuditEvent({
      userId: user.id,
      actionType: avatarFile instanceof File && avatarFile.size > 0 ? "avatar_uploaded" : "profile_updated",
      recordTable: "profiles",
      recordId: user.id,
      oldValues,
      newValues,
      notes: `Campos alterados: ${changedFields.join(", ")}.`,
    });
  }

  revalidatePath("/perfil");
  revalidatePath("/", "layout");
  return { success: "Perfil atualizado." };
}

export async function updateWelcomePreferenceAction(formData: FormData) {
  const showWelcome = formData.get("show_welcome") === "on";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("profiles")
    .select("app_preferences")
    .eq("id", user.id)
    .maybeSingle();

  const previousPreferences = (previous?.app_preferences ?? {}) as Record<string, unknown>;
  const nextPreferences = {
    ...previousPreferences,
    hide_welcome: !showWelcome,
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
    notes: showWelcome ? "Tela de boas-vindas ativada." : "Tela de boas-vindas desativada.",
  });

  revalidatePath("/perfil");
  revalidatePath("/", "layout");
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sessão expirada." };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  await logAuditEvent({
    userId: user.id,
    actionType: "password_changed",
    module: "permissions",
    recordTable: "profiles",
    recordId: user.id,
    level: "security",
    notes: "Senha alterada pelo usuário em Meu Perfil.",
  });

  revalidatePath("/perfil");
  return { success: "Senha atualizada." };
}
