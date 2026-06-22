"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MedicalTimelineEvent } from "@/repositories/medical-records";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function toneClass(tone: MedicalTimelineEvent["tone"]) {
  if (tone === "success") return "border-emerald-500 bg-emerald-500";
  if (tone === "warning") return "border-amber-500 bg-amber-500";
  if (tone === "critical") return "border-destructive bg-destructive";
  return "border-primary bg-primary";
}

export function MedicalTimelinePanel({ events }: { events: MedicalTimelineEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleEvents = expanded ? events.slice(0, 40) : [];

  return (
    <section className="grid gap-3 rounded-lg border bg-card p-3.5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="font-medium">Linha do tempo clínica</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Histórico consolidado do atendimento, documentos, anexos, comentários e correções.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {events.length
              ? `${events.length} evento${events.length === 1 ? "" : "s"} registrado${events.length === 1 ? "" : "s"}.`
              : "Nenhum evento registrado ainda."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <ChevronDown className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
          {expanded ? "Recolher" : "Expandir"}
        </Button>
      </div>

      {expanded ? (
        events.length ? (
          <div className="grid gap-0">
            {visibleEvents.map((event, index) => (
              <div key={`${event.type}-${event.id}`} className="grid grid-cols-[18px_1fr] gap-3">
                <div className="relative flex justify-center">
                  <span className={`mt-1 size-3 rounded-full border ${toneClass(event.tone)}`} />
                  {index < visibleEvents.length - 1 ? (
                    <span className="absolute top-5 h-full w-px bg-border" />
                  ) : null}
                </div>
                <div className="pb-4">
                  <div className="rounded-md border bg-background p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(event.occurred_at)}</p>
                    </div>
                    <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{event.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            A linha do tempo será preenchida conforme o atendimento avançar.
          </div>
        )
      ) : null}
    </section>
  );
}
