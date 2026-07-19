import { Check, Circle, LockKeyhole, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ClinicalProtocolRunWorkspace } from "@/repositories/clinical-protocols";

const kindLabels: Record<string, string> = {
  check_in: "Chegada",
  nursing: "Enfermagem",
  clinical_form: "Prontuário",
  checklist: "Checklist",
  billing: "Cobrança",
  document: "Documento",
};

function stepState(
  step: ClinicalProtocolRunWorkspace["steps"][number],
  currentStepKey: string,
  steps: ClinicalProtocolRunWorkspace["steps"],
) {
  const currentPosition = steps.find((item) => item.key === currentStepKey)?.position ?? 0;
  if (step.key === currentStepKey) return "current" as const;
  return step.position < currentPosition ? "complete" as const : "pending" as const;
}

export function ClinicalProtocolRibbon({
  run,
}: {
  run: ClinicalProtocolRunWorkspace | null;
}) {
  if (!run) {
    return (
      <section className="rounded-lg border border-dashed bg-muted/10 px-3.5 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <LockKeyhole className="size-4" />
          <span>Nenhum protocolo publicado foi associado a este atendimento. O fluxo padrão da clínica continua válido.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card px-3.5 py-3" aria-label="Fluxo assistencial do atendimento">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Route className="size-4 text-primary" />
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Fluxo definido pela clínica</p>
            <p className="mt-0.5 text-sm font-semibold">{run.protocolName}</p>
          </div>
        </div>
        <Badge className={run.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-primary/10 text-primary"}>
          {run.status === "completed" ? "Fluxo concluído" : `Versão ${run.versionNumber}`}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {run.steps.map((step) => {
          const state = stepState(step, run.currentStepKey, run.steps);
          return (
            <div
              key={step.key}
              className={`min-w-0 rounded-md border px-2.5 py-2 ${
                state === "current"
                  ? "border-primary/40 bg-primary/5"
                  : state === "complete"
                    ? "border-emerald-200 bg-emerald-50/60"
                    : "bg-muted/10"
              }`}
            >
              <div className="flex items-center gap-2">
                {state === "complete" ? <Check className="size-3.5 text-emerald-700" /> : <Circle className={`size-3.5 ${state === "current" ? "fill-primary text-primary" : "text-muted-foreground"}`} />}
                <span className="truncate text-[11px] font-semibold">{step.title}</span>
              </div>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">{kindLabels[step.kind] ?? "Etapa clínica"}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        A etapa atual é definida pela clínica e fica vinculada à versão do protocolo usada neste atendimento.
      </p>
    </section>
  );
}
