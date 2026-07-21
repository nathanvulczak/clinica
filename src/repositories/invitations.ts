import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/types/domain";

export type ClinicInvitation = {
  id: string;
  clinic_id: string;
  user_id: string | null;
  email: string;
  role: AppRole;
  status: "pending" | "sent" | "accepted" | "expired" | "canceled" | "failed";
  expires_at: string;
  created_at: string;
  last_sent_at: string | null;
  send_count: number;
  canceled_at: string | null;
  accepted_at: string | null;
  failure_reason: string | null;
  full_name: string | null;
};

export async function listClinicInvitations(clinicId?: string): Promise<ClinicInvitation[]> {
  if (!clinicId) return [];

  const admin = createSupabaseAdminClient();
  await admin.rpc("expire_clinic_invitations");

  const { data, error } = await admin
    .from("clinic_invitations")
    .select(
      "id, clinic_id, user_id, email, role, status, expires_at, created_at, last_sent_at, send_count, canceled_at, accepted_at, failure_reason",
    )
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data?.length) return [];

  const userIds = data.map((invitation) => invitation.user_id).filter((id): id is string => Boolean(id));
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", userIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  return data.map((invitation) => ({
    ...invitation,
    full_name: invitation.user_id ? profileMap.get(invitation.user_id) ?? null : null,
  })) as ClinicInvitation[];
}
