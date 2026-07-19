"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ClipboardList, GitBranch, Plus, Save, Trash2, X } from "lucide-react";
import { CLINICAL_SPECIALTY_OPTIONS } from "@/config/clinical-specialties";
import { MEDICAL_RECORD_FIELD_OPTIONS } from "@/features/medical-records/config";
import { saveClinicalProtocolAction } from "@/features/medical-records/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { ClinicalProtocol, ClinicalProtocolStep } from "@/repositories/clinical-protocols";

type EditableStep = ClinicalProtocolStep;

const defaultSteps: EditableStep[] = [
  { key: "arrival", title: "Paciente chegou", kind: "check_in", position: 10, responsible_roles: ["receptionist"] },
  { key: "preconsultation", title: "Pré-consulta", kind: "nursing", position: 20, responsible_roles: ["nurse"] },
  { key: "consultation", title: "Consulta profissional", kind: "clinical_form", position: 30, required_fields: ["assessment", "plan"], responsible_roles: ["doctor", "professional"] },
  { key: "closure", title: "Encerrar atendimento", kind: "checklist", position: 40 },
  { key: "billing", title: "Liberar cobrança", kind: "billing", position: 50, terminal: true, responsible_roles: ["receptionist", "financial"] },
];

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || "etapa";
}

function statusLabel(status: NonNullable<ClinicalProtocol["latest_version"]>["status"] | null) {
  if (status === "published") return "Publicado";
  if (status === "draft") return "Rascunho";
  if (status === "archived") return "Arquivado";
  return "Sem versão";
}

