"use client";

import { Activity, CheckCircle2, Ruler, ShieldAlert, Smile, Sparkles, Target, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getClinicalWorkspaceConfig } from "@/config/clinical-workspaces";
import type { ClinicalFormResponseMetadata, ClinicalFormResponses } from "@/features/medical-records/clinical-form-schema";

function objectValue(value: ClinicalFormResponseMetadata | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, ClinicalFormResponseMetadata>)
    : {};
}

function numberValue(responses: ClinicalFormResponses, key: string) {
  const value = responses[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(responses: ClinicalFormResponses, key: string) {
  const value = responses[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function visualEntries(value: ClinicalFormResponseMetadata | undefined) {
  const entries = objectValue(value).entries;
  return entries && typeof entries === "object" && !Array.isArray(entries)
    ? Object.values(entries as Record<string, ClinicalFormResponseMetadata>).map(objectValue)
    : [];
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
}

export function SpecialtyWorkspaceSummary({
  specialtySlug,
  responses,
  visualMap,
}: {
  specialtySlug: string;
  responses: ClinicalFormResponses;
  visualMap: ClinicalFormResponseMetadata | undefined;
}) {
  const workspace = getClinicalWorkspaceConfig(specialtySlug);
  const entries = visualEntries(visualMap);
  const cards: Array<{ label: string; value: string; icon: typeof Activity; tone?: string }> = [];

  if (workspace.slug === "nutrition") {
    const weight = numberValue(responses, "current_weight");
    const height = numberValue(responses, "height_cm");
    const bmi = weight && height ? weight / Math.pow(height / 100, 2) : null;
    cards.push({ label: "Peso atual", value: weight ? `${formatNumber(weight)} kg` : "Não informado", icon: Activity });
    cards.push({ label: "IMC calculado", value: bmi ? formatNumber(bmi) : "Aguardando medidas", icon: Ruler, tone: "text-primary" });
    cards.push({ label: "Medidas no mapa", value: `${entries.length}`, icon: Target });
  } else if (workspace.slug === "dentistry") {
    const treated = entries.filter((entry) => ["treated", "restored", "treatment"].includes(String(entry.status))).length;
    const attention = entries.filter((entry) => ["attention", "altered", "caries"].includes(String(entry.status))).length;
    cards.push({ label: "Dentes registrados", value: `${entries.length}`, icon: Smile });
    cards.push({ label: "Em atenção", value: `${attention}`, icon: ShieldAlert, tone: attention ? "text-amber-700" : undefined });
    cards.push({ label: "Tratados", value: `${treated}`, icon: CheckCircle2, tone: treated ? "text-emerald-700" : undefined });
  } else if (workspace.slug === "aesthetics" || workspace.slug === "dermatology") {
    const areas = responses.aesthetic_area;
    const areaCount = Array.isArray(areas) ? areas.length : entries.length;
    const product = stringValue(responses, "products_used");
    const consent = responses.photo_consent === true || responses.photo_consent === "true";
    cards.push({ label: "Áreas mapeadas", value: `${areaCount}`, icon: UserRound });
    cards.push({ label: "Registro fotográfico", value: consent ? "Consentido" : "Não informado", icon: Sparkles, tone: consent ? "text-emerald-700" : "text-amber-700" });
    cards.push({ label: "Produtos/lotes", value: product ? "Registrados" : "Pendente", icon: ShieldAlert, tone: product ? "text-emerald-700" : "text-amber-700" });
  } else {
    cards.push({ label: "Foco clínico", value: workspace.focus[0] ?? "Avaliação", icon: Activity });
    cards.push({ label: "Indicadores", value: `${workspace.metrics.length}`, icon: Target });
    cards.push({ label: "Mapa visual", value: workspace.visualTool, icon: UserRound });
  }

  return (
    <section className="grid gap-3 rounded-md border bg-muted/10 p-3" aria-label={workspace.title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Resumo da especialidade</p>
            <Badge className="bg-primary/10 text-primary">{workspace.visualTool}</Badge>
          </div>
          <p className="mt-1 text-sm font-medium">{workspace.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{workspace.description}</p>
        </div>
        <div className="flex max-w-md flex-wrap gap-1.5">
          {workspace.focus.map((item) => <span key={item} className="rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground">{item}</span>)}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-md border bg-background px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</span>
              <Icon className={`size-3.5 ${tone ?? "text-primary"}`} />
            </div>
            <p className={`mt-1 text-sm font-semibold ${tone ?? "text-foreground"}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-[11px] text-amber-900">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>{workspace.safetyNote}</span>
      </div>
    </section>
  );
}
