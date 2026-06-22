import { Badge } from "@/components/ui/badge";
import { EmptyState, MetricCard } from "@/features/financial/components/financial-ui";
import { formatCurrencyBRL } from "@/lib/utils";
import type { FinancialEntryWithRelations, FinancialWorkspace } from "@/repositories/financial";

const statusLabels: Record<string, string> = {
  pending: "Em aberto",
  partial: "Parcial",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
  refunded: "Estornado",
};

function totalEntryCents(entry: FinancialEntryWithRelations) {
  return entry.amount_cents - entry.discount_cents + (entry.freight_cents ?? 0) + entry.addition_cents;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function FinancialOverview({ data }: { data: FinancialWorkspace }) {
  const latestEntries = [...data.entries]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 8);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2.5 xl:grid-cols-5">
        <MetricCard label="A receber" value={formatCurrencyBRL(data.metrics.receivableOpenCents)} description="Saldo aberto de pacientes e convênios" />
        <MetricCard label="Recebido" value={formatCurrencyBRL(data.metrics.receivablePaidCents)} description="Entradas confirmadas" tone="success" />
        <MetricCard label="A pagar" value={formatCurrencyBRL(data.metrics.payableOpenCents)} description="Despesas abertas" />
        <MetricCard label="Vencidos" value={formatCurrencyBRL(data.metrics.overdueCents)} description="Atenção operacional" tone="warning" />
        <MetricCard label="Caixa líquido" value={formatCurrencyBRL(data.metrics.netCashCents)} description="Entradas menos saídas confirmadas" />
      </div>

      <section className="grid gap-3 border-b border-t py-3">
        <div>
          <p className="text-sm font-medium">Sinais operacionais</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Pendências que merecem conferência da equipe financeira.</p>
        </div>
        <div className="grid gap-2 lg:grid-cols-3">
          <div className="flex items-center justify-between rounded-md bg-muted/35 px-3 py-2 text-[13px]">
            <span className="text-muted-foreground">Aguardando cobrança</span>
            <strong className="tabular-nums">{data.pendingEncounterCharges.length}</strong>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/35 px-3 py-2 text-[13px]">
            <span className="text-muted-foreground">Contas e caixas ativos</span>
            <strong className="tabular-nums">{data.accounts.filter((item) => item.active).length}</strong>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/35 px-3 py-2 text-[13px]">
            <span className="text-muted-foreground">Máquinas configuradas</span>
            <strong className="tabular-nums">{data.cardMachines.filter((item) => item.active).length}</strong>
          </div>
        </div>
      </section>

      <section className="grid gap-2.5">
        <div>
          <p className="text-sm font-medium">Movimentos recentes</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Últimos lançamentos atualizados na clínica.</p>
        </div>
        {latestEntries.length ? (
          <div className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead className="sticky top-10 z-10 bg-muted/80 text-left text-xs text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-2 font-medium">Origem</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 font-medium">Vencimento</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {latestEntries.map((entry) => {
                  const party = entry.patient?.social_name || entry.patient?.full_name || entry.vendor?.name || "Sem vínculo";
                  return (
                    <tr key={entry.id} className="border-t">
                      <td className="px-3 py-2.5 font-medium">{party}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{entry.description}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatDate(entry.due_date)}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrencyBRL(totalEntryCents(entry))}</td>
                      <td className="px-3 py-2.5"><Badge>{statusLabels[entry.status] ?? entry.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhum lançamento financeiro" description="As cobranças e lançamentos manuais aparecerão aqui." />
        )}
      </section>
    </div>
  );
}
