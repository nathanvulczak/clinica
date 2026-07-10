import Link from "next/link";
import { AlertTriangle, ArrowRight, Beaker, CheckCircle2, Clock3, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DiagnosticOrder } from "@/repositories/diagnostics";

export type ClinicalDiagnosticSummary = Array<
  Pick<DiagnosticOrder, "id" | "order_number" | "category" | "priority" | "status" | "created_at" | "items">
>;

const orderStatusLabels: Record<string, string> = {
  requested: "Solicitado",
  scheduled: "Agendado",
  collected: "Coletado",
  partial: "Resultado parcial",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const flagLabels: Record<string, string> = {
  normal: "Normal",
  low: "Baixo",
  high: "Alto",
  critical: "Crítico",
  abnormal: "Alterado",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function latestResult(item: ClinicalDiagnosticSummary[number]["items"][number]) {
  return [...item.results]
    .filter((result) => result.status === "final" || result.status === "preliminary")
    .sort((left, right) => new Date(right.resulted_at).getTime() - new Date(left.resulted_at).getTime())[0] ?? null;
}

function resultValue(result: ReturnType<typeof latestResult>) {
  if (!result) return "Resultado pendente";
  if (result.value_numeric !== null && result.value_numeric !== undefined) {
    return `${result.value_numeric}${result.unit ? ` ${result.unit}` : ""}`;
  }
  return result.value_text?.trim() || "Resultado textual registrado";
}

export function ClinicalExamsPanel({ orders }: { orders: ClinicalDiagnosticSummary }) {
  const items = orders.flatMap((order) => order.items.map((item) => ({ order, item, result: latestResult(item) })));
  const criticalCount = items.filter(({ result }) => result?.flag === "critical").length;
  const alteredCount = items.filter(({ result }) => result && result.flag !== "normal").length;
  const pendingCount = items.filter(({ result }) => !result).length;

  return (
    <section className="grid gap-3 rounded-md border bg-card p-3.5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-violet-500/10 text-violet-700">
            <Beaker className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Exames vinculados ao atendimento</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Resultados versionados e solicitações relacionadas a este prontuário.
            </p>
          </div>
        </div>
        <Link
          href="/exames?section=overview"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Central de exames <ExternalLink className="size-3.5" />
        </Link>
      </header>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border bg-background px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Solicitações</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{orders.length}</p>
        </div>
        <div className={`rounded-md border px-3 py-2 ${alteredCount ? "border-amber-200 bg-amber-50/70" : "bg-background"}`}>
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Alterados / críticos</p>
          <p className={`mt-1 text-lg font-semibold tabular-nums ${criticalCount ? "text-destructive" : alteredCount ? "text-amber-700" : ""}`}>
            {alteredCount}
          </p>
        </div>
        <div className="rounded-md border bg-background px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Pendentes</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{pendingCount}</p>
        </div>
      </div>

      {orders.length ? (
        <div className="grid gap-2">
          {orders.map((order) => (
            <article key={order.id} className="overflow-hidden rounded-md border bg-background">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="selectable font-mono text-xs font-medium">{order.order_number}</span>
                  <Badge className="border-0 bg-muted text-[10px] text-muted-foreground">
                    {orderStatusLabels[order.status] ?? order.status}
                  </Badge>
                  {order.priority !== "normal" ? <Badge className="border-0 bg-amber-500/10 text-[10px] text-amber-700">Prioridade {order.priority}</Badge> : null}
                </div>
                <Link
                  href={`/exames?section=overview&query=${encodeURIComponent(order.order_number)}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  Abrir pedido <ArrowRight className="size-3" />
                </Link>
              </div>

              <div className="divide-y">
                {order.items.map((item) => {
                  const result = latestResult(item);
                  const isCritical = result?.flag === "critical";
                  const isAltered = Boolean(result && result.flag !== "normal");

                  return (
                    <div key={item.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.9fr)] sm:items-start">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{item.name}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {result ? `Resultado ${result.status === "final" ? "validado" : "preliminar"} em ${formatDate(result.resulted_at)}` : "Aguardando lançamento de resultado"}
                        </p>
                        {result?.interpretation ? <p className="selectable mt-1 text-[11px] leading-4 text-muted-foreground">{result.interpretation}</p> : null}
                      </div>
                      <div className="rounded-md border bg-muted/15 px-2.5 py-2 sm:text-right">
                        <div className="flex items-center justify-between gap-2 sm:justify-end">
                          <span className="text-[10px] uppercase text-muted-foreground">Valor</span>
                          {result ? (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${isCritical ? "text-destructive" : isAltered ? "text-amber-700" : "text-emerald-700"}`}>
                              {isCritical || isAltered ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3" />}
                              {flagLabels[result.flag] ?? result.flag}
                            </span>
                          ) : <Clock3 className="size-3 text-muted-foreground" />}
                        </div>
                        <p className={`selectable mt-1 text-sm font-semibold ${isCritical ? "text-destructive" : ""}`}>{resultValue(result)}</p>
                        {result?.reference_range ? <p className="mt-0.5 text-[10px] text-muted-foreground">Referência: {result.reference_range}</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed px-4 py-8 text-center">
          <p className="text-sm font-medium">Nenhum exame vinculado</p>
          <p className="mt-1 text-xs text-muted-foreground">As solicitações associadas ao atendimento aparecerão neste painel.</p>
        </div>
      )}
    </section>
  );
}
