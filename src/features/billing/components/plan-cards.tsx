import { Check, CreditCard } from "lucide-react";
import { PLANS } from "@/config/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyBRL } from "@/lib/utils";
import type { PlanSlug, SubscriptionStatus } from "@/types/domain";

export function PlanCards({
  selected,
  currentPlan,
  subscriptionStatus,
  activeClinicsCount = 0,
  isAuthenticated = true,
}: {
  selected?: string;
  currentPlan?: PlanSlug;
  subscriptionStatus?: SubscriptionStatus;
  activeClinicsCount?: number;
  isAuthenticated?: boolean;
}) {
  const hasActiveSubscription =
    subscriptionStatus === "active" || subscriptionStatus === "trialing" || subscriptionStatus === "past_due";
  const currentPlanLimit = PLANS.find((plan) => plan.slug === currentPlan)?.maxClinics ?? 0;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {PLANS.map((plan) => {
        const isCurrent = hasActiveSubscription && currentPlan === plan.slug;
        const isDowngrade = hasActiveSubscription && plan.maxClinics < currentPlanLimit;
        const isUpgrade = hasActiveSubscription && plan.maxClinics > currentPlanLimit;
        const downgradeBlocked = isDowngrade && activeClinicsCount > plan.maxClinics;

        return (
          <Card
            key={plan.slug}
            className={plan.highlighted || selected === plan.slug ? "border-primary bg-primary/[0.025]" : undefined}
          >
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{plan.name}</CardTitle>
                {isCurrent ? <Badge>Plano atual</Badge> : plan.highlighted ? <Badge>Mais escolhido</Badge> : null}
              </div>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div>
                <span className="text-2xl font-semibold tabular-nums">{formatCurrencyBRL(plan.priceCents)}</span>
                <span className="text-sm text-muted-foreground"> / mês</span>
              </div>
              <ul className="grid gap-1.5 text-[13px] text-muted-foreground">
                <li className="flex items-center gap-2 text-foreground">
                  <Check className="size-4 text-primary" />
                  Até {plan.maxClinics} clínica{plan.maxClinics > 1 ? "s" : ""}
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-primary" />
                  Multiusuário com RBAC
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-primary" />
                  Auditoria e logs LGPD
                </li>
              </ul>
              {downgradeBlocked ? (
                <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  Reduza para {plan.maxClinics} clínica{plan.maxClinics > 1 ? "s" : ""} ativa
                  {plan.maxClinics > 1 ? "s" : ""} antes do downgrade.
                </p>
              ) : null}
            </CardContent>
            <CardFooter>
              {isCurrent ? (
                <Button className="w-full" disabled>
                  <CreditCard />
                  Plano atual
                </Button>
              ) : downgradeBlocked ? (
                <Button className="w-full" variant="outline" disabled>
                  <CreditCard />
                  Downgrade bloqueado
                </Button>
              ) : !isAuthenticated ? (
                <Button asChild className="w-full" variant={selected === plan.slug ? "default" : "outline"}>
                  <a href={`/cadastro?plan=${plan.slug}`}>
                    <CreditCard />
                    Começar cadastro
                  </a>
                </Button>
              ) : (
                <Button asChild className="w-full" variant={selected === plan.slug || isUpgrade ? "default" : "outline"}>
                  <a href={`/api/billing/checkout?plan=${plan.slug}`}>
                    <CreditCard />
                    {isUpgrade
                      ? "Fazer upgrade"
                      : isDowngrade
                        ? "Solicitar downgrade"
                        : hasActiveSubscription
                          ? "Alterar plano"
                          : "Assinar"}
                  </a>
                </Button>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
