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
}: {
  selected?: string;
  currentPlan?: PlanSlug;
  subscriptionStatus?: SubscriptionStatus;
}) {
  const hasActiveSubscription =
    subscriptionStatus === "active" || subscriptionStatus === "trialing" || subscriptionStatus === "past_due";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {PLANS.map((plan) => (
        <Card
          key={plan.slug}
          className={plan.highlighted || selected === plan.slug ? "border-primary shadow-md" : undefined}
        >
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{plan.name}</CardTitle>
              {plan.highlighted ? <Badge>Mais escolhido</Badge> : null}
            </div>
            <CardDescription>{plan.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <span className="text-3xl font-semibold">{formatCurrencyBRL(plan.priceCents)}</span>
              <span className="text-sm text-muted-foreground"> / mês</span>
            </div>
            <ul className="grid gap-2 text-sm text-muted-foreground">
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
          </CardContent>
          <CardFooter>
            {hasActiveSubscription && currentPlan === plan.slug ? (
              <Button className="w-full" disabled>
                <CreditCard />
                Plano atual
              </Button>
            ) : (
              <Button asChild className="w-full" variant={selected === plan.slug ? "default" : "outline"}>
                <a href={`/api/billing/checkout?plan=${plan.slug}`}>
                  <CreditCard />
                  {hasActiveSubscription ? "Alterar plano" : "Assinar"}
                </a>
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
