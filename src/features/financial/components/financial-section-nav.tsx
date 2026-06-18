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
import { financialSections, type FinancialSection, type FinancialSubsection } from "@/features/financial/navigation";

function sectionHref(section: FinancialSection, view?: FinancialSubsection) {
  const params = new URLSearchParams({ section });
  if (view) params.set("view", view);
  return `/financeiro?${params.toString()}`;
}

const iconMap = {
  overview: BarChart3,
  receivables: ReceiptText,
  payables: Banknote,
  accounts: ClipboardList,
  reconciliation: Landmark,
  commissions: TrendingUp,
  settings: Settings2,
};

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
  const active = financialSections.find((section) => section.key === activeSection) ?? financialSections[0];

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
        {financialSections.map((section) => {
          const Icon = iconMap[section.icon];
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
