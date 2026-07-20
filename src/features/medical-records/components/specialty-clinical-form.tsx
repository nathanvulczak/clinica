"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Info,
  LockKeyhole,
  SlidersHorizontal,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getClinicalWorkspaceConfig, type ClinicalWorkspaceMode } from "@/config/clinical-workspaces";
import {
  clinicalFormCompletion,
  type ClinicalFormField,
  type ClinicalFormResponseMetadata,
  type ClinicalFormResponseValue,
  type ClinicalFormResponses,
} from "@/features/medical-records/clinical-form-schema";
import { getClinicalFormAnalytics } from "@/features/medical-records/clinical-form-analytics";
import { ClinicalImmersionMap } from "@/features/medical-records/components/clinical-immersion-map";
import type { ClinicalFormTemplate, ClinicalFormWorkspace } from "@/repositories/clinical-forms";
import { SpecialtyWorkspaceSummary } from "@/features/medical-records/components/specialty-workspace-summary";

const inputClass = "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-65";
const textareaClass = "min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-65";

const sourceLabels: Record<ClinicalFormWorkspace["selectionSource"], string> = {
  existing: "Formulário do atendimento",
  assignment: "Definido para serviço/profissional",
  professional: "Especialidade do profissional",
  clinic_default: "Padrão da clínica",
  fallback: "Modelo disponível",
};

function valueAsString(value: ClinicalFormResponseValue | undefined) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function metadataObject(value: ClinicalFormResponseValue | undefined): Record<string, ClinicalFormResponseMetadata> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, ClinicalFormResponseMetadata>)
    : {};
}