export function ClinicalProtocolsPanel({ protocols, canEdit }: { protocols: ClinicalProtocol[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicalProtocol | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [specialty, setSpecialty] = useState("general_medicine");
  const [publish, setPublish] = useState(true);
  const [steps, setSteps] = useState<EditableStep[]>(defaultSteps);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const activeSpecialtyLabel = useMemo(() => CLINICAL_SPECIALTY_OPTIONS.find((option) => option.value === specialty)?.label ?? "Clínica geral", [specialty]);

  function resetForm(protocol?: ClinicalProtocol) {
    setEditing(protocol ?? null);
    setName(protocol?.name ?? "");
    setDescription(protocol?.description ?? "");
    setSpecialty(protocol?.specialty_slug ?? "general_medicine");
    setPublish(protocol?.latest_version?.status === "published" || !protocol);
    setSteps(protocol?.latest_version?.definition.steps.length ? protocol.latest_version.definition.steps : defaultSteps);
    setExpandedStep(null);
    setOpen(true);
  }

  function updateStep(key: string, patch: Partial<EditableStep>) {
    setSteps((current) => current.map((step) => step.key === key ? { ...step, ...patch } : step));
  }

  function addStep() {
    const position = (steps.length + 1) * 10;
    const step = { key: `etapa_${steps.length + 1}`, title: "Nova etapa", kind: "checklist" as const, position };
    setSteps((current) => [...current, step]);
    setExpandedStep(step.key);
  }

  function removeStep(key: string) {
    setSteps((current) => current.filter((step) => step.key !== key).map((step, index) => ({ ...step, position: (index + 1) * 10 })));
  }

  function submit() {
    const formData = new FormData();
    formData.set("protocol_id", editing?.id ?? "");
    formData.set("name", name);
    formData.set("description", description);
    formData.set("specialty_slug", specialty);
    formData.set("publish", String(publish));
    formData.set("change_summary", editing ? "Atualização do fluxo pela administração da clínica." : "Protocolo criado pela administração da clínica.");
    formData.set("steps", JSON.stringify(steps.map((step, index) => ({ ...step, position: (index + 1) * 10 }))));
    startTransition(async () => {
      const result = await saveClinicalProtocolAction(formData);
      if (result.error) toast({ title: "Protocolo não salvo", description: result.error, variant: "destructive" });
      else { toast({ title: "Protocolo salvo", description: result.success }); setOpen(false); window.location.reload(); }
    });
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-card p-4">
        <div className="flex items-start gap-3"><div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><GitBranch className="size-4" /></div><div><p className="text-sm font-semibold">Protocolos e fluxos da clínica</p><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Defina como cada serviço avança, quais etapas exigem preenchimento e quem pode concluir uma fase. Cada publicação cria uma nova versão e não altera atendimentos anteriores.</p></div></div>
        <Button size="sm" onClick={() => resetForm()} disabled={!canEdit}><Plus /> Novo protocolo</Button>
      </div>
      <div className="grid gap-2">
        {protocols.map((protocol) => <article key={protocol.id} className="grid gap-3 rounded-md border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{protocol.name}</p><Badge className={protocol.latest_version?.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{statusLabel(protocol.latest_version?.status ?? null)}</Badge>{protocol.specialty_slug ? <span className="text-xs text-muted-foreground">{CLINICAL_SPECIALTY_OPTIONS.find((item) => item.value === protocol.specialty_slug)?.label ?? protocol.specialty_slug}</span> : null}</div><p className="mt-1 text-xs text-muted-foreground">{protocol.description || "Sem descrição operacional."}</p><div className="mt-3 flex flex-wrap gap-1.5">{(protocol.latest_version?.definition.steps ?? []).map((step) => <span key={step.key} className="rounded border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">{step.title}</span>)}</div></div><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">v{protocol.latest_version?.version_number ?? 0}</span><Button size="sm" variant="outline" onClick={() => resetForm(protocol)} disabled={!canEdit}>Editar fluxo</Button></div></article>)}
        {!protocols.length ? <div className="grid place-items-center rounded-md border border-dashed bg-card px-4 py-12 text-center"><ClipboardList className="size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">Nenhum protocolo configurado</p><p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Crie o primeiro fluxo para tornar pré-consulta, prontuário, documentos e cobrança previsíveis para a equipe.</p></div> : null}
      </div>
      <Modal open={open} onOpenChange={setOpen} title={editing ? "Editar protocolo clínico" : "Novo protocolo clínico"} description={`Fluxo personalizado para ${activeSpecialtyLabel}. A publicação preserva o histórico das versões anteriores.`} size="xl" expandable>
        <div className="grid gap-5">
          <div className="grid gap-3 lg:grid-cols-2"><label className="grid gap-1.5 text-xs font-medium">Nome do protocolo<input value={name} onChange={(event) => setName(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Ex.: Consulta com pré-consulta" /></label><label className="grid gap-1.5 text-xs font-medium">Especialidade<select value={specialty} onChange={(event) => setSpecialty(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring">{CLINICAL_SPECIALTY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="grid gap-1.5 text-xs font-medium lg:col-span-2">Descrição operacional<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-16 rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Explique quando este fluxo deve ser aplicado." /></label></div>
          <section className="grid gap-2 rounded-md border bg-muted/15 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Etapas do atendimento</p><p className="text-xs text-muted-foreground">A ordem define o caminho normal. Correções fora da ordem exigem permissão de gestão e justificativa.</p></div><Button type="button" size="sm" variant="outline" onClick={addStep}><Plus /> Adicionar etapa</Button></div><div className="grid gap-2">{steps.map((step) => <div key={step.key} className="overflow-hidden rounded-md border bg-background"><div className="flex items-center gap-2 px-3 py-2"><span className="grid size-6 place-items-center rounded bg-primary/10 text-[11px] font-semibold text-primary">{step.position / 10}</span><p className="min-w-0 flex-1 truncate text-sm font-medium">{step.title}</p><span className="hidden text-[11px] text-muted-foreground sm:block">{step.kind}</span><Button type="button" variant="ghost" size="icon" className="size-8" title="Expandir etapa" onClick={() => setExpandedStep(expandedStep === step.key ? null : step.key)}><ChevronDown className={expandedStep === step.key ? "" : "-rotate-90"} /></Button><Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" title="Remover etapa" onClick={() => removeStep(step.key)} disabled={steps.length <= 1}><Trash2 /></Button></div>{expandedStep === step.key ? <div className="grid gap-3 border-t bg-muted/10 p-3 lg:grid-cols-2"><label className="grid gap-1.5 text-xs font-medium">Título<input value={step.title} onChange={(event) => updateStep(step.key, { title: event.target.value, key: step.key.startsWith("etapa_") ? slugify(event.target.value) : step.key })} className="h-8 rounded-md border bg-background px-2.5 text-sm font-normal" /></label><label className="grid gap-1.5 text-xs font-medium">Tipo<select value={step.kind} onChange={(event) => updateStep(step.key, { kind: event.target.value as EditableStep["kind"] })} className="h-8 rounded-md border bg-background px-2.5 text-sm font-normal"><option value="check_in">Chegada</option><option value="nursing">Enfermagem</option><option value="clinical_form">Prontuário</option><option value="checklist">Checklist</option><option value="document">Documento</option><option value="billing">Cobrança</option></select></label><div className="lg:col-span-2"><p className="mb-2 text-xs font-medium">Campos obrigatórios ao avançar</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{MEDICAL_RECORD_FIELD_OPTIONS.slice(0, 9).map((field) => <label key={field.key} className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={step.required_fields?.includes(field.key) ?? false} onChange={(event) => updateStep(step.key, { required_fields: event.target.checked ? [...(step.required_fields ?? []), field.key] : (step.required_fields ?? []).filter((item) => item !== field.key) })} />{field.label}</label>)}</div></div><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={step.terminal === true} onChange={(event) => updateStep(step.key, { terminal: event.target.checked })} />Finaliza o protocolo</label><label className="grid gap-1.5 text-xs font-medium">Chave técnica<input value={step.key} onChange={(event) => updateStep(step.key, { key: slugify(event.target.value) })} className="h-8 rounded-md border bg-background px-2.5 text-sm font-normal" /></label></div> : null}</div>)}</div></section>
          <label className="flex items-start gap-2 rounded-md border bg-background p-3 text-xs"><input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} className="mt-0.5" /><span><span className="block font-medium">Publicar esta versão imediatamente</span><span className="mt-1 block text-muted-foreground">Apenas a versão publicada pode iniciar novos atendimentos. Atendimentos existentes permanecem vinculados ao snapshot anterior.</span></span></label>
        </div>
        <ModalFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}><X /> Cancelar</Button><Button type="button" onClick={submit} disabled={isPending || name.trim().length < 2 || steps.length === 0}><Save /> {isPending ? "Salvando..." : "Salvar protocolo"}</Button></ModalFooter>
      </Modal>
    </section>
  );
}
