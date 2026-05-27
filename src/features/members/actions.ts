"use server";

import { revalidatePath } from "next/cache";
import { getAppUrl } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  inviteMemberSchema,
  removeMemberSchema,
  updateMemberRoleSchema,
} from "@/features/members/validation";

export type MemberActionState = {
  error?: string;
  success?: string;
};

export async function inviteMemberAction(
  _state: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const parsed = inviteMemberSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const [{ activeClinic }, supabase] = await Promise.all([
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);

  if (!activeClinic) {
    return { error: "Selecione ou cadastre uma clínica antes de convidar usuários." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", parsed.data.email)
    .maybeSingle();

  if (profile?.id) {
    const { error } = await supabase.from("clinic_members").upsert(
      {
        clinic_id: activeClinic.id,
        user_id: profile.id,
        role: parsed.data.role,
        status: "active",
        joined_at: new Date().toISOString(),
        invited_by: user.id,
        created_by: user.id,
        updated_by: user.id,
      },
      { onConflict: "clinic_id,user_id" },
    );

    if (error) {
      return { error: "Não foi possível adicionar o usuário. Verifique sua permissão nesta clínica." };
    }

    revalidatePath("/usuarios");
    return { success: "Usuário existente adicionado à clínica." };
  }

  const { error } = await supabase.from("clinic_invitations").insert({
    clinic_id: activeClinic.id,
    email: parsed.data.email,
    role: parsed.data.role,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) {
    return { error: "Não foi possível registrar o convite. Verifique sua permissão nesta clínica." };
  }

  const inviteRedirectUrl = new URL("/auth/callback", getAppUrl());
  inviteRedirectUrl.searchParams.set("next", "/login?invite=accepted");

  const { data: invitedUser, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: inviteRedirectUrl.toString(),
    data: {
      invited_clinic_id: activeClinic.id,
      invited_role: parsed.data.role,
      invited_by: user.id,
    },
  });

  if (inviteError) {
    return {
      error: `Convite registrado, mas o e-mail não foi enviado pelo Supabase Auth: ${inviteError.message}`,
    };
  }

  if (invitedUser.user?.id) {
    await admin.from("clinic_members").upsert(
      {
        clinic_id: activeClinic.id,
        user_id: invitedUser.user.id,
        role: parsed.data.role,
        status: "invited",
        invited_by: user.id,
        created_by: user.id,
        updated_by: user.id,
      },
      { onConflict: "clinic_id,user_id" },
    );
  }

  revalidatePath("/usuarios");
  return { success: "Convite enviado por e-mail e registrado na clínica." };
}

export async function updateMemberRoleAction(formData: FormData) {
  const parsed = updateMemberRoleSchema.safeParse({
    member_id: formData.get("member_id"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  await supabase
    .from("clinic_members")
    .update({
      role: parsed.data.role,
      updated_by: user.id,
    })
    .eq("id", parsed.data.member_id);

  revalidatePath("/usuarios");
}

export async function suspendMemberAction(formData: FormData) {
  const parsed = removeMemberSchema.safeParse({
    member_id: formData.get("member_id"),
  });

  if (!parsed.success) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  await supabase
    .from("clinic_members")
    .update({
      status: "suspended",
      updated_by: user.id,
    })
    .eq("id", parsed.data.member_id);

  revalidatePath("/usuarios");
}
