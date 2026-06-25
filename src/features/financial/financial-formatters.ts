import type { FinancialEntryWithRelations } from "@/repositories/financial";

export const financialStatusLabels: Record<string, string> = {
  pending: "Em aberto",
  partial: "Parcial",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
  refunded: "Estornado",
};

export const financialEntryEventLabels: Record<string, string> = {
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

export function financialDocumentTypeLabel(value: string | null | undefined) {
  return documentTypeLabels[value ?? "other"] ?? "Outro";
}

export function financialFrequencyLabel(value: string) {
  if (value === "weekly") return "Semanal";
  if (value === "quarterly") return "Trimestral";
  if (value === "yearly") return "Anual";
  return "Mensal";
}

export function totalEntryCents(entry: FinancialEntryWithRelations) {
  return entry.amount_cents - entry.discount_cents + (entry.freight_cents ?? 0) + entry.addition_cents;
}

export function openEntryCents(entry: FinancialEntryWithRelations) {
  return Math.max(totalEntryCents(entry) - entry.paid_cents, 0);
}

export function formatFinancialDate(value: string | null | undefined) {
  if (!value) return "Não informado";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export function formatFinancialDateTime(value: string | null | undefined) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