function ClinicalField({
  field,
  value,
  disabled,
  onChange,
}: {
  field: ClinicalFormField;
  value: ClinicalFormResponseValue | undefined;
  disabled: boolean;
  onChange: (value: ClinicalFormResponseValue) => void;
}) {
  const alertActive = typeof value === "string" && field.alert_values?.includes(value);
  const label = (
    <span className="flex min-h-5 items-center gap-2 text-xs font-medium">
      {field.label}
      {field.required ? <span className="text-[10px] font-normal text-primary">Obrigatório</span> : null}
      {field.unit ? <span className="text-[10px] font-normal text-muted-foreground">{field.unit}</span> : null}
    </span>
  );

  if (field.type === "textarea") {
    return <label className="grid gap-1.5">{label}<textarea value={valueAsString(value)} disabled={disabled} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} className={textareaClass} /></label>;
  }

  if (field.type === "select") {
    return (
      <label className={`grid gap-1.5 rounded-md ${alertActive ? "bg-destructive/5 p-2 ring-1 ring-destructive/30" : ""}`}>
        {label}
        <select value={valueAsString(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClass}>
          <option value="">Selecione</option>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {alertActive ? <span className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3.5" />Este resultado exige avaliação e conduta documentada.</span> : null}
      </label>
    );
  }

  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="grid gap-1.5">
        <legend>{label}</legend>
        <div className="flex min-h-9 flex-wrap gap-1.5 rounded-md border bg-background p-1.5">
          {field.options?.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label key={option.value} className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs ${checked ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                <input
                  type="checkbox"
                  className="size-3.5"
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => onChange(event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (field.type === "boolean") {
    const booleanValue = typeof value === "boolean" ? String(value) : "";
    return (
      <fieldset className="grid gap-1.5">
        <legend>{label}</legend>
        <div className="grid h-9 grid-cols-3 overflow-hidden rounded-md border bg-background text-xs">
          {[["", "Não informado"], ["true", "Sim"], ["false", "Não"]].map(([optionValue, optionLabel]) => (
            <button key={optionValue || "empty"} type="button" disabled={disabled} className={`border-r px-2 last:border-r-0 ${booleanValue === optionValue ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} onClick={() => onChange(optionValue === "" ? null : optionValue === "true")}>{optionLabel}</button>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === "scale") {
    const numeric = typeof value === "number" ? value : field.min ?? 0;
    return (
      <label className="grid gap-1.5">
        {label}
        <div className="grid h-9 grid-cols-[1fr_48px] items-center gap-3 rounded-md border bg-background px-3">
          <input type="range" min={field.min ?? 0} max={field.max ?? 10} value={numeric} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
          <span className="text-center text-sm font-semibold tabular-nums">{numeric}</span>
        </div>
      </label>
    );
  }

  return (
    <label className="grid gap-1.5">
      {label}
      <input
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        min={field.min}
        max={field.max}
        step={field.type === "number" ? "any" : undefined}
        value={valueAsString(value)}
        disabled={disabled}
        placeholder={field.placeholder}
        onChange={(event) => onChange(field.type === "number" ? (event.target.value === "" ? null : Number(event.target.value)) : event.target.value)}
        className={inputClass}
      />
    </label>
  );
}

export function SpecialtyClinicalForm({
  workspace,
  disabled,
  workspaceMode,
  showVisualMap,
  onWorkspaceModeChange,
  onShowVisualMapChange,
  workspacePreferencePending,
}: {
  workspace: ClinicalFormWorkspace | null;
  disabled: boolean;
  workspaceMode: ClinicalWorkspaceMode;
  showVisualMap: boolean;
  onWorkspaceModeChange: (mode: ClinicalWorkspaceMode) => void;
  onShowVisualMapChange: (visible: boolean) => void;
  workspacePreferencePending: boolean;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(workspace?.selectedTemplateId ?? "");
  const [responses, setResponses] = useState<ClinicalFormResponses>(workspace?.instance?.responses ?? workspace?.prefillResponses ?? {});
  const selectedTemplate = useMemo(
    () => workspace?.templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, workspace?.templates],
  );
  const definition = workspace?.instance?.template_id === selectedTemplateId
    ? workspace.instance.template_snapshot
    : selectedTemplate?.definition;
  const [activeSection, setActiveSection] = useState(definition?.sections[0]?.key ?? "");

  useEffect(() => {
    if (!definition?.sections.some((section) => section.key === activeSection)) {
      setActiveSection(definition?.sections[0]?.key ?? "");
    }
  }, [activeSection, definition]);

  if (!workspace || !selectedTemplate || !definition) {
    return (
      <section className="rounded-md border bg-card p-4">
        <div className="flex items-center gap-3"><ClipboardList className="size-5 text-muted-foreground" /><div><p className="text-sm font-medium">Formulário especializado indisponível</p><p className="text-xs text-muted-foreground">Ative ao menos um pacote clínico nas preferências do prontuário.</p></div></div>
      </section>
    );
  }

  const selectedSpecialtySlug = selectedTemplate.specialty_slug;
  const workspaceConfig = getClinicalWorkspaceConfig(selectedSpecialtySlug);
  const currentSection = definition.sections.find((section) => section.key === activeSection) ?? definition.sections[0];
  const completion = clinicalFormCompletion(definition, responses);
  const templateLocked = disabled || Boolean(workspace.instance && workspace.instance.status !== "draft");
  const canChoose = workspace.allowTemplateChoice && !templateLocked;
  const warnings = definition.sections.flatMap((section) => section.fields).filter((field) => {
    const value = responses[field.key];
    return typeof value === "string" && field.alert_values?.includes(value);
  });
  const analytics = getClinicalFormAnalytics(definition, responses);
  const visualMaps = metadataObject(responses._visual_maps);
  const provenance = metadataObject(responses._provenance);
  const fieldLabels = new Map(definition.sections.flatMap((section) => section.fields.map((field) => [field.key, field.label] as const)));

  function selectTemplate(template: ClinicalFormTemplate) {
    setSelectedTemplateId(template.id);
    setResponses({});
    setActiveSection(template.definition.sections[0]?.key ?? "");
  }

  function updateVisualMap(value: ClinicalFormResponseMetadata) {
    setResponses((current) => ({
      ...current,
      _visual_maps: {
        ...metadataObject(current._visual_maps),
        [selectedSpecialtySlug]: value,
      },
    }));
  }

  return (
    <section className="overflow-hidden rounded-md border bg-card">
      <input type="hidden" name="clinical_template_id" value={selectedTemplateId} />
      <input type="hidden" name="clinical_responses" value={JSON.stringify(responses)} />

      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Sparkles className="size-4" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{selectedTemplate.name}</p><Badge className="bg-primary/10 text-primary">Especializado</Badge>{workspace.instance ? <Badge className="bg-muted text-muted-foreground">Revisão {workspace.instance.revision_number}</Badge> : null}</div>
            <p className="mt-1 text-xs text-muted-foreground">{selectedTemplate.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right"><p className="text-xs font-medium tabular-nums">{completion}% preenchido</p><div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${completion}%` }} /></div></div>
          {templateLocked ? <span title="Modelo bloqueado após conclusão"><LockKeyhole className="size-4 text-muted-foreground" /></span> : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          <span>{workspaceConfig.title}</span>
          {workspacePreferencePending ? <span className="text-primary">Salvando preferência...</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border bg-muted/20 p-0.5" aria-label="Modo do workspace">
            {(["guided", "compact"] as const).map((mode) => (
              <button key={mode} type="button" disabled={disabled || workspacePreferencePending} onClick={() => onWorkspaceModeChange(mode)} className={`h-7 rounded px-2.5 text-[11px] font-medium transition-colors ${workspaceMode === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {mode === "guided" ? "Guiado" : "Compacto"}
              </button>
            ))}
          </div>
          {workspaceConfig.visualTool !== "Formulário especializado" ? (
            <label className="flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-[11px] font-medium">
              <input type="checkbox" checked={showVisualMap} disabled={disabled || workspacePreferencePending} onChange={(event) => onShowVisualMapChange(event.target.checked)} className="size-3.5" />
              Mapa visual
            </label>
          ) : null}
        </div>
      </div>

      {Object.keys(provenance).length ? (
        <div className="flex items-start gap-2 border-b bg-sky-50/70 px-4 py-2.5 text-[11px] text-sky-900">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Dados pré-preenchidos da Enfermagem</p>
            <p className="mt-0.5 text-sky-800/80">Os campos abaixo vieram da pré-consulta e não substituem um valor já registrado.</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(provenance).map(([fieldKey, rawValue]) => {
                const source = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) ? rawValue as Record<string, ClinicalFormResponseMetadata> : {};
                const capturedAt = typeof source.captured_at === "string" ? source.captured_at : "";
                return <span key={fieldKey} className="rounded border border-sky-200 bg-white/70 px-1.5 py-0.5">{fieldLabels.get(fieldKey) ?? fieldKey}{capturedAt ? ` · ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(capturedAt))}` : ""}</span>;
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 border-b bg-muted/15 px-4 py-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="grid max-w-xl gap-1.5 text-xs font-medium">
          Layout clínico
          <select
            value={selectedTemplateId}
            disabled={!canChoose}
            onChange={(event) => {
              const template = workspace.templates.find((item) => item.id === event.target.value);
              if (template) selectTemplate(template);
            }}
            className={inputClass}
          >
            {workspace.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><SlidersHorizontal className="size-3.5" />{sourceLabels[workspace.selectionSource]}{workspace.professionalSpecialty ? ` · ${workspace.professionalSpecialty}` : ""}</div>
      </div>

      <div className="grid gap-3 border-b bg-background px-4 py-3 lg:grid-cols-4">
        <div className="rounded-md border bg-muted/15 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Cobertura</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{analytics.filledFields}/{analytics.totalFields} campos</p>
        </div>
        <div className="rounded-md border bg-muted/15 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Obrigatórios</p>
          <p className={analytics.missingRequiredFields.length ? "mt-1 text-sm font-semibold text-amber-700" : "mt-1 text-sm font-semibold text-emerald-700"}>
            {analytics.missingRequiredFields.length ? `${analytics.missingRequiredFields.length} pendente(s)` : "Tudo pronto"}
          </p>
        </div>
        <div className="rounded-md border bg-muted/15 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Alertas</p>
          <p className={analytics.alertFields.length ? "mt-1 text-sm font-semibold text-destructive" : "mt-1 text-sm font-semibold text-muted-foreground"}>
            {analytics.alertFields.length ? `${analytics.alertFields.length} achado(s)` : "Sem alerta"}
          </p>
        </div>
        <div className="rounded-md border bg-muted/15 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Mapa visual</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{analytics.visualMapEntries} marcação(ões)</p>
        </div>
      </div>

      {workspaceMode === "guided" ? <div className="grid gap-3 border-b bg-muted/10 px-4 py-3 lg:grid-cols-2">
        <div className="rounded-md border bg-card p-3">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-primary" />
            <p className="text-xs font-semibold uppercase text-muted-foreground">Próximas ações clínicas</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {analytics.missingRequiredFields.slice(0, 4).map((field) => (
              <Badge key={field.key} className="bg-amber-50 text-amber-800">{field.label}</Badge>
            ))}
            {analytics.alertFields.slice(0, 3).map((field) => (
              <Badge key={`alert-${field.key}`} className="bg-destructive/10 text-destructive">{field.label}</Badge>
            ))}
            {!analytics.missingRequiredFields.length && !analytics.alertFields.length ? (
              <span className="text-xs text-muted-foreground">Sem pendências críticas para este layout.</span>
            ) : null}
          </div>
        </div>
        <div className="rounded-md border bg-card p-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-4 text-primary" />
            <p className="text-xs font-semibold uppercase text-muted-foreground">Campos para relatório</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {analytics.reportableFields.slice(0, 6).map((field) => (
              <span key={field.key} className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">{field.label}</span>
            ))}
            {!analytics.reportableFields.length ? (
              <span className="text-xs text-muted-foreground">Preencha campos reportáveis para enriquecer relatórios por especialidade.</span>
            ) : null}
          </div>
        </div>
      </div> : null}

      {warnings.length ? <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">Atenção clínica necessária</p><p className="mt-0.5">{warnings.map((field) => field.label).join(", ")}. Avalie e registre a conduta antes de concluir.</p></div></div> : null}

      <div className="px-4 pt-3">
        <SpecialtyWorkspaceSummary
          specialtySlug={selectedSpecialtySlug}
          responses={responses}
          visualMap={visualMaps[selectedSpecialtySlug]}
        />
      </div>

      {showVisualMap ? <div className="px-4 pt-3">
        <ClinicalImmersionMap
          specialtySlug={selectedSpecialtySlug}
          value={visualMaps[selectedSpecialtySlug]}
          disabled={disabled}
          onChange={updateVisualMap}
        />
      </div> : null}

      <div className="grid min-h-[360px] lg:grid-cols-[210px_1fr]">
        <nav className="border-b bg-muted/10 p-2 lg:border-b-0 lg:border-r">
          {definition.sections.map((section, index) => {
            const sectionFields = section.fields;
            const completed = sectionFields.filter((field) => {
              const value = responses[field.key];
              return value !== null && value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
            }).length;
            return <button key={section.key} type="button" onClick={() => setActiveSection(section.key)} className={`mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs ${activeSection === section.key ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70"}`}><span className={`grid size-5 place-items-center rounded-full text-[10px] ${completed === sectionFields.length && sectionFields.length ? "bg-emerald-600 text-white" : "bg-muted"}`}>{completed === sectionFields.length && sectionFields.length ? <Check className="size-3" /> : index + 1}</span><span className="min-w-0 flex-1 truncate">{section.title}</span><ChevronRight className="size-3.5" /></button>;
          })}
        </nav>

        <div className="p-4">
          <div className="mb-4"><p className="text-sm font-semibold">{currentSection?.title}</p>{currentSection?.description ? <p className="mt-1 text-xs text-muted-foreground">{currentSection.description}</p> : null}</div>
          <div className={`grid gap-4 ${currentSection?.columns === 1 ? "grid-cols-1" : currentSection?.columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
            {currentSection?.fields.map((field) => <ClinicalField key={field.key} field={field} value={responses[field.key]} disabled={disabled} onChange={(value) => setResponses((current) => ({ ...current, [field.key]: value }))} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
