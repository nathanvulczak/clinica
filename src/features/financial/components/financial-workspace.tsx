"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  CheckCircle2,
  CreditCard,
  Landmark,
  Plus,
  ReceiptText,
  RotateCcw,
  Settings2,
  Sparkles,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  CardMachineForm,
  EncounterChargeForm,
  FinancialAccountForm,
  FinancialEntryForm,
  FinancialPreferencesForm,
  PaymentMethodForm,
  ReconciliationForm,
  ReceiptForm,
  ReverseReconciliationForm,
  ReversePaymentForm,
  SettleEntryForm,
  VendorForm,
} from "@/features/financial/components/financial-forms";
import type { FinancialSection } from "@/features/financial/components/financial-section-nav";
import { formatCurrencyBRL } from "@/lib/utils";
import type { FinancialPayment, FinancialPreferences } from "@/types/domain";
import type { FinancialEntryWithRelations, FinancialWorkspace as FinancialWorkspaceData, PendingEncounterCharge } from "@/repositories/financial";

const statusLabels: Record<string, string> = {
  pending: "Em aberto",
  partial: "Parcial",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
  refunded: "Estornado",
};

function totalEntryCents(entry: FinancialEntryWithRelations) {
  return entry.amount_cents - entry.discount_cents + entry.addition_cents;
}

