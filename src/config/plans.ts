import type { PlanSlug } from "@/types/domain";

export const PLAN_LIMITS: Record<PlanSlug, number> = {
  singular: 1,
  duo: 2,
  master: 3,
};

export const PLANS = [
  {
    slug: "singular",
    name: "Singular",
    priceCents: 10990,
    maxClinics: 1,
    description: "Para profissionais e clínicas em início de operação.",
    highlighted: false,
  },
  {
    slug: "duo",
    name: "Duo",
    priceCents: 15990,
    maxClinics: 2,
    description: "Para operação com duas unidades ou marcas clínicas.",
    highlighted: true,
  },
  {
    slug: "master",
    name: "Master",
    priceCents: 20990,
    maxClinics: 3,
    description: "Para gestão multiunidade com controle administrativo.",
    highlighted: false,
  },
] as const;

export function getStripePriceEnvName(plan: PlanSlug) {
  return `STRIPE_PRICE_${plan.toUpperCase()}`;
}
