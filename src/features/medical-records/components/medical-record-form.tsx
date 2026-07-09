"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Beaker,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  History,
  Paperclip,
  Pill,
  RotateCcw,
  Save,
  Sparkles,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  EVOLUTION_TEMPLATES,
  type MedicalRecordFieldKey,
} from "@/features/medical-records/config";
import { MedicalDocumentsPanel } from "@/features/medical-records/components/medical-documents-panel";
import { MedicalAttachmentsPanel } from "@/features/medical-records/components/medical-attachments-panel";
import { MedicalTimelinePanel } from "@/features/medical-records/components/medical-timeline-panel";
import { SpecialtyClinicalForm } from "@/features/medical-records/components/specialty-clinical-form";
import { SpecialtyExperiencePanel } from "@/features/medical-records/components/specialty-experience-panel";
import {
  openMedicalRecordCorrectionAction,
  saveMedicalRecordAction,
  type MedicalRecordActionState,
} from "@/features/medical-records/actions";
import type { MedicalRecordEncounterDetail, MedicalRecordPreferences } from "@/repositories/medical-records";
import type { ClinicalFormWorkspace } from "@/repositories/clinical-forms";
import type { DiagnosticOrder } from "@/repositories/diagnostics";
import type { ClinicDocumentBranding } from "@/services/documents/clinic-document-branding";
import { clinicalStatusLabel } from "@/features/medical-records/labels";

type ClinicalContextTab = "nursing" | "exams" | "documents" | "attachments" | "timeline";

function patientAge(birthDate?: string | null) {
  if (!birthDate) return "Idade não informada";
  const birth = new Date(`${birthDate}T12:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age -= 1;
  return `${age} anos`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Data nao informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function Field({
  label,
  name,
  defaultValue,
  required,
  placeholder,
  disabled,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span className="flex items-center gap-2">
        {label}
        {required ? <span className="text-xs font-normal text-primary">Obrigatorio</span> : null}
      </span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        aria-required={required}
        disabled={disabled}
        className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  required,
  minHeight = "min-h-24",
  disabled,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  minHeight?: string;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span className="flex items-center gap-2">
        {label}
        {required ? <span className="text-xs font-normal text-primary">Obrigatorio</span> : null}
      </span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-required={required}
        disabled={disabled}
        className={`${minHeight} rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      />
    </label>
  );
}

function NursingSummary({ detail }: { detail: MedicalRecordEncounterDetail }) {
  const assessment = detail.nursing_assessment;

  if (!assessment) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="size-5 text-primary" />
          <div>
            <p className="font-medium">Resumo da Enfermagem</p>
            <p className="text-sm text-muted-foreground">
              Esta consulta nao possui pre-consulta registrada.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const vitals = [
    assessment.systolic_bp && assessment.diastolic_bp
      ? `PA ${assessment.systolic_bp}/${assessment.diastolic_bp} mmHg`
      : null,
    assessment.heart_rate ? `FC ${assessment.heart_rate} bpm` : null,
    assessment.respiratory_rate ? `FR ${assessment.respiratory_rate} irpm` : null,
    assessment.temperature_c ? `Temp. ${assessment.temperature_c} C` : null,
    assessment.oxygen_saturation ? `SpO2 ${assessment.oxygen_saturation}%` : null,
    assessment.capillary_glucose ? `HGT ${assessment.capillary_glucose} mg/dL` : null,
  ].filter(Boolean);

  return (
    <section className="grid gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="size-5 text-primary" />
        <div>
          <p className="font-medium">Resumo da Enfermagem</p>
          <p className="text-sm text-muted-foreground">
            Encerrada em {formatDate(assessment.completed_at)}.
          </p>
        </div>
      </div>
      <div className="grid gap-3 text-sm lg:grid-cols-2">
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Queixa</p>
          <p className="selectable mt-1">{assessment.chief_complaint ?? "Nao informada"}</p>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Sinais vitais</p>
          <p className="selectable mt-1">{vitals.length ? vitals.join(" | ") : "Nao informados"}</p>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Alergias / medicacoes</p>
          <p className="selectable mt-1">
            {[assessment.allergies, assessment.current_medications].filter(Boolean).join(" | ") ||
              "Nao informado"}
          </p>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Recomendacoes</p>
          <p className="selectable mt-1">{assessment.recommendations ?? "Sem recomendacoes registradas"}</p>
        </div>
      </div>
    </section>
  );
}

