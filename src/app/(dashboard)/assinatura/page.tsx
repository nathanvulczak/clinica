import { Building2, CalendarClock, CreditCard, ReceiptText } from "lucide-react";
import { redirectToCustomerPortalAction } from "@/features/billing/actions";
import { BillingStatusToast } from "@/features/billing/components/billing-status-toast";
import { PlanCards } from "@/features/billing/components/plan-cards";
import { PLAN_LIMITS, PLANS } from "@/config/plans";
import { getActiveClinicContext } from "@/features/clinics/context";
import { formatDateBr, formatDateTimeBr } from "@/lib/dates";
import { formatCurrencyBRL } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCurrentUserInvoices } from "@/repositories/billing";
import { getCurrentSubscription } from "@/repositories/subscriptions";
import type { PlanSlug, SubscriptionStatus } from "@/types/domain";

const statusLabels: Record<SubscriptionStatus | "inactive", string> = {
  active: "Ativa",
  trialing: "Em teste",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  inactive: "Inativa",
};

const statusDescriptions: Record<SubscriptionStatus | "inactive", string> = {
  active: "Acesso liberado até o próximo ciclo da assinatura.",
  trialing: "Acesso liberado durante o período de teste.",
  past_due: "Acesso pode ser mantido até o fim do ciclo pago, mas exige atenção ao pagamento.",
  canceled: "A assinatura foi cancelada e seguirá as regras do ciclo pago.",
  inactive: "Nenhum plano ativo foi encontrado para este usuário.",
};

function getBillingMessage(billing?: string, target?: string) {
  if (!billing) {
    return null;
  }

  const messages: Record<string, string> = {
    same_plan: "Este plano já está ativo na sua assinatura.",
    downgrade_blocked: `Downgrade bloqueado: reduza a quantidade de clínicas ativas antes de migrar para ${target ?? "este plano"}.`,
    missing_customer: "Assinatura incompleta: customer_id não encontrado. Abra o portal ou refaça o checkout.",
    portal_return: "Você voltou do portal Stripe. As alterações serão refletidas após o webhook processar a assinatura.",
    portal_failed: "Não foi possível abrir o portal Stripe. Confira se o Customer Portal está configurado na Stripe.",
    subscription_not_found: "Não encontramos uma assinatura ativa na Stripe para este cliente. Refazer o checkout pode corrigir o vínculo.",
    missing_session: "Sessão de checkout ausente. Refaça a assinatura.",
    sync_failed: "Pagamento concluído, mas não foi possível sincronizar automaticamente.",
    synced: "Assinatura sincronizada com a Stripe.",
  };

  return messages[billing] ?? "Status de assinatura atualizado.";
}

export default async function AssinaturaPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; target?: string; details?: string }>;
}) {
  const params = await searchParams;
  const [{ clinics }, subscription, invoices] = await Promise.all([
    getActiveClinicContext(),
    getCurrentSubscription(),
    listCurrentUserInvoices(),
  ]);
  const currentPlan = subscription?.plan_slug ? PLANS.find((plan) => plan.slug === subscription.plan_slug) : null;
  const limit = subscription?.plan_slug ? PLAN_LIMITS[subscription.plan_slug as PlanSlug] : 0;
  const status = subscription?.status ?? "inactive";
  const billingMessage = getBillingMessage(params.billing, params.target);

  return (
    <>
      <BillingStatusToast billing={params.billing} message={billingMessage ?? undefined} />
      <PageHeader
        title="Assinatura e pagamentos"
        description="Gerencie plano, faturas, upgrade e downgrade com Stripe Customer Portal."
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
      <BillingNotice message={billingMessage} details={params.details} />

      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Plano atual</CardTitle>
            <CreditCard className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold capitalize">{currentPlan?.name ?? "Pendente"}</p>
            <p className="text-xs text-muted-foreground">
              {currentPlan ? `${formatCurrencyBRL(currentPlan.priceCents)} / mês` : "Assinatura ainda não ativa"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uso de clínicas</CardTitle>
            <Building2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {clinics.length}
              <span className="text-base text-muted-foreground"> / {limit || "-"}</span>
            </p>
            <p className="text-xs text-muted-foreground">limite aplicado ao plano contratado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <ReceiptText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{statusLabels[status]}</p>
            <p className="text-xs text-muted-foreground">{statusDescriptions[status]}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próximo ciclo</CardTitle>
            <CalendarClock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatDateBr(subscription?.current_period_end)}</p>
            <p className="text-xs text-muted-foreground">
              {subscription?.cancel_at_period_end ? "Cancelamento programado ao fim do ciclo." : "Planos mensais recorrentes."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Transparência Stripe</CardTitle>
          <CardDescription>IDs e faturas são mantidos para rastreabilidade de assinatura e pagamentos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-3">
          <InfoLine label="Customer ID" value={subscription?.stripe_customer_id ?? "não salvo"} />
          <InfoLine label="Subscription ID" value={subscription?.stripe_subscription_id ?? "não salvo"} />
          <InfoLine label="Fim do ciclo pago" value={formatDateTimeBr(subscription?.current_period_end)} />
        </CardContent>
      </Card>

      <section className="mb-8 grid gap-4">
        <div>
          <h2 className="text-lg font-semibold">Alterar plano</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upgrades e downgrades passam pelo portal da Stripe. Downgrades respeitam o limite de clínicas ativas.
          </p>
        </div>
        <PlanCards
          selected={subscription?.plan_slug}
          currentPlan={subscription?.plan_slug}
          subscriptionStatus={subscription?.status}
          activeClinicsCount={clinics.length}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Pagamentos e faturas</CardTitle>
          <CardDescription>Histórico recebido pelos webhooks da Stripe.</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              Nenhuma fatura sincronizada ainda. Após o próximo webhook de invoice, os pagamentos aparecerão aqui.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <div className="grid min-w-[820px] grid-cols-[160px_150px_150px_1fr_160px] bg-muted px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                <span>Data</span>
                <span>Status</span>
                <span>Valor pago</span>
                <span>Invoice</span>
                <span className="text-right">Ações</span>
              </div>
              <div className="min-w-[820px] divide-y">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="grid grid-cols-[160px_150px_150px_1fr_160px] items-center gap-3 px-4 py-3 text-sm">
                    <span className="text-muted-foreground">{formatDateTimeBr(invoice.paid_at ?? invoice.created_at)}</span>
                    <Badge>{invoice.status ?? "sem status"}</Badge>
                    <span className="font-medium">{formatCurrencyBRL(invoice.amount_paid || invoice.amount_due)}</span>
                    <span className="truncate text-muted-foreground">{invoice.stripe_invoice_id}</span>
                    <div className="flex justify-end gap-2">
                      {invoice.hosted_invoice_url ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer">
                            Abrir
                          </a>
                        </Button>
                      ) : null}
                      {invoice.invoice_pdf ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={invoice.invoice_pdf} target="_blank" rel="noreferrer">
                            PDF
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-all font-medium">{value}</p>
    </div>
  );
}

function BillingNotice({ message, details }: { message?: string | null; details?: string }) {
  if (!message) {
    return null;
  }

  return (
    <div className="mb-6 rounded-lg border bg-card p-4 text-sm">
      <Badge className="mb-2">Billing</Badge>
      <p className="text-muted-foreground">{message}</p>
      {details ? <p className="mt-2 text-xs text-muted-foreground">Detalhe técnico: {details}</p> : null}
    </div>
  );
}
