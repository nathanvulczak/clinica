"use client";

import { Beaker, FileText, GitBranch, LineChart, Sparkles, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getClinicalSpecialty,
  getClinicalSpecialtyExperience,
} from "@/config/clinical-specialties";

function ChipList({ items, limit }: { items: string[]; limit?: number }) {
  const visible = typeof limit === "number" ? items.slice(0, limit) : items;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((item) => (
        <span key={item} className="rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground">
          {item}
        </span>
      ))}
      {limit && items.length > limit ? (
        <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          +{items.length - limit}
        </span>
      ) : null}
    </div>
  );
}

export function SpecialtyExperiencePanel({
  specialty,
  variant = "full",
}: {
  specialty: string | null | undefined;
  variant?: "compact" | "full";
}) {
  const definition = getClinicalSpecialty(specialty);
  const experience = getClinicalSpecialtyExperience(specialty);

  if (variant === "compact") {
    return (
      <div className="rounded-md border bg-muted/15 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <p className="text-sm font-semibold">Experiencia ativada: {definition.shortLabel}</p>
          <Badge className="bg-primary/10 text-primary">{definition.suggestedCouncil}</Badge>
          {definition.visualMap ? <Badge className="bg-muted text-muted-foreground">Mapa visual</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{definition.description}</p>
        <div className="mt-3">
          <ChipList items={experience.serviceSuggestions} limit={4} />
        </div>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Stethoscope className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Workspace {definition.shortLabel}</p>
              <Badge className="bg-primary/10 text-primary">{definition.suggestedCouncil}</Badge>
              {definition.visualMap ? <Badge className="bg-muted text-muted-foreground">Mapa {definition.visualMap.replaceAll("_", " ")}</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{definition.description}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-3 p-4 xl:grid-cols-[1.15fr_1fr_1fr]">
        <div className="rounded-md border bg-muted/10 p-3">
          <div className="mb-3 flex items-center gap-2">
            <GitBranch className="size-4 text-primary" />
            <p className="text-xs font-semibold uppercase text-muted-foreground">Fluxo recomendado</p>
          </div>
          <ol className="grid gap-2">
            {experience.workflowSteps.map((step, index) => (
              <li key={step} className="grid grid-cols-[22px_1fr] items-start gap-2 text-xs">
                <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="grid gap-3">
          <div className="rounded-md border bg-background p-3">
            <div className="mb-2 flex items-center gap-2">
              <LineChart className="size-4 text-primary" />
              <p className="text-xs font-semibold uppercase text-muted-foreground">Indicadores</p>
            </div>
            <ChipList items={experience.keyIndicators} />
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="mb-2 flex items-center gap-2">
              <Beaker className="size-4 text-primary" />
              <p className="text-xs font-semibold uppercase text-muted-foreground">Exames frequentes</p>
            </div>
            <ChipList items={experience.suggestedExams} limit={6} />
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-md border bg-background p-3">
            <div className="mb-2 flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <p className="text-xs font-semibold uppercase text-muted-foreground">Documentos sugeridos</p>
            </div>
            <div className="grid gap-1.5">
              {experience.documentTemplates.map((template) => (
                <div key={template.key} className="rounded-md bg-muted/35 px-2.5 py-2 text-xs">
                  <p className="font-medium">{template.title}</p>
                  <p className="mt-0.5 text-muted-foreground">{template.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {experience.deduplicationHints.length ? (
        <div className="border-t bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
          <p className="font-semibold">Evitar duplicidade de informacao</p>
          <ul className="mt-1 grid gap-1">
            {experience.deduplicationHints.map((hint) => (
              <li key={hint}>- {hint}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
