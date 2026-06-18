"use client";

import Link from "next/link";
import { useTransition } from "react";
import {
  Banknote,
  BarChart3,
  ClipboardList,
  CreditCard,
  Landmark,
  LoaderCircle,
  ReceiptText,
  Settings2,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  | "rules"
  | "production"
  | "commissions-due"
  | "settlements"
  | "billing"
  | "permissions"
  | "documents"
  | "policies";

type FinancialNavItem = {
  key: FinancialSection;
  label: string;
  icon: typeof Landmark;
  children: Array<{ key: FinancialSubsection; label: string; hint?: string }>;
};

const sections: FinancialNavItem[] = [
  {
    key: "overview",
    label: "Visão geral",
    icon: BarChart3,
    children: [
      { key: "dashboard", label: "Painel executivo" },
      { key: "pending", label: "Pendências" },
      { key: "reports", label: "Indicadores" },
    ],
  },
  {
    key: "receivables",
    label: "Recebimentos",
    icon: ReceiptText,
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
    icon: Banknote,
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
    icon: ClipboardList,
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
    icon: Landmark,
    children: [
      { key: "statements", label: "Extratos" },
      { key: "close-period", label: "Conciliar período" },
      { key: "pending", label: "Pendentes" },
      { key: "history", label: "Histórico" },
      { key: "divergences", label: "Divergências" },
      { key: "reports", label: "Relatórios" },
    ],
  },
  {
    key: "commissions",
    label: "Comissões",
    icon: TrendingUp,
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
    icon: Settings2,
    children: [
      { key: "billing", label: "Cobrança operacional" },
      { key: "permissions", label: "Permissões financeiras" },
      { key: "documents", label: "Documentos e recibos" },
      { key: "policies", label: "Políticas de estorno" },
    ],
  },
];

function sectionHref(section: FinancialSection, view?: FinancialSubsection) {
  const params = new URLSearchParams({ section });
  if (view) params.set("view", view);
  return `/financeiro?${params.toString()}`;
}

export function getDefaultFinancialSubsection(section: FinancialSection): FinancialSubsection {
  return sections.find((item) => item.key === section)?.children[0]?.key ?? "dashboard";
}

export function isValidFinancialSubsection(section: FinancialSection, view?: string): view is FinancialSubsection {
  return Boolean(view && sections.find((item) => item.key === section)?.children.some((child) => child.key === view));
}

export function FinancialSectionNav({
  activeSection,
  activeView,
  clinicName,
}: {
  activeSection: FinancialSection;
  activeView: FinancialSubsection;
  clinicName?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const active = sections.find((section) => section.key === activeSection) ?? sections[0];

  return (
    <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b bg-background/95 px-4 pt-3 shadow-sm backdrop-blur lg:-mx-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <CreditCard className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-none">Financeiro</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {clinicName ? `${clinicName} · controle financeiro` : "Selecione uma clínica para operar"}
              </p>
            </div>
          </div>
        </div>
        <Badge className="h-7 rounded-md border bg-background px-2 text-xs text-muted-foreground">
          Módulo operacional
        </Badge>
      </div>

      <nav className="mt-3 flex gap-1 overflow-x-auto pb-2" aria-label="Áreas do financeiro">
        {sections.map((section) => {
          const Icon = section.icon;
          const selected = activeSection === section.key;
          return (
            <Button
              key={section.key}
              asChild
              size="sm"
              variant={selected ? "secondary" : "ghost"}
              className={cn(
                "h-9 shrink-0 gap-2 rounded-md px-3",
                selected && "border border-border bg-card shadow-sm",
              )}
              onClick={() => startTransition(() => undefined)}
            >
              <Link href={sectionHref(section.key, section.children[0]?.key)}>
                <Icon className="size-4" />
                {section.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      <div className="flex min-h-11 items-center gap-2 overflow-x-auto border-t py-2" aria-label={`Opções de ${active.label}`}>
        {active.children.map((item) => (
          <Button
            key={item.key}
            asChild
            size="sm"
            variant={activeView === item.key ? "secondary" : "ghost"}
            className={cn("h-8 shrink-0 rounded-md px-2.5 text-xs", activeView === item.key && "bg-primary/10 text-primary")}
            title={item.hint}
            onClick={() => startTransition(() => undefined)}
          >
            <Link href={sectionHref(active.key, item.key)}>{item.label}</Link>
          </Button>
        ))}
        {pending ? (
          <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground" role="status">
            <LoaderCircle className="size-3 animate-spin" />
            Carregando
          </div>
        ) : null}
      </div>
    </div>
  );
}
