import { CalendarClock, CheckCircle2, CreditCard, ExternalLink, ReceiptText, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { redirectToCustomerPortalAction } from "@/features/billing/actions";
import { BillingStatusToast } from "@/features/billing/components/billing-status-toast";
import { PlanCards } from "@/features/billing/components/plan-cards";
import { PLAN_LIMITS, PLANS } from "@/config/plans";
import { formatDateBr, formatDateTimeBr } from "@/lib/dates";
import { formatCurrencyBRL } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { countOwnerClinics, listCurrentUserInvoices } from "@/repositories/billing";
import { getCurrentSubscription } from "@/repositories/subscriptions";
import { getBillingAuthorization } from "@/services/billing/authorization";
import { auditDeniedModuleAccess } from "@/services/authorization/clinic-access";
import type { PlanSlug, SubscriptionStatus } from "@/types/domain";

const statusLabels: Record<SubscriptionStatus | "inactive", string> = {
  active: "Ativa",
  trialing: "Em teste",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  inactive: "Inativa",
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
  const billingAuthorization = await getBillingAuthorization();

  if (!billingAuthorization.canView || !billingAuthorization.ownerUserId) {
    await auditDeniedModuleAccess(
      billingAuthorization.activeClinic?.id,
      "billing",
      "Tentativa de acesso direto à página de assinatura sem permissão.",
    );
    redirect("/dashboard?access=denied&module=billing");
  }

  const [subscription, invoices, activeClinicsCount] = await Promise.all([
    getCurrentSubscription(billingAuthorization.ownerUserId),
    listCurrentUserInvoices(billingAuthorization.ownerUserId),
    countOwnerClinics(billingAuthorization.ownerUserId),
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
          billingAuthorization.canManage ? (
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <a href="/api/billing/sync">Sincronizar</a>
              </Button>
              <form action={redirectToCustomerPortalAction}>
                <Button variant="outline">Portal Stripe</Button>
              </form>
            </div>
          ) : null
        }
      />
      <BillingNotice message={billingMessage} details={params.details} />

      <section className="mb-6 overflow-hidden rounded-lg border bg-card">
        <div className="grid gap-4 border-b px-4 py-4 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary"><CreditCard className="size-5" /></div><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Plano {currentPlan?.name ?? "pendente"}</h2><Badge className={status === "active" || status === "trialing" ? "bg-emerald-500/10 text-emerald-700" : status === "past_due" ? "bg-amber-500/10 text-amber-700" : "bg-muted text-muted-foreground"}>{statusLabels[status]}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{currentPlan ? `${formatCurrencyBRL(currentPlan.priceCents)} por mês · cobrança gerenciada pela Stripe` : "Escolha um plano para ativar a operação."}</p></div></div>
          <div><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Clínicas utilizadas</span><strong className="tabular-nums">{activeClinicsCount} de {limit || 0}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${limit ? Math.min(100, (activeClinicsCount / limit) * 100) : 0}%` }} /></div><p className="mt-1.5 text-[11px] text-muted-foreground">{limit > activeClinicsCount ? `${limit - activeClinicsCount} clínica(s) ainda disponível(is) neste plano.` : "Limite atual utilizado."}</p></div>
        </div>
        <div className="grid lg:grid-cols-3">
          <div className="flex gap-3 px-4 py-3"><CalendarClock className="mt-0.5 size-4 text-primary" /><div><p className="text-xs font-medium">Próximo ciclo</p><p className="mt-1 text-sm font-semibold">{formatDateBr(subscription?.current_period_end)}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{subscription?.cancel_at_period_end ? "Cancelamento programado." : "Renovação mensal automática."}</p></div></div>
          <div className="flex gap-3 border-t px-4 py-3 lg:border-l lg:border-t-0"><ReceiptText className="mt-0.5 size-4 text-primary" /><div><p className="text-xs font-medium">Histórico financeiro</p><p className="mt-1 text-sm font-semibold">{invoices.length} fatura(s)</p><p className="mt-0.5 text-[11px] text-muted-foreground">Pagamentos sincronizados por webhook.</p></div></div>
          <div className="flex gap-3 border-t px-4 py-3 lg:border-l lg:border-t-0"><ShieldCheck className="mt-0.5 size-4 text-primary" /><div><p className="text-xs font-medium">Integração</p><p className="mt-1 flex items-center gap-1.5 text-sm font-semibold"><CheckCircle2 className="size-3.5 text-emerald-600" />Stripe conectada</p><p className="mt-0.5 text-[11px] text-muted-foreground">Assinatura e faturas rastreáveis.</p></div></div>
        </div>
      </section>

      <details className="mb-6 rounded-lg border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Dados técnicos e rastreabilidade Stripe</summary>
        <div className="grid gap-2 border-t p-4 text-sm md:grid-cols-3"><InfoLine label="Customer ID" value={subscription?.stripe_customer_id ?? "não salvo"} /><InfoLine label="Subscription ID" value={subscription?.stripe_subscription_id ?? "não salvo"} /><InfoLine label="Fim do ciclo pago" value={formatDateTimeBr(subscription?.current_period_end)} /></div>
      </details>

      {billingAuthorization.canManage ? (
        <section className="mb-8 grid gap-4">
          <div>
            <h2 className="text-base font-semibold">Planos disponíveis</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O plano atual não pode ser assinado novamente. Downgrades respeitam o limite de clínicas ativas e alterações são confirmadas no portal seguro da Stripe.
            </p>
          </div>
          <PlanCards
            selected={subscription?.plan_slug}
            currentPlan={subscription?.plan_slug}
            subscriptionStatus={subscription?.status}
            activeClinicsCount={activeClinicsCount}
          />
        </section>
      ) : (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Acesso somente para consulta</CardTitle>
            <CardDescription>
              Seu perfil pode acompanhar plano e pagamentos, mas alterações exigem a permissão Gerenciar assinatura.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

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
              <div className="grid min-w-[820px] grid-cols-[160px_150px_150px_1fr_160px] bg-muted px-4 py-2.5 text-xs font-medium uppercase text-muted-foreground">
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
                            Abrir <ExternalLink />
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
