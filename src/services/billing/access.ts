import type { SubscriptionSummary } from "@/types/domain";

export function hasBillableAccess(subscription?: SubscriptionSummary | null) {
  if (!subscription) {
    return false;
  }

  if (subscription.status === "active" || subscription.status === "trialing") {
    return true;
  }

  if (subscription.status === "past_due" && subscription.current_period_end) {
    return new Date(subscription.current_period_end).getTime() > Date.now();
  }

  return false;
}
