import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SubscriptionSummary } from "@/types/domain";

export async function getCurrentSubscription(): Promise<SubscriptionSummary | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("subscriptions")
    .select("id, plan_slug, status, current_period_end, stripe_customer_id, stripe_subscription_id, cancel_at_period_end")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  return data as SubscriptionSummary | null;
}
