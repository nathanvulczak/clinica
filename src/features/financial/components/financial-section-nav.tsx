"use client";

import Link from "next/link";
import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FinancialSection =
  | "overview"
  | "receivables"
  | "payables"
  | "accounts"
  | "reconciliation"
  | "commissions"
  | "settings";

const sections: Array<{ key: FinancialSection; label: string }> = [
  { key: "overview", label: "Visao geral" },
  { key: "receivables", label: "Recebimentos" },
  { key: "payables", label: "Pagamentos" },
  { key: "accounts", label: "Cadastros" },
  { key: "reconciliation", label: "Contas e conciliacao" },
  { key: "commissions", label: "Comissoes" },
  { key: "settings", label: "Preferencias" },
];

export function FinancialSectionNav({ activeSection }: { activeSection: FinancialSection }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-3">
      <nav className="flex gap-2 overflow-x-auto border-b pb-3">
        {sections.map((section) => (
          <Button
            key={section.key}
            asChild
            size="sm"
            variant={activeSection === section.key ? "secondary" : "ghost"}
            onClick={() => startTransition(() => undefined)}
          >
            <Link href={`/financeiro?section=${section.key}`}>{section.label}</Link>
          </Button>
        ))}
      </nav>
      {pending ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <LoaderCircle className="size-3 animate-spin" />
          Carregando area financeira...
        </div>
      ) : null}
    </div>
  );
}
