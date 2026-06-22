"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BarChart3,
  Building2,
  Calculator,
  CalendarCheck,
  CheckCircle2,
  CreditCard,
  Eye,
  FileText,
  Landmark,
  LockOpen,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Tags,
  Truck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FinancialOverview } from "@/features/financial/components/financial-overview";
import { EmptyState, FinancialPanelHeader, MetricCard } from "@/features/financial/components/financial-ui";
import { PendingEncounterChargesPanel } from "@/features/financial/components/pending-encounter-charges-panel";
import {
  CancelFinancialEntryForm,
  BankStatementImportForm,
  CardMachineForm,
  CostCenterForm,
  FinancialAccountForm,
  FinancialCategoryForm,
  FinancialEntryForm,
  FinancialPreferencesForm,
  FinancialRecurringEntryForm,
  CommissionRuleForm,
  CommissionSettlementForm,
  CommissionStatusForm,
  CompleteBankImportForm,
  DeleteBankImportForm,
  GenerateCommissionsForm,
  GenerateRecurringPayableForm,
  HealthPlanForm,
  PaymentMethodForm,
  ReconciliationForm,
  MonthlyCloseForm,
  ReceiptForm,
  ReverseReconciliationForm,
  ReopenMonthlyCloseForm,
  ReversePaymentForm,
  SettleEntryForm,
  VendorForm,
} from "@/features/financial/components/financial-forms";
import type { FinancialSection, FinancialSubsection } from "@/features/financial/navigation";
import { formatCurrencyBRL } from "@/lib/utils";
import type { FinancialPayment, FinancialPreferences } from "@/types/domain";
import type { FinancialEntryWithRelations, FinancialWorkspace as FinancialWorkspaceData } from "@/repositories/financial";

const statusLabels: Record<string, string> = {
  pending: "Em aberto",
  partial: "Parcial",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
  refunded: "Estornado",
};

const entryEventLabels: Record<string, string> = {
  created: "Lançamento criado",
  updated: "Lançamento atualizado",
  settled: "Baixa registrada",
  payment_reversed: "Pagamento estornado",
  cancelled: "Lançamento cancelado",
  receipt_issued: "Documento emitido",
  reconciliation_closed: "Conciliação fechada",
  reconciliation_reopened: "Conciliação reaberta",
  ledger_posted: "Livro-caixa atualizado",
};

const documentTypeLabels: Record<string, string> = {
  nfe: "NF-e",
  nfse: "NFS-e",
  receipt: "Recibo",
  contract: "Contrato",
  other: "Outro",
};

function documentTypeLabel(value: string | null | undefined) {
  return documentTypeLabels[value ?? "other"] ?? "Outro";
}

function frequencyLabel(value: string) {
  if (value === "weekly") return "Semanal";
  if (value === "quarterly") return "Trimestral";
  if (value === "yearly") return "Anual";
  return "Mensal";
}

function totalEntryCents(entry: FinancialEntryWithRelations) {
  return entry.amount_cents - entry.discount_cents + (entry.freight_cents ?? 0) + entry.addition_cents;
}

function openEntryCents(entry: FinancialEntryWithRelations) {
  return Math.max(totalEntryCents(entry) - entry.paid_cents, 0);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Não informado";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function FinancialWorkspace({
  data,
  section,
  activeView,
}: {
  data: FinancialWorkspaceData;
  section: FinancialSection;
  activeView: FinancialSubsection;
}) {
  const safeData: FinancialWorkspaceData = {
    ...data,
    accounts: data.accounts ?? [],
    paymentMethods: data.paymentMethods ?? [],
    cardMachines: data.cardMachines ?? [],
    categories: data.categories ?? [],
    costCenters: data.costCenters ?? [],
    healthPlans: data.healthPlans ?? [],
    vendors: data.vendors ?? [],
    entries: (data.entries ?? []).map((entry) => ({
      ...entry,
      payments: entry.payments ?? [],
      receipts: entry.receipts ?? [],
      items: entry.items ?? [],
      events: entry.events ?? [],
      ledgerEntries: entry.ledgerEntries ?? [],
    })),
    payments: data.payments ?? [],
    recurringEntries: data.recurringEntries ?? [],
    reconciliations: data.reconciliations ?? [],
    commissionRules: data.commissionRules ?? [],
    commissions: data.commissions ?? [],
    bankImports: (data.bankImports ?? []).map((item) => ({ ...item, items: item.items ?? [] })),
    monthlyClosings: data.monthlyClosings ?? [],
    professionals: data.professionals ?? [],
    services: data.services ?? [],
    pendingEncounterCharges: data.pendingEncounterCharges ?? [],
    metrics: data.metrics ?? {
      receivableOpenCents: 0,
      receivablePaidCents: 0,
      payableOpenCents: 0,
      payablePaidCents: 0,
      overdueCents: 0,
      netCashCents: 0,
    },
  };

  if (section === "overview") return <FinancialOverview data={safeData} />;
  if (section === "receivables") return <ReceivablesWorkspace data={safeData} activeView={activeView} />;
  if (section === "payables") return <PayablesWorkspace data={safeData} activeView={activeView} />;
  if (section === "accounts") return <RegistriesPanel data={safeData} activeView={activeView} />;
  if (section === "reconciliation") return <ReconciliationPanel data={safeData} activeView={activeView} />;
  if (section === "commissions") return <CommissionsPanel data={safeData} activeView={activeView} />;
  return <PreferencesPanel preferences={safeData.preferences} canManage={safeData.access.canManage} activeView={activeView} />;
}


function ReceivablesWorkspace({ data, activeView }: { data: FinancialWorkspaceData; activeView: FinancialSubsection }) {
  if (activeView === "charge") return <ReceivableChargePanel data={data} />;
  if (activeView === "settle") return <ReceivableSettlePanel data={data} />;
  if (activeView === "reversals") return <ReceivableReversalsPanel data={data} />;
  if (activeView === "receipts") return <ReceivableReceiptsPanel data={data} />;
  if (activeView === "delinquency") return <ReceivableDelinquencyPanel data={data} />;
  if (activeView === "reports") return <ReceivableReportsPanel data={data} />;
  return <ReceivableOpenPanel data={data} activeView={activeView} />;
}

function ReceivableOpenPanel({ data, activeView }: { data: FinancialWorkspaceData; activeView: FinancialSubsection }) {
  const [creating, setCreating] = useState(false);
  const entries = data.entries.filter((entry) => entry.entry_type === "receivable");

  return (
    <div className="grid gap-5">
      <FinancialPanelHeader
        title="Contas a receber"
        description="Carteira de recebimentos por paciente, convênio, vencimento, baixa, recibo e status."
        action={
          <Button disabled={!data.access.canCreate} onClick={() => setCreating(true)}>
            <Plus />
            Novo recebimento
          </Button>
        }
      />
      <EntriesTable entries={entries} data={data} entryType="receivable" activeView={activeView} />
      <Modal open={creating} onOpenChange={setCreating} title="Novo recebimento" className="max-w-4xl">
        <FinancialEntryForm
          entryType="receivable"
          categories={data.categories}
          costCenters={data.costCenters}
          healthPlans={data.healthPlans}
          vendors={data.vendors}
          onCompleted={() => setCreating(false)}
        />
      </Modal>
    </div>
  );
}

function ReceivableChargePanel({ data }: { data: FinancialWorkspaceData }) {
  const appointmentEntries = data.entries.filter((entry) => entry.entry_type === "receivable" && entry.origin === "appointment");
  return (
    <div className="grid gap-5">
      <FinancialPanelHeader title="Cobranças de atendimentos" description="Atendimentos finalizados aparecem aqui para cobrança pela recepção, sem liberar o módulo financeiro inteiro." />
      <PendingEncounterChargesPanel data={data} />
      <EntriesTable entries={appointmentEntries} data={data} entryType="receivable" activeView="charge" />
    </div>
  );
}

function ReceivableSettlePanel({ data }: { data: FinancialWorkspaceData }) {
  const entries = data.entries.filter((entry) => entry.entry_type === "receivable");
  const openEntries = entries.filter((entry) => openEntryCents(entry) > 0 && entry.status !== "cancelled");
  return (
    <div className="grid gap-5">
      <FinancialPanelHeader title="Baixar recebimento" description="Tela focada em recebimentos em aberto, com baixa, recibo e controle de forma de pagamento." />
      <div className="grid gap-3 lg:grid-cols-3">
        <MetricCard label="Em aberto" value={formatCurrencyBRL(openEntries.reduce((sum, entry) => sum + openEntryCents(entry), 0))} description="Saldo a receber" tone="warning" />
        <MetricCard label="Documentos" value={String(openEntries.length)} description="Recebimentos aptos para baixa" />
        <MetricCard label="Recebido" value={formatCurrencyBRL(entries.reduce((sum, entry) => sum + entry.paid_cents, 0))} description="Baixas confirmadas" tone="success" />
      </div>
      <EntriesTable entries={entries} data={data} entryType="receivable" activeView="settle" />
    </div>
  );
}

function ReceivableReversalsPanel({ data }: { data: FinancialWorkspaceData }) {
  const entries = data.entries.filter((entry) => entry.entry_type === "receivable");
  return (
    <div className="grid gap-5">
      <FinancialPanelHeader title="Estornos de recebimentos" description="Recebimentos com baixa revertida, mantendo motivo, data, usuário e histórico financeiro." />
      <EntriesTable entries={entries} data={data} entryType="receivable" activeView="reversals" />
    </div>
  );
}

