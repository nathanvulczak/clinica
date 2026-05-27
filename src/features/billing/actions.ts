"use server";

import { redirect } from "next/navigation";
import type { PlanSlug } from "@/types/domain";

export async function redirectToCheckoutAction(formData: FormData) {
  const plan = String(formData.get("plan") ?? "singular") as PlanSlug;
  redirect(`/api/billing/checkout?plan=${plan}`);
}

export async function redirectToCustomerPortalAction() {
  redirect("/api/billing/portal");
}