function openEntryCents(entry: FinancialEntryWithRelations) {
  return Math.max(totalEntryCents(entry) - entry.paid_cents, 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function MetricCard({
  label,
  value,
  description,
  tone = "default",
}: {
  label: string;
  value: string;
  description: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-medium">{label}</p>
      <p
        className={
          tone === "success"
            ? "mt-3 text-2xl font-semibold text-emerald-700"
            : tone === "warning"
              ? "mt-3 text-2xl font-semibold text-amber-700"
              : "mt-3 text-2xl font-semibold"
        }
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed px-6 py-12 text-center">
      <Sparkles className="mx-auto size-8 text-muted-foreground/60" />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function FinancialWorkspace({
  data,
  section,
}: {
  data: FinancialWorkspaceData;
  section: FinancialSection;
}) {
  if (section === "overview") return <OverviewPanel data={data} />;
  if (section === "receivables") return <EntriesPanel data={data} entryType="receivable" />;
  if (section === "payables") return <EntriesPanel data={data} entryType="payable" />;
  if (section === "accounts") return <RegistriesPanel data={data} />;
  if (section === "reconciliation") return <ReconciliationPanel data={data} />;
  if (section === "commissions") return <CommissionsPanel data={data} />;
  return <PreferencesPanel preferences={data.preferences} canManage={data.access.canManage} />;
}

function OverviewPanel({ data }: { data: FinancialWorkspaceData }) {
  const latestEntries = data.entries.slice(0, 8);

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 xl:grid-cols-5">
        <MetricCard label="A receber" value={formatCurrencyBRL(data.metrics.receivableOpenCents)} description="Saldo aberto de pacientes e convênios" />
        <MetricCard label="Recebido" value={formatCurrencyBRL(data.metrics.receivablePaidCents)} description="Entradas confirmadas" tone="success" />
        <MetricCard label="A pagar" value={formatCurrencyBRL(data.metrics.payableOpenCents)} description="Despesas abertas" />
        <MetricCard label="Vencidos" value={formatCurrencyBRL(data.metrics.overdueCents)} description="Atenção operacional" tone="warning" />
        <MetricCard label="Caixa líquido" value={formatCurrencyBRL(data.metrics.netCashCents)} description="Entradas menos saídas confirmadas" />
      </div>

      <section className="grid gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="font-medium">Inteligência financeira operacional</p>
            <p className="text-sm text-muted-foreground">
              Pacientes finalizados sem cobrança, contas vencidas e taxas de cartão aparecem como sinais de ação.
            </p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Atendimentos aguardando cobrança</p>
            <p className="mt-2 text-xl font-semibold">{data.pendingEncounterCharges.length}</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Contas/caixas ativos</p>
            <p className="mt-2 text-xl font-semibold">{data.accounts.filter((item) => item.active).length}</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Máquinas configuradas</p>
            <p className="mt-2 text-xl font-semibold">{data.cardMachines.filter((item) => item.active).length}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3 border-b pb-3">
          <div>
            <p className="font-medium">Movimentos recentes</p>
            <p className="text-sm text-muted-foreground">Últimos lançamentos financeiros da clínica.</p>
          </div>
        </div>
        {latestEntries.length ? (
          latestEntries.map((entry) => <EntryCard key={entry.id} entry={entry} data={data} compact />)
        ) : (
          <EmptyState title="Nenhum lançamento financeiro" description="As cobranças de atendimento e lançamentos manuais aparecerão aqui." />
        )}
      </section>
    </div>
  );
}

function EntriesPanel({
  data,
  entryType,
}: {
  data: FinancialWorkspaceData;
  entryType: "receivable" | "payable";
}) {
  const [creating, setCreating] = useState(false);
  const entries = data.entries.filter((entry) => entry.entry_type === entryType);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="font-semibold">{entryType === "receivable" ? "Contas a receber" : "Contas a pagar"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lançamentos, baixas, estornos e documentos financeiros auditáveis.
          </p>
        </div>
        <Button disabled={!data.access.canCreate} onClick={() => setCreating(true)}>
          <Plus />
          Novo lançamento
        </Button>
      </header>

      {entryType === "receivable" ? <PendingEncounterChargesPanel data={data} /> : null}

      <div className="grid gap-3">
        {entries.length ? (
          entries.map((entry) => <EntryCard key={entry.id} entry={entry} data={data} />)
        ) : (
          <EmptyState
            title={entryType === "receivable" ? "Nada a receber" : "Nada a pagar"}
            description="Crie lançamentos manuais ou gere cobranças a partir dos atendimentos encerrados."
          />
        )}
      </div>

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title={entryType === "receivable" ? "Novo recebimento" : "Nova conta a pagar"}
        description="Registre uma movimentação financeira manual."
        className="max-w-4xl"
      >
        <FinancialEntryForm
          entryType={entryType}
          categories={data.categories}
          vendors={data.vendors}
          onCompleted={() => setCreating(false)}
        />
      </Modal>
    </div>
  );
}

export function PendingEncounterChargesPanel({ data }: { data: FinancialWorkspaceData }) {
  const [selected, setSelected] = useState<PendingEncounterCharge | null>(null);

  if (!data.pendingEncounterCharges.length) return null;

  return (
    <section className="grid gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="size-5 text-amber-600" />
        <div>
          <p className="font-medium">Atendimentos liberados para cobrança</p>
          <p className="text-sm text-muted-foreground">
            A recepção pode cobrar sem abrir acesso ao módulo financeiro completo.
          </p>
        </div>
      </div>
      <div className="grid gap-2">
        {data.pendingEncounterCharges.slice(0, 8).map((item) => (
          <article key={item.encounter_id} className="grid gap-3 rounded-md border bg-background p-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="font-medium">{item.patient_name}</p>
              <p className="text-sm text-muted-foreground">
                {item.service_name} | {item.professional_name} | {formatCurrencyBRL(item.suggested_amount_cents)}
              </p>
            </div>
            <Button size="sm" disabled={!data.access.canChargeEncounter} onClick={() => setSelected(item)}>
              <ReceiptText />
              Cobrar
            </Button>
          </article>
        ))}
      </div>
      <Modal
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="Cobrar atendimento"
        description={selected ? `${selected.patient_name} - ${selected.service_name}` : undefined}
        className="max-w-4xl"
      >
        {selected ? (
          <EncounterChargeForm
            encounterId={selected.encounter_id}
            suggestedAmountCents={selected.suggested_amount_cents}
            accounts={data.accounts}
            paymentMethods={data.paymentMethods}
            cardMachines={data.cardMachines}
            onCompleted={(state) => {
              setSelected(null);
              if (state.receiptId) window.open(`/financeiro/recibos/${state.receiptId}`, "_blank");
            }}
          />
        ) : null}
      </Modal>
    </section>
  );
}

function EntryCard({
  entry,
  data,
  compact,
}: {
  entry: FinancialEntryWithRelations;
  data: FinancialWorkspaceData;
  compact?: boolean;
}) {
  const [settling, setSettling] = useState(false);
  const [receiptType, setReceiptType] = useState<"payment" | "payment_acknowledgement" | null>(null);
  const [reversing, setReversing] = useState<FinancialPayment | null>(null);
  const openCents = openEntryCents(entry);
  const title = entry.patient?.social_name || entry.patient?.full_name || entry.vendor?.name || entry.description;

  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{title}</p>
            <Badge>{statusLabels[entry.status] ?? entry.status}</Badge>
            <Badge className={entry.entry_type === "receivable" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}>
              {entry.entry_type === "receivable" ? "Receber" : "Pagar"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {entry.description} | venc. {formatDate(entry.due_date)} | total {formatCurrencyBRL(totalEntryCents(entry))}
          </p>
          {!compact ? (
            <div className="mt-3 grid gap-2 text-sm lg:grid-cols-3">
              <div className="rounded-md border bg-muted/20 p-3">
                <span className="text-xs text-muted-foreground">Pago</span>
                <p className="font-medium">{formatCurrencyBRL(entry.paid_cents)}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <span className="text-xs text-muted-foreground">Aberto</span>
                <p className="font-medium">{formatCurrencyBRL(openCents)}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <span className="text-xs text-muted-foreground">Categoria</span>
                <p className="font-medium">{entry.category?.name ?? "Sem categoria"}</p>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Button size="sm" variant="outline" disabled={openCents <= 0 || !data.access.canEdit} onClick={() => setSettling(true)}>
            <CheckCircle2 />
            Baixar
          </Button>
          {entry.entry_type === "receivable" ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setReceiptType("payment")}>
                Recibo
              </Button>
              <Button size="sm" variant="outline" onClick={() => setReceiptType("payment_acknowledgement")}>
                Ciencia
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {!compact && entry.payments.length ? (
        <div className="mt-3 grid gap-2">
          {entry.payments.slice(0, 4).map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2 text-xs">
              <span>
                {payment.status === "reversed" ? "Estornado" : "Confirmado"} | {formatCurrencyBRL(payment.amount_cents)} | taxa{" "}
                {formatCurrencyBRL(payment.fee_cents)} | {formatDate(payment.paid_at)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={payment.status === "reversed" || !data.access.canManage}
                onClick={() => setReversing(payment)}
              >
                <RotateCcw />
                Estornar
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <Modal open={settling} onOpenChange={setSettling} title="Baixar lançamento" description={entry.description} className="max-w-4xl">
        <SettleEntryForm
          entryId={entry.id}
          entryOpenCents={openCents}
          accounts={data.accounts}
          paymentMethods={data.paymentMethods}
          cardMachines={data.cardMachines}
          onCompleted={(state) => {
            setSettling(false);
            if (state.receiptId) window.open(`/financeiro/recibos/${state.receiptId}`, "_blank");
          }}
        />
      </Modal>
      <Modal
        open={Boolean(receiptType)}
        onOpenChange={(open) => {
          if (!open) setReceiptType(null);
        }}
        title={receiptType === "payment" ? "Emitir recibo" : "Emitir ciência de pagamento"}
        className="max-w-lg"
      >
        {receiptType ? (
          <ReceiptForm
            entryId={entry.id}
            type={receiptType}
            onCompleted={(state) => {
              setReceiptType(null);
              if (state.receiptId) window.open(`/financeiro/recibos/${state.receiptId}`, "_blank");
            }}
          />
        ) : null}
      </Modal>
      <Modal
        open={Boolean(reversing)}
        onOpenChange={(open) => {
          if (!open) setReversing(null);
        }}
        title="Estornar baixa"
        description="Informe o motivo para manter rastreabilidade financeira."
        className="max-w-lg"
      >
        {reversing ? <ReversePaymentForm payment={reversing} onCompleted={() => setReversing(null)} /> : null}
      </Modal>
    </article>
  );
}

function RegistriesPanel({ data }: { data: FinancialWorkspaceData }) {
  const [modal, setModal] = useState<"account" | "method" | "machine" | "vendor" | null>(null);

  return (
    <div className="grid gap-5">
      <header className="border-b pb-4">
        <h2 className="font-semibold">Cadastros financeiros</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Contas, caixa, máquinas de cartão, formas de pagamento e fornecedores.
        </p>
      </header>
      <div className="grid gap-4 xl:grid-cols-4">
        <RegistryCard icon={Landmark} title="Contas e caixas" count={data.accounts.length} onClick={() => setModal("account")} disabled={!data.access.canManage} />
        <RegistryCard icon={Banknote} title="Formas de pagamento" count={data.paymentMethods.length} onClick={() => setModal("method")} disabled={!data.access.canManage} />
        <RegistryCard icon={CreditCard} title="Máquinas de cartão" count={data.cardMachines.length} onClick={() => setModal("machine")} disabled={!data.access.canManage} />
        <RegistryCard icon={Truck} title="Fornecedores" count={data.vendors.length} onClick={() => setModal("vendor")} disabled={!data.access.canManage} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ListBox title="Contas cadastradas" items={data.accounts.map((item) => `${item.name} - ${formatCurrencyBRL(item.current_balance_cents)}`)} />
        <ListBox title="Máquinas e taxas" items={data.cardMachines.map((item) => `${item.name} - débito ${item.debit_fee_bps / 100}% / crédito ${item.credit_fee_bps / 100}%`)} />
      </div>

      <Modal open={modal === "account"} onOpenChange={(open) => !open && setModal(null)} title="Nova conta financeira" className="max-w-4xl">
        <FinancialAccountForm onCompleted={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "method"} onOpenChange={(open) => !open && setModal(null)} title="Nova forma de pagamento" className="max-w-3xl">
        <PaymentMethodForm onCompleted={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "machine"} onOpenChange={(open) => !open && setModal(null)} title="Nova máquina de cartão" className="max-w-4xl">
        <CardMachineForm accounts={data.accounts} onCompleted={() => setModal(null)} />
      </Modal>
      <Modal open={modal === "vendor"} onOpenChange={(open) => !open && setModal(null)} title="Novo fornecedor" className="max-w-4xl">
        <VendorForm onCompleted={() => setModal(null)} />
      </Modal>
    </div>
  );
}

function RegistryCard({
  icon: Icon,
  title,
  count,
  onClick,
  disabled,
}: {
  icon: typeof Landmark;
  title: string;
  count: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="grid gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon className="size-5 text-primary" />
      <span className="font-medium">{title}</span>
      <span className="text-2xl font-semibold">{count}</span>
    </button>
  );
}

function ListBox({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <p className="font-medium">{title}</p>
      <div className="mt-3 grid gap-2">
        {items.length ? (
          items.slice(0, 8).map((item) => (
            <div key={item} className="rounded-md border bg-background p-2 text-sm text-muted-foreground">
              {item}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum registro cadastrado.</p>
        )}
      </div>
    </section>
  );
}

type ReconciliationRange = "today" | "week" | "month";

function getRangeStart(range: ReconciliationRange) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (range === "week") {
    const day = date.getDay();
    date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  }
  if (range === "month") date.setDate(1);
  return date;
}

function ReconciliationPanel({ data }: { data: FinancialWorkspaceData }) {
  const [range, setRange] = useState<ReconciliationRange>("month");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [reversing, setReversing] = useState<(typeof data.reconciliations)[number] | null>(null);
  const accountMap = useMemo(() => new Map(data.accounts.map((account) => [account.id, account])), [data.accounts]);
  const reconciliationMap = useMemo(
    () => new Map(data.reconciliations.map((item) => [item.id, item])),
    [data.reconciliations],
  );
  const activeAccountIds = selectedAccounts.length ? selectedAccounts : data.accounts.map((account) => account.id);
  const rangeStart = useMemo(() => getRangeStart(range), [range]);
  const rangeEnd = useMemo(() => {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date;
  }, []);

  const rows = useMemo(
    () =>
      data.entries
        .flatMap((entry) =>
          entry.payments.map((payment) => ({
            entry,
            payment,
            account: payment.account_id ? accountMap.get(payment.account_id) ?? null : null,
            reconciliation: payment.reconciliation_id ? reconciliationMap.get(payment.reconciliation_id) ?? null : null,
          })),
        )
        .filter(({ payment }) => payment.status === "confirmed")
        .filter(({ payment }) => {
          if (payment.account_id && !activeAccountIds.includes(payment.account_id)) return false;
          const paidAt = new Date(payment.paid_at);
          return paidAt >= rangeStart && paidAt <= rangeEnd;
        })
        .sort((a, b) => new Date(b.payment.paid_at).getTime() - new Date(a.payment.paid_at).getTime()),
    [accountMap, activeAccountIds, data.entries, rangeEnd, rangeStart, reconciliationMap],
  );

  const pendingRows = rows.filter(({ payment }) => !payment.reconciliation_id);
  const totalIn = rows.filter(({ payment }) => payment.direction === "in").reduce((sum, row) => sum + row.payment.net_amount_cents, 0);
  const totalOut = rows.filter(({ payment }) => payment.direction === "out").reduce((sum, row) => sum + row.payment.net_amount_cents, 0);

  function toggleAccount(accountId: string) {
    setSelectedAccounts((current) =>
      current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId],
    );
  }

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="font-semibold">Contas e conciliação</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Conferência por conta, período e saldo bancário. Movimentos conciliados ficam protegidos contra alteração.
          </p>
        </div>
        <Button disabled={!data.access.canManage || data.accounts.length === 0} onClick={() => setCreating(true)}>
          <BarChart3 />
          Conciliar período
        </Button>
      </header>

      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Filtros rápidos</p>
            <p className="text-sm text-muted-foreground">Use para conferir saldos e movimentos antes de fechar uma conciliação.</p>
          </div>
          <div className="flex rounded-md border bg-background p-1">
            {[
              ["today", "Hoje"],
              ["week", "Semana"],
              ["month", "Mês"],
            ].map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={range === key ? "secondary" : "ghost"}
                type="button"
                onClick={() => setRange(key as ReconciliationRange)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.accounts.map((account) => (
            <label key={account.id} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={!selectedAccounts.length || selectedAccounts.includes(account.id)}
                onChange={() => toggleAccount(account.id)}
                className="size-4"
              />
              {account.name}
            </label>
          ))}
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-4">
        <MetricCard label="Entradas no filtro" value={formatCurrencyBRL(totalIn)} description="Recebimentos confirmados" tone="success" />
        <MetricCard label="Saídas no filtro" value={formatCurrencyBRL(totalOut)} description="Pagamentos confirmados" />
        <MetricCard label="Movimentos pendentes" value={String(pendingRows.length)} description="Ainda sem conciliação" tone={pendingRows.length ? "warning" : "default"} />
        <MetricCard label="Saldo líquido" value={formatCurrencyBRL(totalIn - totalOut)} description="Entradas menos saídas do período" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {data.accounts
          .filter((account) => activeAccountIds.includes(account.id))
          .map((account) => {
            const accountRows = rows.filter(({ payment }) => payment.account_id === account.id);
            const periodNet = accountRows.reduce(
              (sum, row) => sum + (row.payment.direction === "in" ? row.payment.net_amount_cents : -row.payment.net_amount_cents),
              0,
            );
            return (
              <div key={account.id} className="rounded-lg border bg-card p-4">
                <p className="text-sm font-medium">{account.name}</p>
                <p className="mt-3 text-2xl font-semibold">{formatCurrencyBRL(account.current_balance_cents)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Movimento no filtro: {formatCurrencyBRL(periodNet)}</p>
              </div>
            );
          })}
      </div>

      <section className="rounded-lg border bg-card">
        <div className="flex items-center gap-3 border-b p-4">
          <BarChart3 className="size-5 text-primary" />
          <div>
            <p className="font-medium">Movimentos financeiros</p>
            <p className="text-sm text-muted-foreground">
              Cada registro aparece em coluna própria, com status de conciliação e responsável pelo fechamento.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Conta</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Lançamento</th>
                <th className="px-4 py-3 text-right font-medium">Bruto</th>
                <th className="px-4 py-3 text-right font-medium">Taxa</th>
                <th className="px-4 py-3 text-right font-medium">Líquido</th>
                <th className="px-4 py-3 font-medium">Conciliação</th>
                <th className="px-4 py-3 font-medium">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.slice(0, 120).map(({ entry, payment, account, reconciliation }) => (
                  <tr key={payment.id} className="border-t">
                    <td className="px-4 py-3">{formatDate(payment.paid_at)}</td>
                    <td className="px-4 py-3">{account?.name ?? "Sem conta"}</td>
                    <td className="px-4 py-3">
                      <Badge className={payment.direction === "in" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}>
                        {payment.direction === "in" ? "Entrada" : "Saída"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">{entry.patient?.social_name || entry.patient?.full_name || entry.vendor?.name || "Sem vinculação"}</p>
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrencyBRL(payment.amount_cents)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrencyBRL(payment.fee_cents)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrencyBRL(payment.net_amount_cents)}</td>
                    <td className="px-4 py-3">
                      <Badge className={payment.reconciliation_id ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}>
                        {payment.reconciliation_id ? "Conciliado" : "Pendente"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{reconciliation?.closed_by_profile?.full_name ?? "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={9}>
                    Nenhum movimento encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3 border-b pb-3">
          <div>
            <p className="font-medium">Histórico de conciliações</p>
            <p className="text-sm text-muted-foreground">Fechamentos por período, conta, responsável e status.</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          {data.reconciliations.length ? (
            data.reconciliations.slice(0, 12).map((reconciliation) => (
              <article key={reconciliation.id} className="grid gap-3 rounded-md border bg-background p-3 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{reconciliation.account?.name ?? "Conta"}</p>
                    <Badge className={reconciliation.status === "closed" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}>
                      {reconciliation.status === "closed" ? "Fechada" : "Reaberta"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(reconciliation.period_start)} até {formatDate(reconciliation.period_end)} | saldo {formatCurrencyBRL(reconciliation.bank_balance_cents)}
                    {" | "}fechada por {reconciliation.closed_by_profile?.full_name ?? "usuário não identificado"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reconciliation.status !== "closed" || !data.access.canApprove}
                  onClick={() => setReversing(reconciliation)}
                >
                  <RotateCcw />
                  Reabrir
                </Button>
              </article>
            ))
          ) : (
            <EmptyState title="Nenhuma conciliação fechada" description="Feche uma conciliação bancária para travar os movimentos conferidos." />
          )}
        </div>
      </section>

      <Modal open={creating} onOpenChange={setCreating} title="Fechar conciliação bancária" className="max-w-4xl">
        <ReconciliationForm accounts={data.accounts} onCompleted={() => setCreating(false)} />
      </Modal>
      <Modal
        open={Boolean(reversing)}
        onOpenChange={(open) => {
          if (!open) setReversing(null);
        }}
        title="Reabrir conciliação"
        description="Use somente para correção auditada de movimentos já conferidos."
        className="max-w-lg"
      >
        {reversing ? <ReverseReconciliationForm reconciliation={reversing} onCompleted={() => setReversing(null)} /> : null}
      </Modal>
    </div>
  );
}

function CommissionsPanel({ data }: { data: FinancialWorkspaceData }) {
  const professionalEntries = data.entries.filter((entry) => entry.professional_member_id && entry.entry_type === "receivable");
  const totalReceived = professionalEntries.reduce((sum, entry) => sum + entry.paid_cents, 0);

  return (
    <div className="grid gap-5">
      <header className="border-b pb-4">
        <h2 className="font-semibold">Comissões e repasses</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Estrutura preparada para regras por profissional, serviço, percentual ou valor fixo.
        </p>
      </header>
      <div className="grid gap-3 lg:grid-cols-3">
        <MetricCard label="Base recebida" value={formatCurrencyBRL(totalReceived)} description="Recebimentos vinculados a profissionais" />
        <MetricCard label="Profissionais com receita" value={String(new Set(professionalEntries.map((entry) => entry.professional_member_id)).size)} description="Com potencial de repasse" />
        <MetricCard label="Próxima etapa" value="Regras" description="Percentual, fixo, aprovação e recibo de acerto" />
      </div>
      <section className="rounded-lg border bg-card p-4">
        <p className="font-medium">Modelo operacional sugerido</p>
        <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
          <p>1. A comissão nasce somente após pagamento recebido ou faturamento, conforme regra.</p>
          <p>2. O financeiro aprova o repasse e gera recibo de acerto.</p>
          <p>3. Estornos de recebimento recalculam ou bloqueiam comissões pendentes.</p>
        </div>
      </section>
    </div>
  );
}

function PreferencesPanel({
  preferences,
  canManage,
}: {
  preferences: FinancialPreferences | null;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!preferences) return null;

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="font-semibold">Preferências financeiras</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Regras de cobrança operacional, recibos e vencimentos padrão.
          </p>
        </div>
        <Button disabled={!canManage} onClick={() => setOpen(true)}>
          <Settings2 />
          Editar preferências
        </Button>
      </header>
      <div className="grid gap-3 lg:grid-cols-3">
        <MetricCard
          label="Recepção cobra atendimento"
          value={preferences.allow_reception_checkout ? "Sim" : "Não"}
          description="Permite cobrança sem acesso total ao financeiro"
        />
        <MetricCard
          label="Profissional cobra"
          value={preferences.allow_professional_checkout ? "Sim" : "Não"}
          description="Aplicável ao atendimento próprio"
        />
        <MetricCard
          label="Vencimento padrão"
          value={`${preferences.default_receivable_due_days} dia(s)`}
          description="Usado em cobranças em aberto"
        />
      </div>
      <Modal open={open} onOpenChange={setOpen} title="Preferências financeiras" className="max-w-4xl">
        <FinancialPreferencesForm preferences={preferences} onCompleted={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