function ReceivableReceiptsPanel({ data }: { data: FinancialWorkspaceData }) {
  const receipts = data.entries
    .filter((entry) => entry.entry_type === "receivable")
    .flatMap((entry) => entry.receipts.map((receipt) => ({ entry, receipt })));

  return (
    <div className="grid gap-5">
      <FinancialPanelHeader title="Recibos" description="Histórico de recibos e ciências de pagamento emitidos para pacientes." />
      <section className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Emissão</th>
                <th className="px-4 py-3 font-medium">Paciente</th>
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {receipts.length ? receipts.map(({ entry, receipt }) => (
                <tr key={receipt.id} className="border-t">
                  <td className="px-4 py-3">{formatDateTime(receipt.issued_at)}</td>
                  <td className="px-4 py-3">{entry.patient?.social_name || entry.patient?.full_name || "-"}</td>
                  <td className="px-4 py-3">{receipt.title}</td>
                  <td className="px-4 py-3">{receipt.receipt_type === "payment" ? "Recibo" : "Ciência"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => window.open(`/financeiro/recibos/${receipt.id}`, "_blank")}>Abrir</Button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nenhum recibo emitido.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReceivableDelinquencyPanel({ data }: { data: FinancialWorkspaceData }) {
  const entries = data.entries.filter((entry) => entry.entry_type === "receivable" && isOverdue(entry));
  return (
    <div className="grid gap-5">
      <FinancialPanelHeader title="Inadimplência" description="Recebimentos vencidos e ainda em aberto para acompanhamento e cobrança." />
      <EntriesTable entries={entries} data={data} entryType="receivable" activeView="delinquency" />
    </div>
  );
}

function ReceivableReportsPanel({ data }: { data: FinancialWorkspaceData }) {
  const entries = data.entries.filter((entry) => entry.entry_type === "receivable");
  const byHealthPlan = groupPayableReport(entries, (entry) => entry.healthPlan?.name ?? "Particular / não informado");
  const byCategory = groupPayableReport(entries, (entry) => entry.category?.name ?? "Sem categoria");
  return (
    <div className="grid gap-5">
      <FinancialPanelHeader title="Relatórios de recebimentos" description="Indicadores rápidos por convênio, categoria e situação dos recebimentos." />
      <div className="grid gap-3 lg:grid-cols-4">
        <MetricCard label="Total" value={formatCurrencyBRL(entries.reduce((sum, entry) => sum + totalEntryCents(entry), 0))} description="Valor emitido" />
        <MetricCard label="Recebido" value={formatCurrencyBRL(entries.reduce((sum, entry) => sum + entry.paid_cents, 0))} description="Baixas confirmadas" tone="success" />
        <MetricCard label="Em aberto" value={formatCurrencyBRL(entries.reduce((sum, entry) => sum + openEntryCents(entry), 0))} description="Saldo pendente" tone="warning" />
        <MetricCard label="Vencidos" value={String(entries.filter(isOverdue).length)} description="Documentos atrasados" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ReportBreakdown title="Por convênio" rows={byHealthPlan} />
        <ReportBreakdown title="Por categoria" rows={byCategory} />
      </div>
    </div>
  );
}

function PayablesWorkspace({ data, activeView }: { data: FinancialWorkspaceData; activeView: FinancialSubsection }) {
  if (activeView === "vendors") return <PayableVendorsPanel data={data} />;
  if (activeView === "recurring") return <PayableRecurringPanel data={data} />;
  if (activeView === "reports") return <PayableReportsPanel data={data} />;
  if (activeView === "reversals") return <PayableReversalsPanel data={data} />;
  if (activeView === "settle") return <PayableSettlePanel data={data} />;
  return <PayableOpenPanel data={data} activeView={activeView} />;
}

function PayableOpenPanel({ data, activeView }: { data: FinancialWorkspaceData; activeView: FinancialSubsection }) {
  const [creating, setCreating] = useState(false);
  const entries = data.entries.filter((entry) => entry.entry_type === "payable");

  return (
    <div className="grid gap-5">
      <FinancialPanelHeader
        title="Contas a pagar"
        description="Visão completa das despesas, documentos fiscais, vencimentos, centros de custo, fornecedores e status de baixa."
        action={
          <Button disabled={!data.access.canCreate} onClick={() => setCreating(true)}>
            <Plus />
            Novo documento a pagar
          </Button>
        }
      />
      <EntriesTable entries={entries} data={data} entryType="payable" activeView={activeView} />
      <Modal open={creating} onOpenChange={setCreating} title="Novo documento a pagar" description="Registre documento, itens, fornecedor e vencimento." className="max-w-5xl">
        <FinancialEntryForm
          entryType="payable"
          categories={data.categories}
          costCenters={data.costCenters}
          healthPlans={data.healthPlans}
          vendors={data.vendors}
          onCompleted={() => setCreating(false)}
        />
      </Modal>
    </div>
  );
}

function PayableSettlePanel({ data }: { data: FinancialWorkspaceData }) {
  const entries = data.entries.filter((entry) => entry.entry_type === "payable");
  const openEntries = entries.filter((entry) => openEntryCents(entry) > 0 && entry.status !== "cancelled");
  const dueToday = openEntries.filter((entry) => entry.due_date <= new Date().toISOString().slice(0, 10));

  return (
    <div className="grid gap-5">
      <FinancialPanelHeader title="Baixar pagamento" description="Tela operacional focada em documentos em aberto. Use o botão Baixar na linha para registrar pagamento com conta, forma e data." />
      <div className="grid gap-3 lg:grid-cols-3">
        <MetricCard label="Em aberto" value={formatCurrencyBRL(openEntries.reduce((sum, entry) => sum + openEntryCents(entry), 0))} description="Saldo pendente de pagamento" tone="warning" />
        <MetricCard label="Vencidos/hoje" value={String(dueToday.length)} description="Prioridade de caixa" tone={dueToday.length ? "warning" : "default"} />
        <MetricCard label="Documentos" value={String(openEntries.length)} description="Contas aptas para baixa" />
      </div>
      <EntriesTable entries={entries} data={data} entryType="payable" activeView="settle" />
    </div>
  );
}

function PayableReversalsPanel({ data }: { data: FinancialWorkspaceData }) {
  const entries = data.entries.filter((entry) => entry.entry_type === "payable");
  const reversedPayments = entries.flatMap((entry) =>
    entry.payments
      .filter((payment) => payment.status === "reversed")
      .map((payment) => ({ entry, payment })),
  );

  return (
    <div className="grid gap-5">
      <FinancialPanelHeader title="Estornos de pagamentos" description="Histórico de pagamentos estornados e documentos com baixa revertida. Novos estornos são feitos pela linha do lançamento." />
      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <p className="font-medium">Histórico de estornos</p>
          <p className="text-sm text-muted-foreground">Cada estorno preserva motivo, data e vínculo com o lançamento original.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Fornecedor/documento</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {reversedPayments.length ? (
                reversedPayments.map(({ entry, payment }) => (
                  <tr key={payment.id} className="border-t">
                    <td className="px-4 py-3">{formatDateTime(payment.reversed_at ?? payment.paid_at)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{entry.vendor?.name ?? "Fornecedor não informado"}</p>
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrencyBRL(payment.amount_cents)}</td>
                    <td className="px-4 py-3">{payment.reversal_reason ?? "Motivo não informado"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum estorno de pagamento registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <EntriesTable entries={entries} data={data} entryType="payable" activeView="reversals" />
    </div>
  );
}

function PayableVendorsPanel({ data }: { data: FinancialWorkspaceData }) {
  const [selected, setSelected] = useState<FinancialWorkspaceData["vendors"][number] | null>(null);
  const [creating, setCreating] = useState(false);
  const entriesByVendor = useMemo(() => {
    const map = new Map<string, { open: number; paid: number; count: number }>();
    for (const entry of data.entries.filter((item) => item.entry_type === "payable" && item.vendor_id)) {
      const current = map.get(entry.vendor_id!) ?? { open: 0, paid: 0, count: 0 };
      current.open += openEntryCents(entry);
      current.paid += entry.paid_cents;
      current.count += 1;
      map.set(entry.vendor_id!, current);
    }
    return map;
  }, [data.entries]);

  return (
    <div className="grid gap-5">
      <FinancialPanelHeader
        title="Fornecedores"
        description="Gestão de fornecedores conectada ao contas a pagar, com saldos em aberto e histórico de documentos."
        action={
          <Button disabled={!data.access.canManage} onClick={() => setCreating(true)}>
            <Plus />
            Novo fornecedor
          </Button>
        }
      />
      <section className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Fornecedor</th>
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 text-right font-medium">Aberto</th>
                <th className="px-4 py-3 text-right font-medium">Pago</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.vendors.length ? (
                data.vendors.map((vendor) => {
                  const summary = entriesByVendor.get(vendor.id) ?? { open: 0, paid: 0, count: 0 };
                  return (
                    <tr key={vendor.id} className="border-t">
                      <td className="px-4 py-3">
                        <p className="font-medium">{vendor.name}</p>
                        <p className="text-xs text-muted-foreground">{vendor.active ? "Ativo" : "Inativo"} | {summary.count} documento(s)</p>
                      </td>
                      <td className="px-4 py-3">{vendor.document ?? "-"}</td>
                      <td className="px-4 py-3">{vendor.vendor_type}</td>
                      <td className="px-4 py-3 text-right">{formatCurrencyBRL(summary.open)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrencyBRL(summary.paid)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" disabled={!data.access.canManage} onClick={() => setSelected(vendor)}>
                          Editar
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhum fornecedor cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <Modal open={creating} onOpenChange={setCreating} title="Novo fornecedor" className="max-w-4xl">
        <VendorForm onCompleted={() => setCreating(false)} />
      </Modal>
      <Modal open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} title="Editar fornecedor" className="max-w-4xl">
        {selected ? <VendorForm vendor={selected} onCompleted={() => setSelected(null)} /> : null}
      </Modal>
    </div>
  );
}

function PayableRecurringPanel({ data }: { data: FinancialWorkspaceData }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FinancialWorkspaceData["recurringEntries"][number] | null>(null);
  const [generating, setGenerating] = useState<FinancialWorkspaceData["recurringEntries"][number] | null>(null);
  const active = data.recurringEntries.filter((item) => item.active);
  const monthlyEstimate = active
    .filter((item) => item.frequency === "monthly")
    .reduce((sum, item) => sum + item.amount_cents, 0);

  return (
    <div className="grid gap-5">
      <FinancialPanelHeader
        title="Pagamentos recorrentes"
        description="Cadastre despesas previsíveis como aluguel, sistemas, contratos, impostos e manutenção. A geração automática será habilitada em etapa controlada."
        action={
          <Button disabled={!data.access.canManage} onClick={() => setCreating(true)}>
            <Plus />
            Nova recorrência
          </Button>
        }
      />
      <div className="grid gap-3 lg:grid-cols-3">
        <MetricCard label="Recorrências ativas" value={String(active.length)} description="Despesas previsíveis monitoradas" />
        <MetricCard label="Estimativa mensal" value={formatCurrencyBRL(monthlyEstimate)} description="Somente regras mensais ativas" />
        <MetricCard label="Próximo vencimento" value={data.recurringEntries[0] ? formatDate(data.recurringEntries[0].next_due_date) : "-"} description="Regra mais próxima" />
      </div>
      <section className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Fornecedor</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Frequência</th>
                <th className="px-4 py-3 font-medium">Próximo vencimento</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                <th className="px-4 py-3 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.recurringEntries.length ? (
                data.recurringEntries.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground">{item.active ? "Ativa" : "Inativa"}</p>
                    </td>
                    <td className="px-4 py-3">{item.vendor?.name ?? "-"}</td>
                    <td className="px-4 py-3">{item.category?.name ?? "Sem categoria"}</td>
                    <td className="px-4 py-3">{frequencyLabel(item.frequency)}</td>
                    <td className="px-4 py-3">{formatDate(item.next_due_date)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrencyBRL(item.amount_cents)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={!data.access.canCreate || !item.active} onClick={() => setGenerating(item)}>
                          Gerar conta
                        </Button>
                        <Button size="sm" variant="outline" disabled={!data.access.canManage} onClick={() => setEditing(item)}>
                          Editar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhuma recorrência cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <Modal open={creating} onOpenChange={setCreating} title="Nova recorrência" className="max-w-4xl">
        <FinancialRecurringEntryForm vendors={data.vendors} categories={data.categories} costCenters={data.costCenters} onCompleted={() => setCreating(false)} />
      </Modal>
      <Modal open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} title="Editar recorrência" className="max-w-4xl">
        {editing ? (
          <FinancialRecurringEntryForm
            recurringEntry={editing}
            vendors={data.vendors}
            categories={data.categories}
            costCenters={data.costCenters}
            onCompleted={() => setEditing(null)}
          />
        ) : null}
      </Modal>
      <Modal open={Boolean(generating)} onOpenChange={(open) => !open && setGenerating(null)} title="Gerar conta a pagar" description={generating?.description} className="max-w-3xl">
        {generating ? <GenerateRecurringPayableForm recurringEntry={generating} onCompleted={() => setGenerating(null)} /> : null}
      </Modal>
    </div>
  );
}

function PayableReportsPanel({ data }: { data: FinancialWorkspaceData }) {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [vendorId, setVendorId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [costCenterId, setCostCenterId] = useState("all");
  useEffect(() => {
    const raw = localStorage.getItem("payable-report-filters");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Partial<{ dateFrom: string; dateTo: string; vendorId: string; categoryId: string; costCenterId: string }>;
      setDateFrom(saved.dateFrom ?? "");
      setDateTo(saved.dateTo ?? "");
      setVendorId(saved.vendorId ?? "all");
      setCategoryId(saved.categoryId ?? "all");
      setCostCenterId(saved.costCenterId ?? "all");
    } catch {
      localStorage.removeItem("payable-report-filters");
    }
  }, []);
  const entries = useMemo(
    () =>
      data.entries
        .filter((entry) => entry.entry_type === "payable")
        .filter((entry) => {
          if (dateFrom && entry.due_date < dateFrom) return false;
          if (dateTo && entry.due_date > dateTo) return false;
          if (vendorId !== "all" && entry.vendor_id !== vendorId) return false;
          if (categoryId !== "all" && entry.category_id !== categoryId) return false;
          if (costCenterId !== "all" && entry.cost_center_id !== costCenterId) return false;
          return true;
        }),
    [categoryId, costCenterId, data.entries, dateFrom, dateTo, vendorId],
  );
  const total = entries.reduce((sum, entry) => sum + totalEntryCents(entry), 0);
  const open = entries.reduce((sum, entry) => sum + openEntryCents(entry), 0);
  const paid = entries.reduce((sum, entry) => sum + entry.paid_cents, 0);
  const freight = entries.reduce((sum, entry) => sum + (entry.freight_cents ?? 0), 0);
  const itemCount = entries.reduce((sum, entry) => sum + entry.items.length, 0);
  const byCategory = groupPayableReport(entries, (entry) => entry.category?.name ?? "Sem categoria");
  const byVendor = groupPayableReport(entries, (entry) => entry.vendor?.name ?? "Fornecedor não informado");

  function saveFilters() {
    localStorage.setItem("payable-report-filters", JSON.stringify({ dateFrom, dateTo, vendorId, categoryId, costCenterId }));
    toast({ title: "Financeiro", description: "Filtro de relatório salvo." });
  }

  function exportCsv() {
    const rows = entries.map((entry) => [
      documentTypeLabel(entry.document_type),
      entry.document_number ?? "",
      entry.description,
      entry.vendor?.name ?? "",
      entry.category?.name ?? "",
      entry.costCenter?.name ?? "",
      entry.due_date,
      entry.items.length,
      (entry.freight_cents ?? 0) / 100,
      totalEntryCents(entry) / 100,
      statusLabels[entry.status] ?? entry.status,
    ]);
    const header = ["Tipo", "Documento", "Descrição", "Fornecedor", "Categoria", "Centro de custo", "Vencimento", "Itens", "Frete", "Total", "Status"];
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pagamentos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "Financeiro", description: "Relatório CSV gerado." });
  }

  function printReport() {
    const html = buildPayableReportHtml(entries);
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
    toast({ title: "Financeiro", description: "Relatório aberto para impressão/PDF." });
  }

  return (
    <div className="grid gap-5">
      <FinancialPanelHeader title="Relatórios de pagamentos" description="Análise de despesas por período, fornecedor, categoria, centro de custo, documento e itens lançados." />
      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <div className="grid gap-3 xl:grid-cols-5">
          <FilterDate label="Data inicial" value={dateFrom} onChange={setDateFrom} />
          <FilterDate label="Data final" value={dateTo} onChange={setDateTo} />
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Fornecedor
            <Select value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
              <option value="all">Todos</option>
              {data.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Categoria
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="all">Todas</option>
              {data.categories.filter((category) => category.direction === "expense").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Centro de custo
            <Select value={costCenterId} onChange={(event) => setCostCenterId(event.target.value)}>
              <option value="all">Todos</option>
              {data.costCenters.map((costCenter) => <option key={costCenter.id} value={costCenter.id}>{costCenter.name}</option>)}
            </Select>
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={saveFilters}>Salvar filtro</Button>
          <Button variant="outline" onClick={exportCsv}>Exportar CSV</Button>
          <Button onClick={printReport}>Imprimir/PDF</Button>
        </div>
      </section>
      <div className="grid gap-3 xl:grid-cols-5">
        <MetricCard label="Total" value={formatCurrencyBRL(total)} description="Subtotal - desconto + frete + acréscimos" />
        <MetricCard label="Em aberto" value={formatCurrencyBRL(open)} description="A pagar no filtro" tone={open ? "warning" : "default"} />
        <MetricCard label="Pago" value={formatCurrencyBRL(paid)} description="Baixas confirmadas" tone="success" />
        <MetricCard label="Frete" value={formatCurrencyBRL(freight)} description="Frete lançado nos documentos" />
        <MetricCard label="Itens" value={String(itemCount)} description="Itens fiscais/documentais" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ReportBreakdown title="Por categoria" rows={byCategory} />
        <ReportBreakdown title="Por fornecedor" rows={byVendor} />
      </div>
      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <p className="font-medium">Documentos filtrados</p>
          <p className="text-sm text-muted-foreground">Base para conferência antes de exportações futuras.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Fornecedor</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 text-right font-medium">Itens</th>
                <th className="px-4 py-3 text-right font-medium">Frete</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.length ? (
                entries.slice(0, 120).map((entry) => (
                  <tr key={entry.id} className="border-t">
                    <td className="px-4 py-3">
                      <p className="font-medium">{documentTypeLabel(entry.document_type)} {entry.document_number ? `• ${entry.document_number}` : ""}</p>
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                    </td>
                    <td className="px-4 py-3">{entry.vendor?.name ?? "-"}</td>
                    <td className="px-4 py-3">{entry.category?.name ?? "Sem categoria"}</td>
                    <td className="px-4 py-3">{formatDate(entry.due_date)}</td>
                    <td className="px-4 py-3 text-right">{entry.items.length}</td>
                    <td className="px-4 py-3 text-right">{formatCurrencyBRL(entry.freight_cents ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrencyBRL(totalEntryCents(entry))}</td>
                    <td className="px-4 py-3">{statusLabels[entry.status] ?? entry.status}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Nenhum documento encontrado nos filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FilterDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function groupPayableReport(entries: FinancialEntryWithRelations[], getKey: (entry: FinancialEntryWithRelations) => string) {
  const map = new Map<string, { label: string; total: number; open: number; count: number }>();
  for (const entry of entries) {
    const label = getKey(entry);
    const current = map.get(label) ?? { label, total: 0, open: 0, count: 0 };
    current.total += totalEntryCents(entry);
    current.open += openEntryCents(entry);
    current.count += 1;
    map.set(label, current);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10);
}

function ReportBreakdown({ title, rows }: { title: string; rows: Array<{ label: string; total: number; open: number; count: number }> }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <p className="font-medium">{title}</p>
      <div className="mt-3 grid gap-2">
        {rows.length ? rows.map((row) => (
          <div key={row.label} className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-sm font-medium">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.count} documento(s) | aberto {formatCurrencyBRL(row.open)}</p>
            </div>
            <p className="font-medium">{formatCurrencyBRL(row.total)}</p>
          </div>
        )) : <p className="text-sm text-muted-foreground">Sem dados para os filtros atuais.</p>}
      </div>
    </section>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildPayableReportHtml(entries: FinancialEntryWithRelations[]) {
  const rows = entries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(documentTypeLabel(entry.document_type))}</td>
          <td>${escapeHtml(entry.document_number ?? "-")}</td>
          <td>${escapeHtml(entry.description)}</td>
          <td>${escapeHtml(entry.vendor?.name ?? "-")}</td>
          <td>${escapeHtml(entry.category?.name ?? "Sem categoria")}</td>
          <td>${escapeHtml(formatDate(entry.due_date))}</td>
          <td class="right">${entry.items.length}</td>
          <td class="right">${escapeHtml(formatCurrencyBRL(entry.freight_cents ?? 0))}</td>
          <td class="right">${escapeHtml(formatCurrencyBRL(totalEntryCents(entry)))}</td>
          <td>${escapeHtml(statusLabels[entry.status] ?? entry.status)}</td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Relatório de pagamentos</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 28px; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          p { color: #6b7280; margin: 0 0 18px; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { text-align: left; background: #f3f4f6; color: #4b5563; padding: 8px; text-transform: uppercase; }
          td { border-top: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
          .right { text-align: right; }
        </style>
      </head>
      <body>
        <h1>Relatório de pagamentos</h1>
        <p>Gerado em ${escapeHtml(formatDateTime(new Date().toISOString()))}</p>
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Documento</th>
              <th>Descrição</th>
              <th>Fornecedor</th>
              <th>Categoria</th>
              <th>Vencimento</th>
              <th class="right">Itens</th>
              <th class="right">Frete</th>
              <th class="right">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="10">Nenhum registro encontrado.</td></tr>'}</tbody>
        </table>
      </body>
    </html>`;
}

function RegistriesPanel({ data, activeView }: { data: FinancialWorkspaceData; activeView: FinancialSubsection }) {
  const [modal, setModal] = useState<{ type: "account" | "method" | "machine" | "vendor" | "category" | "cost-center" | "health-plan"; item?: unknown } | null>(null);

  return (
    <div className="grid gap-5">
      <header className="border-b pb-4">
        <h2 className="font-semibold">Cadastros financeiros</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Contas, caixas, formas de pagamento, máquinas, categorias, centros de custo, fornecedores e convênios.
        </p>
      </header>
      <div className="grid gap-4 xl:grid-cols-7">
        <RegistryCard icon={Landmark} title="Contas" count={data.accounts.length} onClick={() => setModal({ type: "account" })} disabled={!data.access.canManage} />
        <RegistryCard icon={Banknote} title="Formas" count={data.paymentMethods.length} onClick={() => setModal({ type: "method" })} disabled={!data.access.canManage} />
        <RegistryCard icon={CreditCard} title="Máquinas" count={data.cardMachines.length} onClick={() => setModal({ type: "machine" })} disabled={!data.access.canManage} />
        <RegistryCard icon={Tags} title="Categorias" count={data.categories.length} onClick={() => setModal({ type: "category" })} disabled={!data.access.canManage} />
        <RegistryCard icon={Building2} title="Centros" count={data.costCenters.length} onClick={() => setModal({ type: "cost-center" })} disabled={!data.access.canManage} />
        <RegistryCard icon={Truck} title="Fornecedores" count={data.vendors.length} onClick={() => setModal({ type: "vendor" })} disabled={!data.access.canManage} />
        <RegistryCard icon={Building2} title="Convênios" count={data.healthPlans.length} onClick={() => setModal({ type: "health-plan" })} disabled={!data.access.canManage} />
      </div>
      <RegistryLists data={data} activeView={activeView} onEdit={(type, item) => setModal({ type, item })} />

      <Modal open={modal?.type === "account"} onOpenChange={(open) => !open && setModal(null)} title={modal?.item ? "Editar conta financeira" : "Nova conta financeira"} className="max-w-4xl">
        <FinancialAccountForm account={modal?.type === "account" ? (modal.item as FinancialWorkspaceData["accounts"][number] | undefined) : undefined} onCompleted={() => setModal(null)} />
      </Modal>
      <Modal open={modal?.type === "method"} onOpenChange={(open) => !open && setModal(null)} title={modal?.item ? "Editar forma de pagamento" : "Nova forma de pagamento"} className="max-w-3xl">
        <PaymentMethodForm method={modal?.type === "method" ? (modal.item as FinancialWorkspaceData["paymentMethods"][number] | undefined) : undefined} onCompleted={() => setModal(null)} />
      </Modal>
      <Modal open={modal?.type === "machine"} onOpenChange={(open) => !open && setModal(null)} title={modal?.item ? "Editar máquina de cartão" : "Nova máquina de cartão"} className="max-w-4xl">
        <CardMachineForm machine={modal?.type === "machine" ? (modal.item as FinancialWorkspaceData["cardMachines"][number] | undefined) : undefined} accounts={data.accounts} onCompleted={() => setModal(null)} />
      </Modal>
      <Modal open={modal?.type === "vendor"} onOpenChange={(open) => !open && setModal(null)} title={modal?.item ? "Editar fornecedor" : "Novo fornecedor"} className="max-w-4xl">
        <VendorForm vendor={modal?.type === "vendor" ? (modal.item as FinancialWorkspaceData["vendors"][number] | undefined) : undefined} onCompleted={() => setModal(null)} />
      </Modal>
      <Modal open={modal?.type === "category"} onOpenChange={(open) => !open && setModal(null)} title={modal?.item ? "Editar categoria" : "Nova categoria"} className="max-w-3xl">
        <FinancialCategoryForm category={modal?.type === "category" ? (modal.item as FinancialWorkspaceData["categories"][number] | undefined) : undefined} categories={data.categories} onCompleted={() => setModal(null)} />
      </Modal>
      <Modal open={modal?.type === "cost-center"} onOpenChange={(open) => !open && setModal(null)} title={modal?.item ? "Editar centro de custo" : "Novo centro de custo"} className="max-w-3xl">
        <CostCenterForm costCenter={modal?.type === "cost-center" ? (modal.item as FinancialWorkspaceData["costCenters"][number] | undefined) : undefined} onCompleted={() => setModal(null)} />
      </Modal>
      <Modal open={modal?.type === "health-plan"} onOpenChange={(open) => !open && setModal(null)} title={modal?.item ? "Editar convênio" : "Novo convênio"} className="max-w-3xl">
        <HealthPlanForm healthPlan={modal?.type === "health-plan" ? (modal.item as FinancialWorkspaceData["healthPlans"][number] | undefined) : undefined} onCompleted={() => setModal(null)} />
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

type RegistryModalType = "account" | "method" | "machine" | "vendor" | "category" | "cost-center" | "health-plan";

function RegistryLists({
  data,
  activeView,
  onEdit,
}: {
  data: FinancialWorkspaceData;
  activeView: FinancialSubsection;
  onEdit: (type: RegistryModalType, item: unknown) => void;
}) {
  const lists = [
    {
      key: "accounts",
      element: <RegistryList title="Contas e caixas" rows={data.accounts.map((item) => ({ id: item.id, title: item.name, detail: `${formatCurrencyBRL(item.current_balance_cents)} | ${item.active ? "Ativa" : "Inativa"}`, onEdit: () => onEdit("account", item) }))} />,
    },
    {
      key: "payment-methods",
      element: <RegistryList title="Formas de pagamento" rows={data.paymentMethods.map((item) => ({ id: item.id, title: item.name, detail: `${item.method_type} | ${item.settlement_days} dia(s)`, onEdit: () => onEdit("method", item) }))} />,
    },
    {
      key: "card-machines",
      element: <RegistryList title="Máquinas de cartão" rows={data.cardMachines.map((item) => ({ id: item.id, title: item.name, detail: `Débito ${item.debit_fee_bps / 100}% | Crédito ${item.credit_fee_bps / 100}%`, onEdit: () => onEdit("machine", item) }))} />,
    },
    {
      key: "categories",
      element: <RegistryList title="Categorias" rows={data.categories.map((item) => ({ id: item.id, title: item.name, detail: `${item.direction === "income" ? "Receita" : "Despesa"} | ${item.active ? "Ativa" : "Inativa"}`, onEdit: () => onEdit("category", item) }))} />,
    },
    {
      key: "cost-centers",
      element: <RegistryList title="Centros de custo" rows={data.costCenters.map((item) => ({ id: item.id, title: item.name, detail: `${item.code ?? "Sem código"} | ${item.active ? "Ativo" : "Inativo"}`, onEdit: () => onEdit("cost-center", item) }))} />,
    },
    {
      key: "vendors",
      element: <RegistryList title="Fornecedores" rows={data.vendors.map((item) => ({ id: item.id, title: item.name, detail: `${item.vendor_type} | ${item.active ? "Ativo" : "Inativo"}`, onEdit: () => onEdit("vendor", item) }))} />,
    },
    {
      key: "health-plans",
      element: <RegistryList title="Convênios" rows={data.healthPlans.map((item) => ({ id: item.id, title: item.name, detail: `${item.document ?? "Sem CNPJ"} | ${item.active ? "Ativo" : "Inativo"}`, onEdit: () => onEdit("health-plan", item) }))} />,
    },
  ];
  const visible = lists.filter((item) => item.key === activeView);
  const currentLists = visible.length ? visible : lists.slice(0, 1);

  return <div className="grid gap-4 xl:grid-cols-2">{currentLists.map((item) => <div key={item.key}>{item.element}</div>)}</div>;
}

function RegistryList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: string; title: string; detail: string; onEdit: () => void }>;
}) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <p className="font-medium">{title}</p>
        <span className="text-xs text-muted-foreground">{rows.length} registro(s)</span>
      </div>
      <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.id} className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{row.detail}</p>
              </div>
              <Button size="sm" variant="outline" onClick={row.onEdit}>
                Editar
              </Button>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nenhum registro cadastrado.</p>
        )}
      </div>
    </section>
  );
}

type ReconciliationRange = "today" | "week" | "month";

type MovementRow = {
  entry: FinancialEntryWithRelations;
  payment: FinancialPayment;
  account: FinancialWorkspaceData["accounts"][number] | null;
  reconciliation: FinancialWorkspaceData["reconciliations"][number] | null;
};

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

function rangeLabel(range: ReconciliationRange) {
  if (range === "today") return "Hoje";
  if (range === "week") return "Semana";
  return "Mês";
}

function ReconciliationPanel({ data, activeView }: { data: FinancialWorkspaceData; activeView: FinancialSubsection }) {
  const { toast } = useToast();
  const [range, setRange] = useState<ReconciliationRange>("week");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reversing, setReversing] = useState<(typeof data.reconciliations)[number] | null>(null);
  const [detailing, setDetailing] = useState<(typeof data.reconciliations)[number] | null>(null);
  const [statementAccountId, setStatementAccountId] = useState<string | null>(null);
  const [checkedMovementIds, setCheckedMovementIds] = useState<string[]>([]);
  const [importingStatement, setImportingStatement] = useState(false);
  const [reviewingImportId, setReviewingImportId] = useState<string | null>(null);
  const [deletingImportId, setDeletingImportId] = useState<string | null>(null);
  const accountMap = useMemo(() => new Map(data.accounts.map((account) => [account.id, account])), [data.accounts]);
  const reconciliationMap = useMemo(
    () => new Map(data.reconciliations.map((item) => [item.id, item])),
    [data.reconciliations],
  );
  const activeAccountIds = useMemo(
    () => selectedAccounts.length ? selectedAccounts : data.accounts.map((account) => account.id),
    [data.accounts, selectedAccounts],
  );
  const rangeStart = useMemo(() => getRangeStart(range), [range]);
  const rangeEnd = useMemo(() => {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date;
  }, []);

  const rows = useMemo<MovementRow[]>(
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
          if (Number.isNaN(paidAt.getTime())) return false;
          return paidAt >= rangeStart && paidAt <= rangeEnd;
        })
        .sort((a, b) => (new Date(b.payment.paid_at).getTime() || 0) - (new Date(a.payment.paid_at).getTime() || 0)),
    [accountMap, activeAccountIds, data.entries, rangeEnd, rangeStart, reconciliationMap],
  );

  const pendingRows = rows.filter(({ payment }) => !payment.reconciliation_id);
  const checkedPendingCount = pendingRows.filter(({ payment }) => checkedMovementIds.includes(payment.id)).length;
  const selectedPendingRows = pendingRows.filter(({ payment }) => checkedMovementIds.includes(payment.id));
  const selectedAccountId = selectedPendingRows[0]?.payment.account_id ?? undefined;
  const totalIn = rows.filter(({ payment }) => payment.direction === "in").reduce((sum, row) => sum + row.payment.net_amount_cents, 0);
  const totalOut = rows.filter(({ payment }) => payment.direction === "out").reduce((sum, row) => sum + row.payment.net_amount_cents, 0);
  const accountSummary = activeAccountIds.length === data.accounts.length ? "Todas as contas" : activeAccountIds.length + " conta(s)";
  const statementAccount = statementAccountId ? accountMap.get(statementAccountId) ?? null : null;
  const statementRows = statementAccountId ? rows.filter(({ payment }) => payment.account_id === statementAccountId) : [];
  const reviewingImport = reviewingImportId ? data.bankImports.find((item) => item.id === reviewingImportId) ?? null : null;
  const deletingImport = deletingImportId ? data.bankImports.find((item) => item.id === deletingImportId) ?? null : null;

  function toggleMovement(paymentId: string) {
    const row = pendingRows.find(({ payment }) => payment.id === paymentId);
    if (!row) return;
    const currentAccount = selectedPendingRows[0]?.payment.account_id;
    if (!checkedMovementIds.includes(paymentId) && currentAccount && row.payment.account_id !== currentAccount) {
      toast({ title: "Conciliação por conta", description: "Selecione movimentos de uma única conta por fechamento." });
      return;
    }
    setCheckedMovementIds((current) => current.includes(paymentId) ? current.filter((id) => id !== paymentId) : [...current, paymentId]);
  }
  const viewCopy =
    activeView === "statements"
      ? { title: "Extratos por conta", description: "Consulte movimentos por conta, período, entrada, saída e status de conciliação." }
      : activeView === "close-period"
        ? { title: "Conciliação individual", description: "Confira e marque somente os movimentos que constam no extrato da conta." }
        : activeView === "pending"
          ? { title: "Movimentos pendentes", description: "Itens confirmados que ainda precisam ser conferidos antes do fechamento bancário." }
          : activeView === "history"
            ? { title: "Histórico de conciliações", description: "Fechamentos por conta, período, responsável, status e reaberturas auditadas." }
            : activeView === "divergences"
              ? { title: "Divergências de conciliação", description: "Compare saldo esperado, saldo informado e diferenças antes de encerrar o período." }
              : activeView === "imports"
                ? { title: "Importações bancárias", description: "Importe OFX ou CSV, revise correspondências automáticas e trate divergências antes do fechamento." }
                : activeView === "monthly-close"
                  ? { title: "Fechamento mensal", description: "Valide pendências, consolide os resultados e proteja o período contra alterações posteriores." }
                  : activeView === "dre"
                    ? { title: "DRE gerencial", description: "Receitas, despesas e resultado por competência, categoria e clínica." }
                    : { title: "Relatórios de conciliação", description: "Visão consolidada dos movimentos conciliados, pendentes e reabertos." };

  useEffect(() => {
    const visibleIds = new Set(rows.map(({ payment }) => payment.id));
    setCheckedMovementIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
    });
  }, [rows]);

  const showFilters = ["statements", "close-period", "pending"].includes(activeView);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="font-semibold">{viewCopy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {viewCopy.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeView === "imports" ? <Button disabled={!data.access.canManage} onClick={() => setImportingStatement(true)}><Upload />Importar extrato</Button> : null}
          {activeView === "statements" || activeView === "pending" ? <Button variant="outline" onClick={() => setReportOpen(true)}><FileText />Gerar relatório</Button> : null}
          {activeView === "close-period" ? <Button disabled={!data.access.canManage || data.accounts.length === 0 || checkedPendingCount === 0} onClick={() => setCreating(true)}><BarChart3 />Conciliar selecionados</Button> : null}
        </div>
      </header>

      {showFilters ? <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <div>
          <p className="font-medium">Filtros rápidos</p>
          <p className="text-sm text-muted-foreground">{rangeLabel(range)} | {accountSummary}</p>
        </div>
        <Button variant="outline" onClick={() => setFiltersOpen(true)}><SlidersHorizontal />Selecionar contas e período</Button>
      </section> : null}

      {activeView === "statements" || activeView === "close-period" || activeView === "pending" ? <div className="grid gap-3 xl:grid-cols-4">
        <MetricCard label="Entradas no filtro" value={formatCurrencyBRL(totalIn)} description="Recebimentos confirmados" tone="success" />
        <MetricCard label="Saídas no filtro" value={formatCurrencyBRL(totalOut)} description="Pagamentos confirmados" />
        <MetricCard label="Movimentos pendentes" value={String(pendingRows.length)} description="Ainda sem conciliação" tone={pendingRows.length ? "warning" : "default"} />
        <MetricCard label="Saldo líquido" value={formatCurrencyBRL(totalIn - totalOut)} description="Entradas menos saídas do período" />
      </div> : null}

      {activeView === "statements" ? <div className="grid gap-3 lg:grid-cols-3">
        {data.accounts.filter((account) => activeAccountIds.includes(account.id)).map((account) => {
          const accountRows = rows.filter(({ payment }) => payment.account_id === account.id);
          const periodNet = accountRows.reduce((sum, row) => sum + (row.payment.direction === "in" ? row.payment.net_amount_cents : -row.payment.net_amount_cents), 0);
          const pendingCount = accountRows.filter(({ payment }) => !payment.reconciliation_id).length;
          return (
            <div key={account.id} className="rounded-lg border bg-card p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{account.name}</p>
                  <p className="mt-2 text-xl font-semibold tabular-nums">{formatCurrencyBRL(account.current_balance_cents)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setStatementAccountId(account.id)}>
                  <Eye />
                  Extrato
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Movimento no filtro: {formatCurrencyBRL(periodNet)}</p>
              <p className={pendingCount ? "mt-2 text-xs font-medium text-amber-700" : "mt-2 text-xs text-muted-foreground"}>
                {pendingCount ? `${pendingCount} movimento(s) aguardando conciliação` : "Sem pendências no período"}
              </p>
            </div>
          );
        })}
      </div> : null}

      {activeView === "close-period" && pendingRows.length ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
          <p className="font-medium">Conferência pendente</p>
          <p className="mt-1">
            Existem movimentos confirmados no período que ainda não foram conciliados. Antes de fechar, confira o extrato da conta
            e compare com o saldo bancário em mãos.
          </p>
          <p className="mt-2 font-medium">
            {checkedPendingCount} de {pendingRows.length} movimento(s) pendente(s) conferido(s).
          </p>
        </section>
      ) : null}

      {activeView === "statements" ? <MovementTable rows={rows} /> : null}
      {activeView === "close-period" ? <MovementTable rows={pendingRows} checkable checkedIds={checkedMovementIds} onToggle={toggleMovement} /> : null}
      {activeView === "pending" ? <MovementTable rows={pendingRows} /> : null}

      {activeView === "imports" ? <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3 border-b pb-3">
          <div><p className="font-medium">Importações bancárias</p><p className="text-sm text-muted-foreground">OFX/CSV com correspondência automática por conta, data, natureza e valor.</p></div>
          <Button size="sm" variant="outline" disabled={!data.access.canManage} onClick={() => setImportingStatement(true)}><Upload />Nova importação</Button>
        </div>
        <div className="mt-3 grid gap-2">
          {data.bankImports.length ? data.bankImports.slice(0, 8).map((item) => (
            <article key={item.id} className="grid gap-3 rounded-md border bg-background p-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{item.file_name}</p><Badge className={item.status === "completed" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}>{item.status === "completed" ? "Revisado" : "Em revisão"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{item.account?.name ?? "Conta"} | {item.total_rows} movimentos | {item.matched_rows} correspondências | {formatDate(item.period_start)} a {formatDate(item.period_end)}</p></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setReviewingImportId(item.id)}><Eye />Revisar</Button><Button size="icon" variant="ghost" title="Excluir importação" disabled={!data.access.canManage} onClick={() => setDeletingImportId(item.id)}><Trash2 /></Button></div>
            </article>
          )) : <EmptyState title="Nenhum extrato importado" description="Importe OFX ou CSV para comparar o banco com os movimentos do sistema." />}
        </div>
      </section> : null}

      {activeView === "divergences" ? <BankDivergencesPanel imports={data.bankImports} onReview={setReviewingImportId} /> : null}

      {activeView === "monthly-close" ? <MonthlyClosingPanel data={data} /> : null}

      {activeView === "dre" ? <FinancialDrePanel data={data} /> : null}

      {activeView === "history" ? <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3 border-b pb-3"><div><p className="font-medium">Histórico de conciliações</p><p className="text-sm text-muted-foreground">Fechamentos por período, conta, responsável e status.</p></div></div>
        <div className="mt-3 grid gap-2">
          {data.reconciliations.length ? data.reconciliations.slice(0, 12).map((reconciliation) => (
            <article key={reconciliation.id} className="grid gap-3 rounded-md border bg-background p-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{reconciliation.account?.name ?? "Conta"}</p><Badge className={reconciliation.status === "closed" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}>{reconciliation.status === "closed" ? "Fechada" : "Reaberta"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{formatDate(reconciliation.period_start)} até {formatDate(reconciliation.period_end)} | saldo {formatCurrencyBRL(reconciliation.bank_balance_cents)}{" | "}fechada por {reconciliation.closed_by_profile?.full_name ?? "usuário não identificado"}</p></div>
              <div className="flex flex-wrap gap-2 lg:justify-end"><Button size="sm" variant="outline" onClick={() => setDetailing(reconciliation)}><Eye />Detalhar</Button><Button size="sm" variant="outline" disabled={reconciliation.status !== "closed" || !data.access.canApprove} onClick={() => setReversing(reconciliation)}><RotateCcw />Reabrir</Button></div>
            </article>
          )) : <EmptyState title="Nenhuma conciliação fechada" description="Feche uma conciliação bancária para travar os movimentos conferidos." />}
        </div>
      </section> : null}

      <Modal open={filtersOpen} onOpenChange={setFiltersOpen} title="Filtros rápidos" className="max-w-2xl"><QuickReconciliationFilters accounts={data.accounts} range={range} selectedAccounts={selectedAccounts} onApply={(nextRange, nextAccounts) => { setRange(nextRange); setSelectedAccounts(nextAccounts); setFiltersOpen(false); }} /></Modal>
      <Modal open={creating} onOpenChange={setCreating} title="Fechar conciliação bancária" description="Somente os movimentos marcados serão travados neste fechamento." className="max-w-4xl"><ReconciliationForm accounts={selectedAccountId ? data.accounts.filter((item) => item.id === selectedAccountId) : data.accounts} paymentIds={checkedMovementIds} defaultAccountId={selectedAccountId} onCompleted={() => { setCreating(false); setCheckedMovementIds([]); }} /></Modal>
      <Modal open={reportOpen} onOpenChange={setReportOpen} title="Relatório de movimentos" className="max-w-4xl"><MovementReportForm accounts={data.accounts} onCompleted={() => setReportOpen(false)} /></Modal>
      <Modal open={importingStatement} onOpenChange={setImportingStatement} title="Importar extrato bancário" description="O arquivo é analisado no servidor e não fica armazenado; apenas os movimentos estruturados são registrados." className="max-w-2xl"><BankStatementImportForm accounts={data.accounts} onCompleted={() => setImportingStatement(false)} /></Modal>
      <Modal open={Boolean(statementAccountId)} onOpenChange={(open) => { if (!open) setStatementAccountId(null); }} title={statementAccount ? `Extrato - ${statementAccount.name}` : "Extrato da conta"} description="Movimentos do período filtrado, com status de conciliação." className="max-w-[min(1180px,calc(100vw-3rem))]"><MovementTable rows={statementRows} compact scrollable /></Modal>
      <Modal open={Boolean(reviewingImport)} onOpenChange={(open) => { if (!open) setReviewingImportId(null); }} title={reviewingImport ? `Revisão - ${reviewingImport.file_name}` : "Revisão do extrato"} description="Correspondências são sugestões automáticas; movimentos pendentes podem ser lançamentos ausentes ou divergências." className="max-w-[min(1100px,calc(100vw-3rem))]">{reviewingImport ? <BankImportReview data={reviewingImport} canApprove={data.access.canApprove} onCompleted={() => setReviewingImportId(null)} /> : null}</Modal>
      <Modal open={Boolean(deletingImport)} onOpenChange={(open) => { if (!open) setDeletingImportId(null); }} title="Excluir importação bancária" description="A exclusão não remove lançamentos financeiros existentes." className="max-w-lg">{deletingImport ? <DeleteBankImportForm bankImport={deletingImport} onCompleted={() => setDeletingImportId(null)} /> : null}</Modal>
      <Modal open={Boolean(detailing)} onOpenChange={(open) => { if (!open) setDetailing(null); }} title="Detalhes da conciliação" description="Resumo somente para consulta. Nenhum dado pode ser alterado aqui." className="max-w-5xl">{detailing ? <ReconciliationDetail reconciliation={detailing} rows={rows.filter(({ payment }) => payment.reconciliation_id === detailing.id)} /> : null}</Modal>
      <Modal open={Boolean(reversing)} onOpenChange={(open) => { if (!open) setReversing(null); }} title="Reabrir conciliação" description="Use somente para correção auditada de movimentos já conferidos." className="max-w-lg">{reversing ? <ReverseReconciliationForm reconciliation={reversing} onCompleted={() => setReversing(null)} /> : null}</Modal>
    </div>
  );
}

type EntryStatusFilter = "all" | "open" | "paid" | "overdue" | "partial" | "with_reversals" | "reconciled";
type EntrySort = "due_asc" | "due_desc" | "amount_desc" | "amount_asc" | "updated_desc";

function defaultStatusFilter(activeView: FinancialSubsection): EntryStatusFilter {
  if (activeView === "settle" || activeView === "open" || activeView === "delinquency") return "open";
  if (activeView === "reversals") return "with_reversals";
  return "all";
}

function isOverdue(entry: FinancialEntryWithRelations) {
  return entry.status !== "paid" && entry.due_date < new Date().toISOString().slice(0, 10);
}

function entryHasReversal(entry: FinancialEntryWithRelations) {
  return entry.payments.some((payment) => payment.status === "reversed");
}

function entryHasReconciliation(entry: FinancialEntryWithRelations) {
  return entry.payments.some((payment) => Boolean(payment.reconciliation_id));
}

function matchesEntryStatus(entry: FinancialEntryWithRelations, filter: EntryStatusFilter) {
  if (filter === "all") return true;
  if (filter === "open") return openEntryCents(entry) > 0 && entry.status !== "cancelled";
  if (filter === "paid") return entry.status === "paid";
  if (filter === "partial") return entry.status === "partial";
  if (filter === "overdue") return isOverdue(entry);
  if (filter === "with_reversals") return entryHasReversal(entry);
  if (filter === "reconciled") return entryHasReconciliation(entry);
  return true;
}

function sortEntries(entries: FinancialEntryWithRelations[], sort: EntrySort) {
  return [...entries].sort((a, b) => {
    if (sort === "due_desc") return b.due_date.localeCompare(a.due_date);
    if (sort === "amount_desc") return totalEntryCents(b) - totalEntryCents(a);
    if (sort === "amount_asc") return totalEntryCents(a) - totalEntryCents(b);
    if (sort === "updated_desc") return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    return a.due_date.localeCompare(b.due_date);
  });
}

function EntriesTable({
  entries,
  data,
  entryType,
  activeView,
}: {
  entries: FinancialEntryWithRelations[];
  data: FinancialWorkspaceData;
  entryType: "receivable" | "payable";
  activeView: FinancialSubsection;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EntryStatusFilter>(() => defaultStatusFilter(activeView));
  const [sort, setSort] = useState<EntrySort>("due_asc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [costCenterId, setCostCenterId] = useState("all");
  const [healthPlanId, setHealthPlanId] = useState("all");
  const [vendorId, setVendorId] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setStatusFilter(defaultStatusFilter(activeView));
  }, [activeView]);

  useEffect(() => {
    setPage(1);
  }, [accountId, categoryId, costCenterId, dateFrom, dateTo, healthPlanId, query, sort, statusFilter, vendorId]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = entries
      .filter((entry) => matchesEntryStatus(entry, statusFilter))
      .filter((entry) => {
        if (dateFrom && entry.due_date < dateFrom) return false;
        if (dateTo && entry.due_date > dateTo) return false;
        if (categoryId !== "all" && entry.category_id !== categoryId) return false;
        if (costCenterId !== "all" && entry.cost_center_id !== costCenterId) return false;
        if (healthPlanId !== "all" && entry.health_plan_id !== healthPlanId) return false;
        if (vendorId !== "all" && entry.vendor_id !== vendorId) return false;
        if (accountId !== "all" && !entry.payments.some((payment) => payment.account_id === accountId)) return false;
        return true;
      })
      .filter((entry) => {
        if (!normalizedQuery) return true;
        const haystack = [
          entry.description,
          entry.document_number,
          entry.patient?.full_name,
          entry.patient?.social_name,
          entry.vendor?.name,
          entry.category?.name,
          entry.professional?.profile?.full_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    return sortEntries(result, sort);
  }, [accountId, categoryId, costCenterId, dateFrom, dateTo, entries, healthPlanId, query, sort, statusFilter, vendorId]);

  const openTotal = filtered.reduce((sum, entry) => sum + openEntryCents(entry), 0);
  const paidTotal = filtered.reduce((sum, entry) => sum + entry.paid_cents, 0);
  const overdueCount = filtered.filter(isOverdue).length;
  const title = entryType === "receivable" ? "Carteira de recebimentos" : "Carteira de pagamentos";
  const pageSize = 20;
  const totalPages = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const visibleEntries = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <section className="grid gap-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Visualização tabelada com filtros operacionais, saldos e ações auditáveis.
          </p>
        </div>
        <div className="grid gap-1 text-right text-xs text-muted-foreground">
          <span>{filtered.length} lançamento(s)</span>
          <span>{overdueCount} vencido(s)</span>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        <MetricCard label="Aberto no filtro" value={formatCurrencyBRL(openTotal)} description="Saldo ainda não baixado" tone={openTotal > 0 ? "warning" : "default"} />
        <MetricCard label="Pago no filtro" value={formatCurrencyBRL(paidTotal)} description="Baixas confirmadas" tone="success" />
        <MetricCard label="Vencidos" value={String(overdueCount)} description="Lançamentos com vencimento ultrapassado" tone={overdueCount ? "warning" : "default"} />
        <MetricCard label="Conciliados" value={String(filtered.filter(entryHasReconciliation).length)} description="Com movimento bancário travado" />
      </div>

      <div className="grid gap-2.5 rounded-md border bg-muted/20 p-3">
        <div className="grid gap-2.5 xl:grid-cols-[minmax(240px,1.5fr)_180px_170px_170px_auto]">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Buscar
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={entryType === "receivable" ? "Paciente, documento, serviço..." : "Fornecedor, documento, descrição..."}
            className="h-9 rounded-md border bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Status
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as EntryStatusFilter)}>
            <option value="all">Todos</option>
            <option value="open">Em aberto</option>
            <option value="partial">Parcial</option>
            <option value="paid">Pago</option>
            <option value="overdue">Vencido</option>
            <option value="with_reversals">Com estorno</option>
            <option value="reconciled">Conciliado</option>
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Vencimento inicial
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Vencimento final
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <div className="flex items-end">
          <Button
            type="button"
            size="sm"
            variant={advancedFiltersOpen ? "secondary" : "outline"}
            className="h-9 w-full"
            onClick={() => setAdvancedFiltersOpen((current) => !current)}
          >
            <SlidersHorizontal />
            Mais filtros
          </Button>
        </div>
        </div>

        {advancedFiltersOpen ? (
          <div className="grid gap-2.5 border-t pt-3 xl:grid-cols-4">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Categoria
          <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="all">Todas</option>
            {data.categories
              .filter((category) => category.direction === (entryType === "receivable" ? "income" : "expense"))
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Centro de custo
          <Select value={costCenterId} onChange={(event) => setCostCenterId(event.target.value)}>
            <option value="all">Todos</option>
            {data.costCenters.map((costCenter) => (
              <option key={costCenter.id} value={costCenter.id}>
                {costCenter.name}
              </option>
            ))}
          </Select>
        </label>
        {entryType === "receivable" ? (
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Convênio
            <Select value={healthPlanId} onChange={(event) => setHealthPlanId(event.target.value)}>
              <option value="all">Todos</option>
              {data.healthPlans.map((healthPlan) => (
                <option key={healthPlan.id} value={healthPlan.id}>
                  {healthPlan.name}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Fornecedor
            <Select value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
              <option value="all">Todos</option>
              {data.vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Conta baixada
          <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="all">Todas</option>
            {data.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Ordenar
          <Select value={sort} onChange={(event) => setSort(event.target.value as EntrySort)}>
            <option value="due_asc">Vencimento mais próximo</option>
            <option value="due_desc">Vencimento mais distante</option>
            <option value="amount_desc">Maior valor</option>
            <option value="amount_asc">Menor valor</option>
            <option value="updated_desc">Atualização recente</option>
          </Select>
        </label>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setQuery("");
              setDateFrom("");
              setDateTo("");
              setCategoryId("all");
              setCostCenterId("all");
              setHealthPlanId("all");
              setVendorId("all");
              setAccountId("all");
              setSort("due_asc");
              setStatusFilter(defaultStatusFilter(activeView));
            }}
          >
            Limpar filtros
          </Button>
        </div>
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full min-w-[1260px] text-[13px]">
          <thead className="bg-muted/60 text-left text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="min-w-56 px-3 py-2.5 font-medium">{entryType === "receivable" ? "Paciente/Origem" : "Fornecedor/Origem"}</th>
              <th className="min-w-72 px-3 py-2.5 font-medium">Descrição</th>
              <th className="w-28 px-3 py-2.5 font-medium">Vencimento</th>
              <th className="w-28 px-3 py-2.5 text-right font-medium">Total</th>
              <th className="w-28 px-3 py-2.5 text-right font-medium">Pago</th>
              <th className="w-28 px-3 py-2.5 text-right font-medium">Aberto</th>
              <th className="w-28 px-3 py-2.5 font-medium">Status</th>
              <th className="w-40 px-3 py-2.5 font-medium">Conciliação</th>
              <th className="sticky right-0 bg-muted/95 px-3 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.length ? (
              visibleEntries.map((entry) => <EntryTableRow key={entry.id} entry={entry} data={data} entryType={entryType} />)
            ) : (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  Nenhum lançamento encontrado para os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          Exibindo {visibleEntries.length ? (page - 1) * pageSize + 1 : 0}-
          {Math.min(page * pageSize, filtered.length)} de {filtered.length}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>
            Anterior
          </Button>
          <span className="text-xs">
            Página {page} de {totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(current + 1, totalPages))}>
            Próxima
          </Button>
        </div>
      </div>
    </section>
  );
}

function EntryTableRow({
  entry,
  data,
  entryType,
}: {
  entry: FinancialEntryWithRelations;
  data: FinancialWorkspaceData;
  entryType: "receivable" | "payable";
}) {
  const [settling, setSettling] = useState(false);
  const [detailing, setDetailing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [receiptType, setReceiptType] = useState<"payment" | "payment_acknowledgement" | null>(null);
  const [reversing, setReversing] = useState<FinancialPayment | null>(null);
  const openCents = openEntryCents(entry);
  const party = entry.patient?.social_name || entry.patient?.full_name || entry.vendor?.name || "Sem vínculo";
  const locked = entryHasReconciliation(entry);
  const latestPayment = entry.payments.find((payment) => payment.status === "confirmed") ?? null;

  return (
    <tr className="border-t align-top">
      <td className="min-w-56 px-3 py-2.5">
        <p className="whitespace-normal break-words font-medium">{party}</p>
        <p className="mt-1 text-xs text-muted-foreground">{entry.category?.name ?? "Sem categoria"}</p>
      </td>
      <td className="min-w-72 px-3 py-2.5">
        <p className="whitespace-normal break-words font-medium">{entry.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {entry.entry_type === "payable" ? documentTypeLabel(entry.document_type) : entry.origin}
          {entry.document_number ? ` | ${entry.document_number}` : ""}
        </p>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
        <span className={isOverdue(entry) ? "font-medium text-amber-700" : undefined}>{formatDate(entry.due_date)}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrencyBRL(totalEntryCents(entry))}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrencyBRL(entry.paid_cents)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrencyBRL(openCents)}</td>
      <td className="px-3 py-2.5">
        <div className="grid gap-1">
          <Badge className={isOverdue(entry) ? "bg-amber-500/10 text-amber-700" : undefined}>
            {isOverdue(entry) ? "Vencido" : statusLabels[entry.status] ?? entry.status}
          </Badge>
          {entryHasReversal(entry) ? <span className="text-xs text-destructive">Possui estorno</span> : null}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <Badge className={locked ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}>
          {locked ? "Conciliado e bloqueado" : "Pendente"}
        </Badge>
      </td>
      <td className="sticky right-0 bg-card px-2 py-2 shadow-[-8px_0_12px_-12px_rgb(0_0_0/0.35)]">
        <div className="flex justify-end gap-1">
          <Button className="h-8 px-2.5 text-xs" size="sm" variant="outline" disabled={openCents <= 0 || !data.access.canEdit || locked} onClick={() => setSettling(true)}>
            Baixar
          </Button>
          <Button className="size-8 p-0" size="icon" variant="ghost" title="Detalhar lançamento" onClick={() => setDetailing(true)}>
            <Eye />
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button className="size-8 p-0" size="icon" variant="ghost" title="Mais ações">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem disabled={!data.access.canEdit || locked || entry.status === "cancelled"} onSelect={() => setEditing(true)}>
                Editar lançamento
              </DropdownMenuItem>
              {entryType === "receivable" ? (
                <DropdownMenuItem onSelect={() => setReceiptType(openCents > 0 ? "payment_acknowledgement" : "payment")}>
                  Emitir documento
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!latestPayment || latestPayment.status === "reversed" || !data.access.canManage || locked} onSelect={() => latestPayment && setReversing(latestPayment)}>
                Estornar baixa
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" disabled={!data.access.canManage || locked || entry.status === "cancelled" || entry.paid_cents > 0} onSelect={() => setCancelling(true)}>
                Cancelar lançamento
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Modal open={detailing} onOpenChange={setDetailing} title="Detalhes do lançamento" description={entry.description} className="max-w-5xl">
          <FinancialEntryDetail entry={entry} />
        </Modal>
        <Modal open={editing} onOpenChange={setEditing} title="Editar lançamento" description={locked ? "Movimento conciliado não pode ser alterado." : entry.description} className="max-w-4xl">
          <FinancialEntryForm
            entry={entry}
            entryType={entry.entry_type}
            categories={data.categories}
            costCenters={data.costCenters}
            healthPlans={data.healthPlans}
            vendors={data.vendors}
            onCompleted={() => setEditing(false)}
          />
        </Modal>
        <Modal open={cancelling} onOpenChange={setCancelling} title="Cancelar lançamento" description={entry.description} className="max-w-lg">
          <CancelFinancialEntryForm entry={entry} onCompleted={() => setCancelling(false)} />
        </Modal>
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
      </td>
    </tr>
  );
}

function compactObject(value: Record<string, unknown> | null | undefined) {
  if (!value) return "Sem detalhes adicionais.";
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null && item !== "")
    .slice(0, 8);
  if (!entries.length) return "Sem detalhes adicionais.";
  return entries
    .map(([key, item]) => `${key.replaceAll("_", " ")}: ${String(item)}`)
    .join(" | ");
}

function FinancialEntryDetail({ entry }: { entry: FinancialEntryWithRelations }) {
  const party = entry.patient?.social_name || entry.patient?.full_name || entry.vendor?.name || "Sem vínculo";
  const locked = entryHasReconciliation(entry);

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 lg:grid-cols-4">
        <MetricCard label="Total" value={formatCurrencyBRL(totalEntryCents(entry))} description="Valor líquido do lançamento" />
        <MetricCard label="Pago" value={formatCurrencyBRL(entry.paid_cents)} description="Baixas confirmadas" tone="success" />
        <MetricCard label="Aberto" value={formatCurrencyBRL(openEntryCents(entry))} description="Saldo ainda pendente" tone={openEntryCents(entry) > 0 ? "warning" : "default"} />
        <MetricCard label="Status" value={statusLabels[entry.status] ?? entry.status} description={locked ? "Travado por conciliação" : "Editável conforme permissão"} />
      </div>

      {locked ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900">
          Este lançamento possui movimento conciliado. Para alterar valores, vencimento, baixa ou estorno, é necessário reabrir a conciliação correspondente com permissão.
        </div>
      ) : null}

      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <p className="font-medium">Dados principais</p>
        <div className="grid gap-3 text-sm lg:grid-cols-3">
          <InfoBox label="Pessoa/empresa" value={party} />
          <InfoBox label="Categoria" value={entry.category?.name ?? "Sem categoria"} />
          <InfoBox label="Centro de custo" value={entry.costCenter?.name ?? "Não informado"} />
          <InfoBox label="Documento" value={`${documentTypeLabel(entry.document_type)}${entry.document_number ? ` - ${entry.document_number}` : ""}`} />
          <InfoBox label="Emissão" value={formatDate(entry.issue_date)} />
          <InfoBox label="Vencimento" value={formatDate(entry.due_date)} />
        </div>
        {entry.notes ? <p className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">{entry.notes}</p> : null}
      </section>

      {entry.entry_type === "payable" ? (
        <section className="grid gap-3 rounded-lg border bg-card p-4">
          <p className="font-medium">Itens e composição do documento</p>
          <div className="grid gap-3 lg:grid-cols-4">
            <InfoBox label="Subtotal" value={formatCurrencyBRL(entry.amount_cents)} />
            <InfoBox label="Desconto" value={formatCurrencyBRL(entry.discount_cents)} />
            <InfoBox label="Frete" value={formatCurrencyBRL(entry.freight_cents ?? 0)} />
            <InfoBox label="Acréscimos" value={formatCurrencyBRL(entry.addition_cents)} />
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Quantidade</th>
                  <th className="px-3 py-2 text-right font-medium">Unitário</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {entry.items.length ? (
                  entry.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="px-3 py-2 text-right">{String(item.quantity).replace(".", ",")}</td>
                      <td className="px-3 py-2 text-right">{formatCurrencyBRL(item.unit_amount_cents)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrencyBRL(item.total_amount_cents)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-8 text-center text-muted-foreground" colSpan={4}>
                      Nenhum item detalhado para este documento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <p className="font-medium">Baixas e documentos</p>
        <div className="grid gap-2">
          {entry.payments.length ? (
            entry.payments.map((payment) => (
              <div key={payment.id} className="grid gap-2 rounded-md border bg-background p-3 text-sm lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="font-medium">{payment.status === "reversed" ? "Estornado" : "Confirmado"} em {formatDateTime(payment.paid_at)}</p>
                  <p className="text-xs text-muted-foreground">
                    Bruto {formatCurrencyBRL(payment.amount_cents)} | taxa {formatCurrencyBRL(payment.fee_cents)} | líquido {formatCurrencyBRL(payment.net_amount_cents)}
                  </p>
                </div>
                <Badge className={payment.reconciliation_id ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}>
                  {payment.reconciliation_id ? "Conciliado" : "Não conciliado"}
                </Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma baixa registrada.</p>
          )}
          {entry.receipts.length ? (
            <div className="grid gap-2 border-t pt-3">
              {entry.receipts.map((receipt) => (
                <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 p-2 text-sm">
                  <span>{receipt.title} | {formatDateTime(receipt.issued_at)}</span>
                  <Button size="sm" variant="outline" onClick={() => window.open(`/financeiro/recibos/${receipt.id}`, "_blank")}>
                    Abrir
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <p className="font-medium">Histórico do lançamento</p>
        <div className="grid gap-2">
          {entry.events.length ? (
            entry.events.map((event) => (
              <div key={event.id} className="rounded-md border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{entryEventLabels[event.event_type] ?? event.event_type}</p>
                  <span className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{event.notes ?? compactObject(event.new_values)}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Histórico específico ainda não registrado para este lançamento.</p>
          )}
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border bg-card p-4">
        <p className="font-medium">Livro-caixa</p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Origem</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 text-right font-medium">Líquido</th>
              </tr>
            </thead>
            <tbody>
              {entry.ledgerEntries.length ? (
                entry.ledgerEntries.map((ledger) => (
                  <tr key={ledger.id} className="border-t">
                    <td className="px-3 py-2">{formatDateTime(ledger.occurred_at)}</td>
                    <td className="px-3 py-2">{ledger.description}</td>
                    <td className="px-3 py-2">{ledger.direction === "in" ? "Entrada" : "Saída"}</td>
                    <td className="px-3 py-2 text-right">{formatCurrencyBRL(ledger.amount_cents)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrencyBRL(ledger.net_amount_cents)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>
                    Nenhum lançamento no livro-caixa para este registro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function BankDivergencesPanel({
  imports,
  onReview,
}: {
  imports: FinancialWorkspaceData["bankImports"];
  onReview: (id: string) => void;
}) {
  const rows = imports.flatMap((batch) => batch.items.filter((item) => item.status === "pending").map((item) => ({ batch, item })));
  const total = rows.reduce((sum, row) => sum + (row.item.direction === "in" ? row.item.amount_cents : -row.item.amount_cents), 0);
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <MetricCard label="Sem correspondência" value={String(rows.length)} description="Movimentos bancários sem par" tone={rows.length ? "warning" : "default"} />
        <MetricCard label="Impacto líquido" value={formatCurrencyBRL(total)} description="Entradas menos saídas divergentes" />
        <MetricCard label="Arquivos envolvidos" value={String(new Set(rows.map((row) => row.batch.id)).size)} description="Importações que exigem revisão" />
      </div>
      <section className="rounded-lg border bg-card">
        <div className="border-b p-3.5"><p className="font-medium">Movimentos para investigar</p><p className="mt-1 text-sm text-muted-foreground">Confirme se são tarifas bancárias, lançamentos ausentes ou diferenças de data e descrição.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-[13px]"><thead className="bg-muted/50 text-left text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Conta</th><th className="px-3 py-2.5">Descrição bancária</th><th className="px-3 py-2.5">Arquivo</th><th className="px-3 py-2.5">Natureza</th><th className="px-3 py-2.5 text-right">Valor</th><th className="px-3 py-2.5 text-right">Ação</th></tr></thead><tbody>{rows.length ? rows.map(({ batch, item }) => <tr key={item.id} className="border-t align-top"><td className="whitespace-nowrap px-3 py-2.5">{formatDate(item.transaction_date)}</td><td className="px-3 py-2.5">{batch.account?.name ?? "Conta"}</td><td className="max-w-[320px] whitespace-normal break-words px-3 py-2.5 font-medium">{item.description}</td><td className="max-w-[220px] whitespace-normal break-all px-3 py-2.5 text-muted-foreground">{batch.file_name}</td><td className="px-3 py-2.5">{item.direction === "in" ? "Entrada" : "Saída"}</td><td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrencyBRL(item.amount_cents)}</td><td className="px-3 py-2.5 text-right"><Button size="sm" variant="outline" onClick={() => onReview(batch.id)}><Eye />Revisar arquivo</Button></td></tr>) : <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nenhuma divergência bancária pendente.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}

function MonthlyClosingPanel({ data }: { data: FinancialWorkspaceData }) {
  const [closingOpen, setClosingOpen] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const reopening = reopeningId ? data.monthlyClosings.find((item) => item.id === reopeningId) ?? null : null;
  const current = data.monthlyClosings[0] ?? null;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <MetricCard label="Último período" value={current ? formatMonth(current.period_month) : "Não fechado"} description={current?.status === "closed" ? "Período protegido" : "Período reaberto"} tone={current?.status === "closed" ? "success" : "warning"} />
        <MetricCard label="Resultado do fechamento" value={current ? formatCurrencyBRL(current.result_cents) : formatCurrencyBRL(0)} description="Receitas recebidas menos despesas pagas" />
        <MetricCard label="Pendências atuais" value={String(data.payments.filter((item) => item.status === "confirmed" && !item.reconciliation_id && item.account_id).length)} description="Movimentos ainda sem conciliação" tone="warning" />
      </div>
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3"><div><p className="font-medium">Controle de competência</p><p className="mt-1 text-sm text-muted-foreground">O fechamento cria uma fotografia gerencial e bloqueia alterações no mês.</p></div><Button disabled={!data.access.canApprove} onClick={() => setClosingOpen(true)}><CalendarCheck />Novo fechamento</Button></div>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[920px] text-[13px]"><thead className="bg-muted/50 text-left text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2.5">Competência</th><th className="px-3 py-2.5">Situação</th><th className="px-3 py-2.5 text-right">Recebido</th><th className="px-3 py-2.5 text-right">Pago</th><th className="px-3 py-2.5 text-right">Resultado</th><th className="px-3 py-2.5">Responsável</th><th className="px-3 py-2.5 text-right">Ação</th></tr></thead><tbody>{data.monthlyClosings.length ? data.monthlyClosings.map((item) => <tr key={item.id} className="border-t"><td className="whitespace-nowrap px-3 py-2.5 font-medium">{formatMonth(item.period_month)}</td><td className="px-3 py-2.5"><Badge className={item.status === "closed" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}>{item.status === "closed" ? "Fechado" : "Reaberto"}</Badge></td><td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrencyBRL(item.revenue_cents)}</td><td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrencyBRL(item.expense_cents)}</td><td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrencyBRL(item.result_cents)}</td><td className="px-3 py-2.5">{item.closed_by_profile?.full_name ?? "Usuário"}</td><td className="px-3 py-2.5 text-right">{item.status === "closed" ? <Button size="sm" variant="outline" disabled={!data.access.canApprove} onClick={() => setReopeningId(item.id)}><LockOpen />Reabrir</Button> : <span className="text-xs text-muted-foreground">{item.reopening_reason ?? "Aguardando novo fechamento"}</span>}</td></tr>) : <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nenhum período financeiro fechado.</td></tr>}</tbody></table></div>
      </section>
      <Modal open={closingOpen} onOpenChange={setClosingOpen} title="Fechar mês financeiro" description="A operação será validada e registrada na auditoria." className="max-w-xl"><MonthlyCloseForm onCompleted={() => setClosingOpen(false)} /></Modal>
      <Modal open={Boolean(reopening)} onOpenChange={(open) => { if (!open) setReopeningId(null); }} title="Reabrir mês financeiro" className="max-w-lg">{reopening ? <ReopenMonthlyCloseForm closing={reopening} onCompleted={() => setReopeningId(null)} /> : null}</Modal>
    </div>
  );
}

function formatMonth(value: string) {
  const date = /^\d{4}-\d{2}/.test(value) ? new Date(`${value.slice(0, 7)}-01T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Período inválido";
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function FinancialDrePanel({ data }: { data: FinancialWorkspaceData }) {
  const availableMonths = useMemo(() => [...new Set(data.entries.map((entry) => entry.competence_date?.slice(0, 7)).filter(Boolean))].sort().reverse() as string[], [data.entries]);
  const [month, setMonth] = useState(() => availableMonths[0] ?? new Date().toISOString().slice(0, 7));
  const entries = data.entries.filter((entry) => entry.competence_date?.startsWith(month) && entry.status !== "cancelled");
  const revenues = entries.filter((entry) => entry.entry_type === "receivable");
  const expenses = entries.filter((entry) => entry.entry_type === "payable");
  const grossRevenue = revenues.reduce((sum, entry) => sum + entry.amount_cents + (entry.freight_cents ?? 0) + entry.addition_cents, 0);
  const deductions = revenues.reduce((sum, entry) => sum + entry.discount_cents, 0);
  const netRevenue = grossRevenue - deductions;
  const operatingExpenses = expenses.reduce((sum, entry) => sum + totalEntryCents(entry), 0);
  const result = netRevenue - operatingExpenses;
  const categoryMap = new Map(data.categories.map((item) => [item.id, item.name]));
  const categoryRows = [...new Map(entries.map((entry) => [entry.category_id ?? `${entry.entry_type}-uncategorized`, { id: entry.category_id ?? `${entry.entry_type}-uncategorized`, name: entry.category_id ? categoryMap.get(entry.category_id) ?? "Categoria" : "Sem categoria", direction: entry.entry_type, value: 0 }])).values()];
  for (const row of categoryRows) row.value = entries.filter((entry) => (entry.category_id ?? `${entry.entry_type}-uncategorized`) === row.id).reduce((sum, entry) => sum + totalEntryCents(entry), 0);
  const scale = Math.max(...categoryRows.map((item) => item.value), 1);
  return (
    <div className="grid gap-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"><div><p className="font-medium">Regime de competência</p><p className="text-sm text-muted-foreground">Resultado gerencial dos lançamentos com competência no período.</p></div><label className="flex items-center gap-2 text-sm font-medium">Competência<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm font-normal" /></label></section>
      <div className="grid gap-3 lg:grid-cols-4"><MetricCard label="Receita bruta" value={formatCurrencyBRL(grossRevenue)} description="Faturamento do período" /><MetricCard label="Deduções" value={formatCurrencyBRL(deductions)} description="Descontos concedidos" tone="warning" /><MetricCard label="Despesas operacionais" value={formatCurrencyBRL(operatingExpenses)} description="Custos e despesas lançados" /><MetricCard label="Resultado gerencial" value={formatCurrencyBRL(result)} description={result >= 0 ? "Superávit operacional" : "Déficit operacional"} tone={result >= 0 ? "success" : "warning"} /></div>
      <section className="rounded-lg border bg-card"><div className="border-b p-3.5"><p className="font-medium">Demonstração do resultado</p><p className="mt-1 text-sm text-muted-foreground">{formatMonth(`${month}-01`)} | valores por competência.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-[13px]"><tbody><tr className="border-b bg-muted/20"><td className="px-3 py-2.5 font-medium">Receita bruta</td><td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrencyBRL(grossRevenue)}</td></tr><tr className="border-b"><td className="px-3 py-2.5 text-muted-foreground">(-) Deduções e descontos</td><td className="px-3 py-2.5 text-right tabular-nums">{formatCurrencyBRL(-deductions)}</td></tr><tr className="border-b bg-emerald-500/5"><td className="px-3 py-2.5 font-medium">Receita líquida</td><td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrencyBRL(netRevenue)}</td></tr><tr className="border-b"><td className="px-3 py-2.5 text-muted-foreground">(-) Custos e despesas operacionais</td><td className="px-3 py-2.5 text-right tabular-nums">{formatCurrencyBRL(-operatingExpenses)}</td></tr><tr className={result >= 0 ? "bg-emerald-500/10" : "bg-amber-500/10"}><td className="px-3 py-3 font-semibold">Resultado do período</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{formatCurrencyBRL(result)}</td></tr></tbody></table></div></section>
      <section className="rounded-lg border bg-card"><div className="border-b p-3.5"><p className="font-medium">Composição por categoria</p></div><div className="grid gap-3 p-4">{categoryRows.length ? categoryRows.sort((a, b) => b.value - a.value).map((row) => <div key={row.id} className="grid gap-1.5"><div className="flex items-center justify-between gap-3 text-[13px]"><span>{row.name}</span><span className="font-medium tabular-nums">{formatCurrencyBRL(row.value)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={row.direction === "receivable" ? "h-full bg-emerald-500" : "h-full bg-amber-500"} style={{ width: `${Math.max((row.value / scale) * 100, 2)}%` }} /></div></div>) : <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lançamento para esta competência.</p>}</div></section>
    </div>
  );
}

function MovementTable({
  rows,
  compact,
  scrollable,
  checkable,
  checkedIds = [],
  onToggle,
}: {
  rows: MovementRow[];
  compact?: boolean;
  scrollable?: boolean;
  checkable?: boolean;
  checkedIds?: string[];
  onToggle?: (paymentId: string) => void;
}) {
  return (
    <section className="rounded-lg border bg-card">
      {!compact ? (
        <div className="flex items-center gap-3 border-b p-4">
          <BarChart3 className="size-5 text-primary" />
          <div>
            <p className="font-medium">Movimentos financeiros</p>
            <p className="text-sm text-muted-foreground">
              Cada registro aparece em coluna própria, com status de conciliação e responsável pelo fechamento.
            </p>
          </div>
        </div>
      ) : null}
      <div className={scrollable ? "max-h-[65vh] overflow-auto" : "overflow-x-auto"}>
        <table className="w-full min-w-[1120px] text-[13px]">
          <thead className={scrollable ? "sticky top-0 z-10 bg-muted text-left text-[11px] uppercase text-muted-foreground shadow-sm" : "bg-muted/60 text-left text-[11px] uppercase text-muted-foreground"}>
            <tr>
              {checkable ? <th className="w-28 px-3 py-2.5 font-medium">Conferido</th> : null}
              <th className="w-24 px-3 py-2.5 font-medium">Data</th>
              <th className="w-32 px-3 py-2.5 font-medium">Conta</th>
              <th className="w-24 px-3 py-2.5 font-medium">Tipo</th>
              <th className="w-64 px-3 py-2.5 font-medium">Lançamento</th>
              <th className="w-28 px-3 py-2.5 text-right font-medium">Bruto</th>
              <th className="w-24 px-3 py-2.5 text-right font-medium">Taxa</th>
              <th className="w-28 px-3 py-2.5 text-right font-medium">Líquido</th>
              <th className="w-28 px-3 py-2.5 font-medium">Conciliação</th>
              <th className="w-40 px-3 py-2.5 font-medium">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.slice(0, 120).map(({ entry, payment, account, reconciliation }) => (
                <tr key={payment.id} className="border-t">
                  {checkable ? (
                    <td className="px-3 py-2.5">
                      {payment.reconciliation_id ? (
                        <Badge className="bg-emerald-500/10 text-emerald-700">Travado</Badge>
                      ) : (
                        <label className="inline-flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={checkedIds.includes(payment.id)}
                            onChange={() => onToggle?.(payment.id)}
                          />
                          Conferi
                        </label>
                      )}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatDate(payment.paid_at)}</td>
                  <td className="max-w-44 whitespace-normal break-words px-3 py-2.5">{account?.name ?? "Sem conta"}</td>
                  <td className="px-3 py-2.5">
                    <Badge className={payment.direction === "in" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}>
                      {payment.direction === "in" ? "Entrada" : "Saída"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="max-w-72 whitespace-normal break-words font-medium">{entry.description}</p>
                    <p className="max-w-72 whitespace-normal break-words text-xs text-muted-foreground">
                      {entry.patient?.social_name || entry.patient?.full_name || entry.vendor?.name || "Sem vinculação"}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrencyBRL(Number(payment.amount_cents) || 0)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrencyBRL(Number(payment.fee_cents) || 0)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrencyBRL(Number(payment.net_amount_cents) || 0)}</td>
                  <td className="px-3 py-2.5">
                    <Badge className={payment.reconciliation_id ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}>
                      {payment.reconciliation_id ? "Conciliado" : "Pendente"}
                    </Badge>
                  </td>
                  <td className="max-w-48 whitespace-normal break-words px-3 py-2.5">{reconciliation?.closed_by_profile?.full_name ?? "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={checkable ? 10 : 9}>
                  Nenhum movimento encontrado para os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BankImportReview({
  data,
  canApprove,
  onCompleted,
}: {
  data: FinancialWorkspaceData["bankImports"][number];
  canApprove: boolean;
  onCompleted: () => void;
}) {
  const matched = data.items.filter((item) => item.status === "matched").length;
  const pending = data.items.filter((item) => item.status === "pending").length;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <InfoBox label="Conta" value={data.account?.name ?? "Conta não identificada"} />
        <InfoBox label="Correspondências" value={`${matched} de ${data.items.length}`} />
        <InfoBox label="Divergências" value={String(pending)} />
      </div>
      <div className="max-h-[55vh] overflow-auto rounded-lg border">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead className="sticky top-0 z-10 bg-muted text-left text-[11px] uppercase text-muted-foreground shadow-sm">
            <tr><th className="w-24 px-3 py-2.5">Data</th><th className="w-72 px-3 py-2.5">Descrição</th><th className="w-24 px-3 py-2.5">Natureza</th><th className="w-28 px-3 py-2.5 text-right">Valor</th><th className="w-32 px-3 py-2.5">Situação</th><th className="w-24 px-3 py-2.5">Confiança</th></tr>
          </thead>
          <tbody>{data.items.map((item) => <tr key={item.id} className="border-t align-top"><td className="whitespace-nowrap px-3 py-2.5">{formatDate(item.transaction_date)}</td><td className="max-w-96 whitespace-normal break-words px-3 py-2.5">{item.description}</td><td className="px-3 py-2.5">{item.direction === "in" ? "Entrada" : "Saída"}</td><td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrencyBRL(item.amount_cents)}</td><td className="px-3 py-2.5"><Badge className={item.status === "matched" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}>{item.status === "matched" ? "Correspondente" : "Sem par"}</Badge></td><td className="px-3 py-2.5">{item.match_confidence ? `${item.match_confidence}%` : "-"}</td></tr>)}</tbody>
        </table>
      </div>
      {pending ? <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900"><strong>{pending} divergência(s).</strong> Confira se são tarifas, lançamentos ausentes ou datas diferentes antes de fechar a conciliação.</div> : null}
      {data.status === "ready" && canApprove ? <CompleteBankImportForm importId={data.id} onCompleted={onCompleted} /> : null}
    </div>
  );
}

function QuickReconciliationFilters({ accounts, range, selectedAccounts, onApply }: { accounts: FinancialWorkspaceData["accounts"]; range: ReconciliationRange; selectedAccounts: string[]; onApply: (range: ReconciliationRange, accounts: string[]) => void; }) {
  const [draftRange, setDraftRange] = useState(range);
  const [draftAccounts, setDraftAccounts] = useState(selectedAccounts);
  function toggle(accountId: string) { setDraftAccounts((current) => current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId]); }
  return <div className="grid gap-4"><div className="grid gap-2"><p className="text-sm font-medium">Período</p><div className="flex rounded-md border bg-background p-1">{[["today", "Hoje"], ["week", "Semana"], ["month", "Mês"]].map(([key, label]) => <Button key={key} size="sm" variant={draftRange === key ? "secondary" : "ghost"} onClick={() => setDraftRange(key as ReconciliationRange)}>{label}</Button>)}</div></div><div className="grid gap-2"><p className="text-sm font-medium">Contas exibidas</p><div className="grid gap-2 sm:grid-cols-2">{accounts.map((account) => <label key={account.id} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-xs"><input type="checkbox" className="size-3.5" checked={!draftAccounts.length || draftAccounts.includes(account.id)} onChange={() => toggle(account.id)} /><span className="truncate">{account.name}</span></label>)}</div></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onApply(draftRange, [])}>Todas as contas</Button><Button onClick={() => onApply(draftRange, draftAccounts)}>Aplicar filtros</Button></div></div>;
}

function MovementReportForm({ accounts, onCompleted }: { accounts: FinancialWorkspaceData["accounts"]; onCompleted: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = getRangeStart("week").toISOString().slice(0, 10);
  const [savedParams, setSavedParams] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("financial-movement-report-filter");
    if (raw) setSavedParams(new URLSearchParams(raw));
  }, []);

  function submit(formData: FormData) {
    const params = new URLSearchParams();
    for (const key of ["date_from", "date_to", "reconciled", "account_id", "min_amount", "max_amount"] as const) {
      const value = String(formData.get(key) ?? "");
      if (value && value !== "all") params.set(key, value);
    }
    params.set("include_in", formData.get("include_in") ? "1" : "0");
    params.set("include_out", formData.get("include_out") ? "1" : "0");
    if (formData.get("save_filter")) localStorage.setItem("financial-movement-report-filter", params.toString());
    window.open("/api/financeiro/movimentos?" + params.toString(), "_blank");
    onCompleted();
  }

  const defaultReconciled = savedParams?.get("reconciled") ?? "all";
  const defaultAccount = savedParams?.get("account_id") ?? "all";

  return (
    <form key={savedParams?.toString() ?? "default"} action={submit} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Data inicial
          <input name="date_from" type="date" defaultValue={savedParams?.get("date_from") ?? weekStart} className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Data final
          <input name="date_to" type="date" defaultValue={savedParams?.get("date_to") ?? today} className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Conciliado
          <Select name="reconciled" defaultValue={defaultReconciled}>
            <option value="all">Todos</option>
            <option value="yes">Sim</option>
            <option value="no">Não</option>
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Conta
          <Select name="account_id" defaultValue={defaultAccount}>
            <option value="all">Todas as contas</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Valor inicial
          <input name="min_amount" inputMode="decimal" defaultValue={savedParams?.get("min_amount") ?? ""} placeholder="0,00" className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Valor final
          <input name="max_amount" inputMode="decimal" defaultValue={savedParams?.get("max_amount") ?? ""} placeholder="0,00" className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm"><input type="checkbox" name="include_in" defaultChecked={savedParams?.get("include_in") !== "0"} className="size-4" /> Entradas</label>
        <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm"><input type="checkbox" name="include_out" defaultChecked={savedParams?.get("include_out") !== "0"} className="size-4" /> Saídas</label>
        <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm"><input type="checkbox" name="save_filter" className="size-4" /> Salvar filtro</label>
      </div>
      <div className="flex justify-end">
        <Button><FileText />Gerar relatório</Button>
      </div>
    </form>
  );
}

function ReconciliationDetail({ reconciliation, rows }: { reconciliation: FinancialWorkspaceData["reconciliations"][number]; rows: MovementRow[] }) {
  return <div className="grid gap-4 text-sm"><div className="grid gap-3 lg:grid-cols-3"><MetricCard label="Conta" value={reconciliation.account?.name ?? "Conta"} description="Conta conciliada" /><MetricCard label="Movimentos" value={String(rows.length)} description="Pagamentos vinculados" /><MetricCard label="Status" value={reconciliation.status === "closed" ? "Fechada" : "Reaberta"} description="Situação atual" /></div><div className="grid gap-3 lg:grid-cols-2"><div className="rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Período</p><p className="font-medium">{formatDate(reconciliation.period_start)} até {formatDate(reconciliation.period_end)}</p></div><div className="rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Fechada por</p><p className="font-medium">{reconciliation.closed_by_profile?.full_name ?? "Usuário não identificado"}</p></div><div className="rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Saldo inicial</p><p className="font-medium">{formatCurrencyBRL(reconciliation.opening_balance_cents)}</p></div><div className="rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Saldo bancário final</p><p className="font-medium">{formatCurrencyBRL(reconciliation.bank_balance_cents)}</p></div><div className="rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Entradas</p><p className="font-medium">{formatCurrencyBRL(reconciliation.total_in_cents)}</p></div><div className="rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Saídas</p><p className="font-medium">{formatCurrencyBRL(reconciliation.total_out_cents)}</p></div></div>{reconciliation.reversal_reason ? <div className="rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Motivo da reabertura</p><p>{reconciliation.reversal_reason}</p></div> : null}{reconciliation.notes ? <div className="rounded-md border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Observações</p><p>{reconciliation.notes}</p></div> : null}<MovementTable rows={rows} compact /></div>;
}

function CommissionsPanel({ data, activeView }: { data: FinancialWorkspaceData; activeView: FinancialSubsection }) {
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ id: string; action: "approve" | "cancel" } | null>(null);
  const [settlementTargetId, setSettlementTargetId] = useState<string | null>(null);
  const editingRule = editingRuleId ? data.commissionRules.find((item) => item.id === editingRuleId) ?? null : null;
  const statusCommission = statusTarget ? data.commissions.find((item) => item.id === statusTarget.id) ?? null : null;
  const settlementCommission = settlementTargetId ? data.commissions.find((item) => item.id === settlementTargetId) ?? null : null;
  const rows = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        professional: string;
        billedCents: number;
        receivedCents: number;
        openCents: number;
        appointments: number;
      }
    >();

    data.entries
      .filter((entry) => entry.entry_type === "receivable" && entry.professional_member_id)
      .forEach((entry) => {
        const id = entry.professional_member_id ?? "unknown";
        const current = map.get(id) ?? {
          id,
          professional: entry.professional?.profile?.full_name ?? "Profissional não identificado",
          billedCents: 0,
          receivedCents: 0,
          openCents: 0,
          appointments: 0,
        };

        current.billedCents += totalEntryCents(entry);
        current.receivedCents += entry.paid_cents;
        current.openCents += openEntryCents(entry);
        current.appointments += 1;
        map.set(id, current);
      });

    return [...map.values()].sort((a, b) => b.receivedCents - a.receivedCents);
  }, [data.entries]);

  const totalReceived = rows.reduce((sum, row) => sum + row.receivedCents, 0);
  const pendingCommissionCents = data.commissions.filter((item) => item.status === "pending").reduce((sum, item) => sum + item.commission_cents, 0);
  const approvedCommissionCents = data.commissions.filter((item) => item.status === "approved").reduce((sum, item) => sum + item.commission_cents, 0);
  const paidCommissionCents = data.commissions.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.commission_cents, 0);

  const table = (
    <section className="rounded-lg border bg-card">
      <div className="border-b p-4">
        <p className="font-medium">Produção por profissional</p>
        <p className="mt-1 text-sm text-muted-foreground">Base operacional para cálculo de comissões e acertos futuros.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Profissional</th>
              <th className="px-4 py-3 text-right font-medium">Atendimentos</th>
              <th className="px-4 py-3 text-right font-medium">Faturado</th>
              <th className="px-4 py-3 text-right font-medium">Recebido</th>
              <th className="px-4 py-3 text-right font-medium">Em aberto</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{row.professional}</td>
                  <td className="px-4 py-3 text-right">{row.appointments}</td>
                  <td className="px-4 py-3 text-right">{formatCurrencyBRL(row.billedCents)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrencyBRL(row.receivedCents)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrencyBRL(row.openCents)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nenhum recebimento vinculado a profissional.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const visibleCommissions = data.commissions.filter((item) => {
    if (activeView === "commissions-due") return item.status === "pending" || item.status === "approved";
    if (activeView === "settlements" || activeView === "receipts") return item.status === "paid";
    return true;
  });
  const commissionTable = (
    <section className="rounded-lg border bg-card">
      <div className="border-b p-4"><p className="font-medium">Repasses por profissional</p><p className="mt-1 text-sm text-muted-foreground">Histórico rastreável da origem ao acerto financeiro.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[880px] table-fixed text-[13px]"><thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground"><tr><th className="w-52 px-3 py-2.5">Profissional</th><th className="w-56 px-3 py-2.5">Origem</th><th className="w-28 px-3 py-2.5 text-right">Base</th><th className="w-28 px-3 py-2.5 text-right">Comissão</th><th className="w-28 px-3 py-2.5">Status</th><th className="w-48 px-3 py-2.5 text-right">Ações</th></tr></thead><tbody>{visibleCommissions.length ? visibleCommissions.map((item) => <tr key={item.id} className="border-t"><td className="truncate px-3 py-2.5 font-medium" title={item.professional?.profile?.full_name ?? "Profissional"}>{item.professional?.profile?.full_name ?? "Profissional"}</td><td className="truncate px-3 py-2.5" title={item.entry?.description ?? "Lançamento"}>{item.entry?.description ?? "Lançamento financeiro"}</td><td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatCurrencyBRL(item.base_amount_cents)}</td><td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{formatCurrencyBRL(item.commission_cents)}</td><td className="px-3 py-2.5"><Badge className={item.status === "paid" ? "bg-emerald-500/10 text-emerald-700" : item.status === "approved" ? "bg-sky-500/10 text-sky-700" : item.status === "cancelled" ? "bg-rose-500/10 text-rose-700" : "bg-amber-500/10 text-amber-700"}>{item.status === "paid" ? "Pago" : item.status === "approved" ? "Aprovado" : item.status === "cancelled" ? "Cancelado" : "Pendente"}</Badge></td><td className="px-3 py-2.5"><div className="flex justify-end gap-1">{item.status === "pending" && data.access.canApprove ? <Button size="sm" variant="outline" onClick={() => setStatusTarget({ id: item.id, action: "approve" })}><CheckCircle2 />Aprovar</Button> : null}{item.status === "approved" && data.access.canManage ? <Button size="sm" onClick={() => setSettlementTargetId(item.id)}><Banknote />Pagar</Button> : null}{item.status !== "paid" && item.status !== "cancelled" && data.access.canApprove ? <Button size="icon" variant="ghost" title="Cancelar" onClick={() => setStatusTarget({ id: item.id, action: "cancel" })}><XCircle /></Button> : null}{item.status === "paid" ? <span className="text-xs text-muted-foreground">{formatDate(item.paid_at)}</span> : null}</div></td></tr>) : <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhuma comissão nesta etapa.</td></tr>}</tbody></table></div>
    </section>
  );

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div><h2 className="font-semibold">Comissões e repasses</h2><p className="mt-1 text-sm text-muted-foreground">Regras, cálculo, aprovação, pagamento e histórico por profissional.</p></div>
        <div className="flex gap-2"><Button variant="outline" disabled={!data.access.canManage} onClick={() => setGenerating(true)}><Calculator />Calcular</Button><Button disabled={!data.access.canManage} onClick={() => { setEditingRuleId(null); setRuleOpen(true); }}><Plus />Nova regra</Button></div>
      </header>
      <div className="grid gap-3 lg:grid-cols-4">
        <MetricCard label="A calcular" value={formatCurrencyBRL(pendingCommissionCents)} description="Aguardando aprovação" tone="warning" />
        <MetricCard label="A pagar" value={formatCurrencyBRL(approvedCommissionCents)} description="Repasses aprovados" />
        <MetricCard label="Pago" value={formatCurrencyBRL(paidCommissionCents)} description="Acertos concluídos" tone="success" />
        <MetricCard label="Produção recebida" value={formatCurrencyBRL(totalReceived)} description={`${rows.length} profissional(is)`} />
      </div>

      {activeView === "rules" ? (
        <section className="rounded-lg border bg-card">
          <div className="border-b p-4"><p className="font-medium">Regras de comissão</p><p className="mt-1 text-sm text-muted-foreground">A regra mais específica por profissional e serviço tem prioridade.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[780px] table-fixed text-[13px]"><thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground"><tr><th className="w-48 px-3 py-2.5">Profissional</th><th className="w-48 px-3 py-2.5">Serviço</th><th className="w-28 px-3 py-2.5">Regra</th><th className="w-28 px-3 py-2.5">Base</th><th className="w-24 px-3 py-2.5">Status</th><th className="w-24 px-3 py-2.5 text-right">Ações</th></tr></thead><tbody>{data.commissionRules.length ? data.commissionRules.map((rule) => <tr key={rule.id} className="border-t"><td className="truncate px-3 py-2.5" title={rule.professional?.profile?.full_name ?? "Todos"}>{rule.professional?.profile?.full_name ?? "Todos"}</td><td className="truncate px-3 py-2.5" title={rule.service?.name ?? "Todos"}>{rule.service?.name ?? "Todos"}</td><td className="px-3 py-2.5 font-medium">{rule.rule_type === "percent" ? `${(rule.value_bps / 100).toLocaleString("pt-BR")}%` : formatCurrencyBRL(rule.value_cents)}</td><td className="px-3 py-2.5">{rule.calculate_on === "received" ? "Recebido" : "Faturado"}</td><td className="px-3 py-2.5"><Badge className={rule.active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}>{rule.active ? "Ativa" : "Inativa"}</Badge></td><td className="px-3 py-2.5 text-right"><Button size="sm" variant="outline" onClick={() => { setEditingRuleId(rule.id); setRuleOpen(true); }}><Eye />Editar</Button></td></tr>) : <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhuma regra cadastrada.</td></tr>}</tbody></table></div>
        </section>
      ) : null}

      {activeView === "production" || activeView === "reports" ? table : null}

      {activeView === "commissions-due" ? (
        commissionTable
      ) : null}

      {activeView === "settlements" || activeView === "receipts" ? (
        commissionTable
      ) : null}

      {activeView === "rules" ? null : activeView !== "production" && activeView !== "reports" && activeView !== "commissions-due" && activeView !== "settlements" && activeView !== "receipts" ? table : null}
      <Modal open={ruleOpen} onOpenChange={(open) => { setRuleOpen(open); if (!open) setEditingRuleId(null); }} title={editingRule ? "Editar regra de comissão" : "Nova regra de comissão"} description="Regras específicas substituem regras gerais no cálculo." className="max-w-3xl"><CommissionRuleForm rule={editingRule} professionals={data.professionals} services={data.services} onCompleted={() => { setRuleOpen(false); setEditingRuleId(null); }} /></Modal>
      <Modal open={generating} onOpenChange={setGenerating} title="Calcular comissões" description="O cálculo usa produção financeira confirmada e evita duplicidades." className="max-w-lg"><GenerateCommissionsForm onCompleted={() => setGenerating(false)} /></Modal>
      <Modal open={Boolean(statusCommission)} onOpenChange={(open) => { if (!open) setStatusTarget(null); }} title={statusTarget?.action === "approve" ? "Aprovar comissão" : "Cancelar comissão"} className="max-w-lg">{statusCommission && statusTarget ? <CommissionStatusForm commission={statusCommission} actionType={statusTarget.action} onCompleted={() => setStatusTarget(null)} /> : null}</Modal>
      <Modal open={Boolean(settlementCommission)} onOpenChange={(open) => { if (!open) setSettlementTargetId(null); }} title="Pagar comissão" description="O acerto será lançado em contas a pagar e no livro-caixa." className="max-w-2xl">{settlementCommission ? <CommissionSettlementForm commission={settlementCommission} accounts={data.accounts} paymentMethods={data.paymentMethods} onCompleted={() => setSettlementTargetId(null)} /> : null}</Modal>
    </div>
  );
}

function PreferencesPanel({
  preferences,
  canManage,
  activeView,
}: {
  preferences: FinancialPreferences | null;
  canManage: boolean;
  activeView: FinancialSubsection;
}) {
  const [open, setOpen] = useState(false);
  if (!preferences) return null;
  const viewCopy =
    activeView === "permissions"
      ? { title: "Permissões financeiras", description: "Resumo operacional de quem deve acessar, baixar, estornar, conciliar e exportar dados financeiros." }
      : activeView === "documents"
        ? { title: "Documentos e recibos", description: "Rodapé, padrões de emissão e rastreabilidade dos documentos financeiros." }
        : activeView === "policies"
          ? { title: "Políticas de estorno", description: "Regras de correção, estorno e reabertura para proteger o caixa e a auditoria." }
          : { title: "Cobrança operacional", description: "Regras de cobrança na recepção, pelo profissional, recibos e vencimentos padrão." };

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="font-semibold">{viewCopy.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {viewCopy.description}
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

      {activeView === "permissions" ? (
        <section className="rounded-lg border bg-card p-4">
          <p className="font-medium">Modelo de acesso recomendado</p>
          <div className="mt-3 grid gap-3 text-sm text-muted-foreground lg:grid-cols-4">
            <InfoBox label="Recepção" value="Cobrança de atendimento e recibo, sem visão completa do financeiro" />
            <InfoBox label="Financeiro" value="Baixas, estornos, relatórios, contas e conciliação" />
            <InfoBox label="Admin da clínica" value="Preferências, permissões, cadastros e reaberturas" />
            <InfoBox label="Auditoria" value="Toda alteração crítica gera rastro financeiro e operacional" />
          </div>
        </section>
      ) : null}

      {activeView === "documents" ? (
        <section className="rounded-lg border bg-card p-4">
          <p className="font-medium">Padrão de documentos</p>
          <div className="mt-3 grid gap-3 text-sm text-muted-foreground lg:grid-cols-3">
            <InfoBox label="Rodapé atual" value={preferences.receipt_footer ?? "Não configurado"} />
            <InfoBox label="Recibos" value="Emitidos por baixa, com histórico por lançamento e paciente" />
            <InfoBox label="Ciência de pagamento" value="Disponível para cobranças em aberto" />
          </div>
        </section>
      ) : null}

      {activeView === "policies" ? (
        <section className="rounded-lg border bg-card p-4">
          <p className="font-medium">Proteções financeiras</p>
          <div className="mt-3 grid gap-3 text-sm text-muted-foreground lg:grid-cols-3">
            <InfoBox label="Estorno" value="Exige motivo e mantém histórico do pagamento original" />
            <InfoBox label="Conciliação" value="Movimentos conciliados ficam bloqueados até reabertura autorizada" />
            <InfoBox label="Correção" value="Alterações sensíveis devem ser feitas por fluxo formal e auditável" />
          </div>
        </section>
      ) : null}

      <Modal open={open} onOpenChange={setOpen} title="Preferências financeiras" className="max-w-4xl">
        <FinancialPreferencesForm preferences={preferences} onCompleted={() => setOpen(false)} />
      </Modal>
    </div>
  );
}