export function MedicalRecordForm({
  detail,
  preferences,
  documentBranding,
  clinicalFormWorkspace,
  diagnosticSummary,
}: {
  detail: MedicalRecordEncounterDetail;
  preferences: MedicalRecordPreferences;
  documentBranding: ClinicDocumentBranding;
  clinicalFormWorkspace: ClinicalFormWorkspace | null;
  diagnosticSummary: Array<Pick<DiagnosticOrder, "id" | "order_number" | "category" | "priority" | "status" | "created_at" | "items">>;
}) {
  const record = detail.medical_record;
  const requiredFields = new Set<MedicalRecordFieldKey>(preferences.required_fields);
  const formRef = useRef<HTMLFormElement>(null);
  const modeRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionReason, setCorrectionReason] = useState(record?.correction_reason ?? "");
  const [contextOpen, setContextOpen] = useState(true);
  const [contextTab, setContextTab] = useState<ClinicalContextTab>("nursing");
  const [state, formAction, pending] = useActionState<MedicalRecordActionState, FormData>(
    saveMedicalRecordAction,
    {},
  );
  const [correctionState, correctionAction, correctionPending] = useActionState<
    MedicalRecordActionState,
    FormData
  >(openMedicalRecordCorrectionAction, {});
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (state.error) {
      toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
    }
    if (state.success) {
      toast({ title: "Prontuário", description: state.success });
      if (state.redirectTo) router.push(state.redirectTo);
    }
  }, [router, state.error, state.redirectTo, state.success, toast]);

  useEffect(() => {
    if (correctionState.error) {
      toast({ title: "Correção não aberta", description: correctionState.error, variant: "destructive" });
    }
    if (correctionState.success) {
      toast({ title: "Correção formal", description: correctionState.success });
      setCorrectionMode(true);
      setCorrectionOpen(false);
    }
  }, [correctionState.error, correctionState.success, toast]);

  const canComplete = ["ready_for_consultation", "consultation_in_progress"].includes(detail.status);
  const patientName = detail.patient?.social_name || detail.patient?.full_name || "Paciente";
  const professionalName = detail.professional?.profile?.full_name || "Profissional não informado";
  const professionalRegistration = detail.professional_profile?.council_number
    ? [
        detail.professional_profile.council_type,
        detail.professional_profile.council_number,
        detail.professional_profile.council_state,
      ]
        .filter(Boolean)
        .join(" ")
    : "Registro profissional não informado";
  const appointmentTime = formatDate(detail.appointment?.starts_at);
  const age = patientAge(detail.patient?.birth_date);
  const allergies = detail.nursing_assessment?.allergies || "Sem alergias registradas";
  const isCompleted = record?.status === "completed";
  const locked = isCompleted && !correctionMode;
  const templateTargets = ["history", "physical_exam", "assessment", "plan", "patient_guidance"] as const;

  function applyEvolutionTemplate(template: (typeof EVOLUTION_TEMPLATES)[number]) {
    const form = formRef.current;
    if (!form) return;
    for (const field of templateTargets) {
      const element = form.elements.namedItem(field) as HTMLTextAreaElement | null;
      if (element) element.value = template.values[field];
    }
    setTemplatesOpen(false);
    toast({ title: "Modelo aplicado", description: "Revise e ajuste a evolução antes de salvar." });
  }

  const contextTabs: Array<{ key: ClinicalContextTab; label: string; icon: typeof ClipboardCheck; count?: number }> = [
    { key: "nursing", label: "Enfermagem", icon: ClipboardCheck, count: detail.nursing_assessment ? 1 : 0 },
    { key: "exams", label: "Exames", icon: Beaker, count: diagnosticSummary.length },
    { key: "documents", label: "Documentos", icon: Pill, count: detail.prescriptions.length },
    { key: "attachments", label: "Anexos", icon: Paperclip, count: detail.attachments.length },
    { key: "timeline", label: "Timeline", icon: History, count: detail.timeline.length },
  ];

  return (
    <div className="clinical-workspace grid gap-4">
      <section className="sticky top-12 z-20 rounded-lg border bg-card/95 px-4 py-3 shadow-[0_4px_18px_rgb(15_23_42/0.06)] backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <UserRound className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[15px] font-semibold">{patientName}</p>
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{age}</span>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{clinicalStatusLabel(detail.status)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {professionalName} · {professionalRegistration} · {appointmentTime}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${allergies === "Sem alergias registradas" ? "bg-muted text-muted-foreground" : "bg-red-50 text-red-700"}`}>
              Alergias: {allergies}
            </span>
            {locked ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setCorrectionOpen(true)}>
                <RotateCcw /> Corrigir
              </Button>
            ) : null}
          </div>
        </div>
        {detail.patient?.clinical_alerts ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span className="selectable"><strong>Alerta clínico:</strong> {detail.patient.clinical_alerts}</span>
          </div>
        ) : null}
        {locked ? (
          <p className="mt-2 text-xs text-muted-foreground">Prontuário concluído e protegido. Alterações exigem correção formal auditável.</p>
        ) : correctionMode ? (
          <label className="mt-3 grid gap-1.5 text-xs font-medium">
            Motivo da correção formal
            <textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} className="min-h-16 rounded-md border bg-background px-3 py-2 text-sm font-normal" />
          </label>
        ) : null}
      </section>

      <div className={`grid items-start gap-4 ${contextOpen ? "xl:grid-cols-[minmax(0,1fr)_420px]" : "xl:grid-cols-[minmax(0,1fr)_48px]"}`}>
        <form ref={formRef} action={formAction} className="grid min-w-0 gap-4">
          <input type="hidden" name="encounter_id" value={detail.id} />
          <input ref={modeRef} type="hidden" name="mode" value="draft" />
          <input type="hidden" name="correction_reason" value={correctionReason} />

          <SpecialtyExperiencePanel specialty={detail.professional_profile?.specialty} />
          <SpecialtyClinicalForm workspace={clinicalFormWorkspace} disabled={locked} />

          <section className="grid gap-4 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3 border-b pb-3">
              <Stethoscope className="size-4 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Canvas clínico</p>
                <p className="text-xs text-muted-foreground">Evolução estruturada em SOAP, com campos obrigatórios definidos pela clínica.</p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => setTemplatesOpen(true)}>
                <Sparkles /> Modelos
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-[11px]">
              {[["S", "Subjetivo"], ["O", "Objetivo"], ["A", "Avaliação"], ["P", "Plano"]].map(([letter, label]) => (
                <div key={letter} className="rounded-md border bg-muted/20 px-2 py-1.5"><strong className="text-primary">{letter}</strong><span className="ml-1.5 text-muted-foreground">{label}</span></div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <TextArea label="S - Queixa principal" name="chief_complaint" defaultValue={record?.chief_complaint ?? detail.nursing_assessment?.chief_complaint} required={requiredFields.has("chief_complaint")} disabled={locked} />
              <TextArea label="S - História clínica e contexto" name="history" defaultValue={record?.history} required={requiredFields.has("history")} disabled={locked} />
              <TextArea label="O - Exame físico e achados" name="physical_exam" defaultValue={record?.physical_exam} required={requiredFields.has("physical_exam")} disabled={locked} />
              <TextArea label="A - Avaliação / hipótese" name="assessment" defaultValue={record?.assessment} required={requiredFields.has("assessment")} disabled={locked} />
              <Field label="Diagnóstico principal" name="diagnosis" defaultValue={record?.diagnosis} required={requiredFields.has("diagnosis")} disabled={locked} />
              <Field label="CID-10 principal" name="cid10" defaultValue={record?.cid10} required={requiredFields.has("cid10")} placeholder="Ex.: J00" disabled={locked} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <TextArea label="P - Plano terapêutico / conduta" name="plan" defaultValue={record?.plan} required={requiredFields.has("plan")} disabled={locked} />
              <TextArea label="P - Orientações ao paciente" name="patient_guidance" defaultValue={record?.patient_guidance} required={requiredFields.has("patient_guidance")} disabled={locked} />
            </div>
            <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
              <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm font-medium">
                <input type="checkbox" name="follow_up_required" defaultChecked={record?.follow_up_required ?? false} className="size-4" disabled={locked} />
                Solicitar retorno
              </label>
              <Field label="Observação de retorno" name="follow_up_notes" defaultValue={record?.follow_up_notes} required={requiredFields.has("follow_up_notes")} disabled={locked} />
            </div>
          </section>

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/95 px-3 py-2.5 shadow-[0_8px_26px_rgb(15_23_42/0.09)] backdrop-blur">
            <p className="text-xs text-muted-foreground">{locked ? "Registro protegido contra edição direta" : "Salve durante o atendimento para preservar o rascunho"}</p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="outline" disabled={pending || locked} onClick={() => { if (modeRef.current) modeRef.current.value = "draft"; }}>
                <Save /> {pending ? "Salvando..." : "Salvar rascunho"}
              </Button>
              <Button type="button" size="sm" disabled={pending || !canComplete} onClick={() => setConfirmOpen(true)}>
                <FileText /> Finalizar consulta
              </Button>
            </div>
          </div>
        </form>

        <aside className="sticky top-36 min-w-0 overflow-hidden rounded-lg border bg-card">
          {contextOpen ? (
            <>
              <header className="flex items-center justify-between border-b px-3 py-2.5">
                <div><p className="text-sm font-semibold">Contexto clínico</p><p className="text-[11px] text-muted-foreground">Informações vinculadas ao atendimento</p></div>
                <Button type="button" variant="ghost" size="icon" className="size-8" title="Recolher painel" onClick={() => setContextOpen(false)}><ChevronRight /></Button>
              </header>
              <div className="flex overflow-x-auto border-b bg-muted/15 p-1">
                {contextTabs.map(({ key, label, icon: Icon, count }) => (
                  <button key={key} type="button" onClick={() => setContextTab(key)} className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors duration-150 ${contextTab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <Icon className="size-3.5" /> {label}{typeof count === "number" ? <span className="tabular-nums opacity-70">{count}</span> : null}
                  </button>
                ))}
              </div>
              <div className="clinical-context-panel max-h-[calc(100vh-13rem)] overflow-y-auto p-3">
                {contextTab === "nursing" ? (preferences.show_nursing_summary ? <NursingSummary detail={detail} /> : <p className="p-4 text-sm text-muted-foreground">Resumo de Enfermagem desativado nas preferências.</p>) : null}
                {contextTab === "exams" ? (
                  diagnosticSummary.length ? <div className="grid gap-2">{diagnosticSummary.map((order) => (
                    <article key={order.id} className="rounded-md border bg-background p-3">
                      <div className="flex items-center justify-between gap-2"><p className="selectable font-mono text-xs font-medium">{order.order_number}</p><span className="text-[11px] text-muted-foreground">{order.status === "completed" ? "Concluído" : "Em andamento"}</span></div>
                      <div className="mt-2 grid gap-1.5">{order.items.map((item) => { const result = item.results.find((entry) => entry.status === "final") ?? item.results[0]; return <div key={item.id} className="rounded-md bg-muted/30 px-2.5 py-2"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{item.name}</span>{result?.flag && result.flag !== "normal" ? <span className="flex items-center gap-1 text-[11px] text-destructive"><AlertTriangle className="size-3" />{result.flag === "critical" ? "Crítico" : "Alterado"}</span> : null}</div><p className="selectable mt-1 text-xs text-muted-foreground">{result ? result.value_text || `${result.value_numeric ?? "-"} ${result.unit ?? ""}` : "Resultado pendente"}</p></div>; })}</div>
                    </article>
                  ))}</div> : <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum exame vinculado.</p>
                ) : null}
                {contextTab === "documents" ? <MedicalDocumentsPanel detail={detail} branding={documentBranding} /> : null}
                {contextTab === "attachments" ? <MedicalAttachmentsPanel detail={detail} /> : null}
                {contextTab === "timeline" ? <MedicalTimelinePanel events={detail.timeline} /> : null}
              </div>
            </>
          ) : (
            <div className="grid justify-items-center gap-2 py-3">
              <Button type="button" variant="ghost" size="icon" className="size-8" title="Expandir contexto clínico" onClick={() => setContextOpen(true)}><ChevronLeft /></Button>
              {contextTabs.map(({ key, label, icon: Icon, count }) => (
                <Button key={key} type="button" variant={contextTab === key ? "secondary" : "ghost"} size="icon" className="relative size-8" title={label} onClick={() => { setContextTab(key); setContextOpen(true); }}>
                  <Icon />{count ? <span className="absolute -right-0.5 -top-0.5 grid size-3.5 place-items-center rounded-full bg-primary text-[8px] text-primary-foreground">{Math.min(count, 9)}</span> : null}
                </Button>
              ))}
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Finalizar consulta?" description="O prontuário será salvo, o atendimento será encerrado e a ação ficará registrada na auditoria." confirmLabel="Finalizar consulta" onConfirm={() => { if (modeRef.current) modeRef.current.value = "complete"; formRef.current?.requestSubmit(); }} />

      <Modal open={templatesOpen} onOpenChange={setTemplatesOpen} title="Modelos de evolução" description="Aplique um modelo e ajuste os campos antes de salvar." className="max-w-3xl">
        <div className="grid gap-3">{EVOLUTION_TEMPLATES.map((template) => <article key={template.key} className="rounded-md border bg-background p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{template.title}</p><p className="mt-1 text-sm text-muted-foreground">{template.description}</p></div><Button type="button" size="sm" onClick={() => applyEvolutionTemplate(template)}>Aplicar</Button></div></article>)}</div>
      </Modal>

      <Modal open={correctionOpen} onOpenChange={setCorrectionOpen} title="Abrir correção formal" description="A justificativa ficará registrada na auditoria e na linha do tempo do prontuário." className="max-w-lg">
        <form action={correctionAction} className="grid gap-4">
          <input type="hidden" name="medical_record_id" value={record?.id ?? ""} />
          <input type="hidden" name="encounter_id" value={detail.id} />
          <label className="grid gap-2 text-sm font-medium">Motivo da correção<textarea name="reason" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Explique o motivo da alteração no prontuário concluído." /></label>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCorrectionOpen(false)}>Cancelar</Button><Button disabled={correctionPending}><RotateCcw />{correctionPending ? "Abrindo..." : "Abrir correção"}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
