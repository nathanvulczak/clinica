export type FinancialSection =
  | "overview"
  | "receivables"
  | "payables"
  | "accounts"
  | "reconciliation"
  | "commissions"
  | "settings";

export type FinancialSubsection =
  | "dashboard"
  | "open"
  | "charge"
  | "settle"
  | "reversals"
  | "receipts"
  | "delinquency"
  | "reports"
  | "vendors"
  | "recurring"
  | "accounts"
  | "payment-methods"
  | "card-machines"
  | "categories"
  | "cost-centers"
  | "health-plans"
  | "statements"
  | "close-period"
  | "pending"
  | "history"
  | "divergences"
  | "imports"
  | "rules"
  | "production"
  | "commissions-due"
  | "settlements"
  | "billing"
  | "permissions"
  | "documents"
  | "policies";

export type FinancialNavItem = {
  key: FinancialSection;
  label: string;
  icon: "overview" | "receivables" | "payables" | "accounts" | "reconciliation" | "commissions" | "settings";
  children: Array<{ key: FinancialSubsection; label: string; hint?: string }>;
};

export const financialSections: FinancialNavItem[] = [
  {
    key: "overview",
    label: "Visão geral",
    icon: "overview",
    children: [
      { key: "dashboard", label: "Painel executivo" },
      { key: "pending", label: "Pendências" },
      { key: "reports", label: "Indicadores" },
    ],
  },
  {
    key: "receivables",
    label: "Recebimentos",
    icon: "receivables",
    children: [
      { key: "open", label: "Contas a receber", hint: "Aberto, parcial e vencido" },
      { key: "charge", label: "Cobranças de atendimentos" },
      { key: "settle", label: "Baixar recebimento" },
      { key: "reversals", label: "Estornos" },
      { key: "receipts", label: "Recibos" },
      { key: "delinquency", label: "Inadimplência" },
      { key: "reports", label: "Relatórios" },
    ],
  },
  {
    key: "payables",
    label: "Pagamentos",
    icon: "payables",
    children: [
      { key: "open", label: "Contas a pagar", hint: "Aberto, parcial e vencido" },
      { key: "settle", label: "Baixar pagamento" },
      { key: "reversals", label: "Estornos" },
      { key: "vendors", label: "Fornecedores" },
      { key: "recurring", label: "Recorrentes" },
      { key: "reports", label: "Relatórios" },
    ],
  },
  {
    key: "accounts",
    label: "Cadastros",
    icon: "accounts",
    children: [
      { key: "accounts", label: "Contas e caixas" },
      { key: "payment-methods", label: "Formas de pagamento" },
      { key: "card-machines", label: "Máquinas de cartão" },
      { key: "categories", label: "Categorias" },
      { key: "cost-centers", label: "Centros de custo" },
      { key: "vendors", label: "Fornecedores" },
      { key: "health-plans", label: "Convênios" },
    ],
  },
  {
    key: "reconciliation",
    label: "Contas e conciliação",
    icon: "reconciliation",
    children: [
      { key: "statements", label: "Extratos" },
      { key: "close-period", label: "Conciliar período" },
      { key: "pending", label: "Pendentes" },
      { key: "history", label: "Histórico" },
      { key: "divergences", label: "Divergências" },
      { key: "imports", label: "Importações bancárias" },
      { key: "reports", label: "Relatórios" },
    ],
  },
  {
    key: "commissions",
    label: "Comissões",
    icon: "commissions",
    children: [
      { key: "rules", label: "Regras" },
      { key: "production", label: "Produção por profissional" },
      { key: "commissions-due", label: "Comissões a pagar" },
      { key: "settlements", label: "Acertos" },
      { key: "receipts", label: "Recibos de repasse" },
      { key: "reports", label: "Relatórios" },
    ],
  },
  {
    key: "settings",
    label: "Preferências",
    icon: "settings",
    children: [
      { key: "billing", label: "Cobrança operacional" },
      { key: "permissions", label: "Permissões financeiras" },
      { key: "documents", label: "Documentos e recibos" },
      { key: "policies", label: "Políticas de estorno" },
    ],
  },
];

export function getDefaultFinancialSubsection(section: FinancialSection): FinancialSubsection {
  return financialSections.find((item) => item.key === section)?.children[0]?.key ?? "dashboard";
}

export function isValidFinancialSubsection(section: FinancialSection, view?: string): view is FinancialSubsection {
  return Boolean(view && financialSections.find((item) => item.key === section)?.children.some((child) => child.key === view));
}
