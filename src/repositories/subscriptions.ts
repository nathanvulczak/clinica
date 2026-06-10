import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionSummary } from "@/types/domain";

export async function getCurrentSubscription(ownerUserId?: string): Promise<SubscriptionSummary | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const ownerId = ownerUserId ?? user.id;
  const client = ownerId === user.id ? supabase : createSupabaseAdminClient();
  const { data } = await client
    .from("subscriptions")
    .select("id, plan_slug, status, current_period_end, stripe_customer_id, stripe_subscription_id, cancel_at_period_end")
    .eq("owner_user_id", ownerId)
    .maybeSingle();

  return data as SubscriptionSummary | null;
}
