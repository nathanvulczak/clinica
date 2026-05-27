import { redirectToCustomerPortalAction } from "@/features/billing/actions";
import { PlanCards } from "@/features/billing/components/plan-cards";
import { formatDateBr } from "@/lib/dates";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentSubscription } from "@/repositories/subscriptions";

export default async function AssinaturaPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; target?: string }>;
}) {
  const params = await searchParams;
  const subscription = await getCurrentSubscription();

  return (
    <>
      <PageHeader
        title="Assinatura e pagamentos"
        description="Gerencie plano, invoices, upgrade e downgrade com Stripe Customer Portal."
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <a href="/api/billing/sync">Sincronizar</a>
            </Button>
            <form action={redirectToCustomerPortalAction}>
              <Button variant="outline">Portal Stripe</Button>
            </form>
          </div>
        }
      />
      <BillingNotice billing={params.billing} target={params.target} />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Plano atual</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            <span className="text-muted-foreground">Plano:</span>{" "}
            <span className="font-medium capitalize">{subscription?.plan_slug ?? "não definido"}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Status:</span>{" "}
            <span className="font-medium">{subscription?.status ?? "inactive"}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Próxima renovação / fim do ciclo pago:</span>{" "}
            <span className="font-medium">{formatDateBr(subscription?.current_period_end)}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Os planos são mensais. Se a assinatura começa em 27/05/2026, o ciclo pago termina em 27/06/2026.
          </p>
        </CardContent>
      </Card>
      <PlanCards
        selected={subscription?.plan_slug}
        currentPlan={subscription?.plan_slug}
        subscriptionStatus={subscription?.status}
      />
    </>
  );
}

function BillingNotice({ billing, target }: { billing?: string; target?: string }) {
  if (!billing) {
    return null;
  }

  const messages: Record<string, string> = {
    same_plan: "Este plano já está ativo na sua assinatura.",
    downgrade_blocked: `Downgrade bloqueado: reduza a quantidade de clínicas ativas antes de migrar para ${target ?? "este plano"}.`,
    missing_customer: "Assinatura incompleta: customer_id não encontrado. Abra o portal ou refaça o checkout.",
    portal_return: "Você voltou do portal Stripe. As alterações serão refletidas após o webhook processar a assinatura.",
    subscription_not_found: "Não encontramos uma assinatura ativa na Stripe para este cliente. Refazer o checkout pode corrigir o vínculo.",
    missing_session: "Sessão de checkout ausente. Refaça a assinatura.",
    sync_failed: "Pagamento concluído, mas não foi possível sincronizar automaticamente. Confira o webhook Stripe ou tente atualizar a página.",
    synced: "Assinatura sincronizada com a Stripe.",
  };

  return (
    <div className="mb-6 rounded-lg border bg-card p-4 text-sm">
      <Badge className="mb-2">Billing</Badge>
      <p className="text-muted-foreground">{messages[billing] ?? "Status de assinatura atualizado."}</p>
    </div>
  );
}
