import { getStripePriceEnvName, PLAN_LIMITS } from "@/config/plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PlanSlug } from "@/types/domain";

const planReferenceData: Array<{
  slug: PlanSlug;
  name: string;
  amount_cents: number;
}> = [
  { slug: "singular", name: "Singular", amount_cents: 10990 },
  { slug: "duo", name: "Duo", amount_cents: 15990 },
  { slug: "master", name: "Master", amount_cents: 20990 },
];

export async function ensureBillingReferenceData() {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("clinic_plans").upsert(
    planReferenceData.map((plan) => ({
      ...plan,
      currency: "brl",
      max_clinics: PLAN_LIMITS[plan.slug],
      stripe_price_id: process.env[getStripePriceEnvName(plan.slug)] ?? null,
      active: true,
    })),
    { onConflict: "slug" },
  );

  if (error) {
    throw new Error(`Falha ao garantir planos no Supabase: ${error.message}`);
  }
}
