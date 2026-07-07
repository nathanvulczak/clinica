"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Clock3,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  FileText,
  History,
  Pencil,
  Printer,
  Save,
  Search,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter, ModalSection } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  cancelGeneratedDocumentAction,
  createGeneratedDocumentAction,
  issueGeneratedDocumentAction,
  saveDocumentTemplateAction,
  type DocumentsActionState,
} from "@/features/documents/actions";
import { formatCpf, formatCpfOrCnpj, formatPhone } from "@/lib/formatters";
import type {
  DocumentTemplate,
  DocumentTemplateType,
  GeneratedDocumentEvent,
  GeneratedDocumentStatus,
} from "@/types/domain";
import type {
  DocumentAppointmentOption,
  DocumentFinancialOption,
  DocumentPatientOption,
  DocumentProfessionalOption,
  DocumentsWorkspace as DocumentsWorkspaceData,
  GeneratedDocumentSummary,
} from "@/repositories/documents";

const inputClass =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring";
const textareaClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring";
const pageSize = 10;

const typeLabels: Record<DocumentTemplateType, string> = {
  service_contract: "Contrato",
  lgpd_consent: "Privacidade e LGPD",
  procedure_consent: "Consentimento",
  payment_acknowledgement: "Ciência financeira",
  attendance_declaration: "Declaração",
  receipt: "Recibo",
  other: "Outro",
};

const statusLabels: Record<GeneratedDocumentStatus, string> = {
  draft: "Rascunho",
  issued: "Emitido",
  signed: "Assinado",
  cancelled: "Cancelado",
};

const eventLabels: Record<GeneratedDocumentEvent["event_type"], string> = {
  draft_created: "Rascunho criado",
  issued: "Documento emitido",
  opened_for_print: "Aberto para impressão",
  printed: "Documento impresso",
  signed: "Assinatura registrada",
  cancelled: "Documento cancelado",
};

function formatDate(value: string | null | undefined, withTime = true) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function statusClass(status: GeneratedDocumentStatus) {
  if (status === "issued" || status === "signed") return "bg-emerald-500/10 text-emerald-700";
  if (status === "cancelled") return "bg-destructive/10 text-destructive";
  return "bg-amber-500/10 text-amber-700";
}

function useDocumentsToast(state: DocumentsActionState, onCompleted?: (state: DocumentsActionState) => void) {
  const { toast } = useToast();
  const handled = useRef("");
  useEffect(() => {
    const key = `${state.error ?? ""}:${state.success ?? ""}:${state.documentId ?? ""}:${state.status ?? ""}`;
    if (!key.replaceAll(":", "") || handled.current === key) return;
    handled.current = key;
    if (state.error) toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
    if (state.success) {
      toast({ title: "Documentos", description: state.success });
      onCompleted?.(state);
    }
  }, [onCompleted, state, toast]);
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { toast } = useToast();
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-8"
      title={`Copiar ${label}`}
      aria-label={`Copiar ${label}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        toast({ title: "Copiado", description: `${label} copiado para a área de transferência.` });
      }}
    >
      <ClipboardCopy />
    </Button>
  );
}

function TemplateForm({
  template,
  onCompleted,
}: {
  template?: DocumentTemplate | null;
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(saveDocumentTemplateAction, {});
  const [content, setContent] = useState(template?.content ?? "");
  const [fileName, setFileName] = useState(template?.accepted_file_name ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const complete = useCallback(() => onCompleted?.(), [onCompleted]);
  useDocumentsToast(state, complete);

  async function readFile(file: File) {
    if (!/\.(txt|md)$/i.test(file.name) || file.size > 500_000) {
      setFileName("");
      return;
    }
    setContent(await file.text());
    setFileName(file.name);
  }

  return (
    <form action={action} className="grid gap-4">
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <input type="hidden" name="accepted_file_name" value={fileName} />
      <ModalSection className="grid gap-3">
        <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr_auto] lg:items-end">
          <label className="grid gap-1.5 text-xs font-medium">
            Tipo do modelo
            <select name="template_type" defaultValue={template?.template_type ?? "other"} className={inputClass}>
              {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            Nome do modelo
            <input name="name" defaultValue={template?.name ?? ""} className={inputClass} required />
          </label>
          <label className="flex h-9 items-center gap-2 rounded-md border bg-muted/20 px-3 text-xs font-medium">
            <input name="active" type="checkbox" defaultChecked={template?.active ?? true} className="size-4" />
            Modelo ativo
          </label>
        </div>
        <label className="grid gap-1.5 text-xs font-medium">
          Descrição
          <input name="description" defaultValue={template?.description ?? ""} className={inputClass} />
        </label>
        <label className="grid gap-1.5 text-xs font-medium">
          Orientação legal e técnica
          <textarea name="legal_basis" defaultValue={template?.legal_basis ?? ""} className={`${textareaClass} min-h-20`} />
        </label>
      </ModalSection>

      <ModalSection className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/15 p-3">
          <div>
            <p className="text-sm font-medium">Importar conteúdo textual</p>
            <p className="text-xs text-muted-foreground">Arquivo `.txt` ou `.md`, até 500 KB. A identidade visual é aplicada na emissão.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload /> Importar arquivo
          </Button>
          <input ref={fileInputRef} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={(event) => event.target.files?.[0] && void readFile(event.target.files[0])} />
        </div>
        {fileName ? <p className="text-xs text-muted-foreground">Arquivo carregado: {fileName}</p> : null}
        <label className="grid gap-1.5 text-xs font-medium">
          Conteúdo do modelo
          <textarea name="content" value={content} onChange={(event) => setContent(event.target.value)} className={`${textareaClass} min-h-[320px] font-mono text-xs leading-5`} required />
        </label>
      </ModalSection>
      <ModalFooter>
        <Button disabled={pending}><Save />{pending ? "Salvando..." : template ? "Salvar nova versão" : "Criar modelo"}</Button>
      </ModalFooter>
    </form>
  );
}

type IssueSelections = {
  templateId: string;
  patientId: string;
  appointmentId: string;
  encounterId: string;
  professionalId: string;
  financialId: string;
};

function replaceVariables(
  source: string,
  data: DocumentsWorkspaceData,
  selections: IssueSelections,
) {
  const patient = data.patients.find((item) => item.id === selections.patientId);
  const appointment = data.appointments.find((item) => item.id === selections.appointmentId);
  const professional = data.professionals.find((item) => item.id === selections.professionalId);
  const financial = data.financialEntries.find((item) => item.id === selections.financialId);
  const clinic = data.clinic;
  const appointmentDate = appointment ? new Date(appointment.starts_at) : null;
  const registry = professional
    ? [professional.council_type, professional.council_number, professional.council_state].filter(Boolean).join(" ")
    : "";
  const variables: Record<string, string> = {
    clinica_nome: clinic?.trade_name || clinic?.legal_name || "",
    clinica_razao_social: clinic?.legal_name || clinic?.trade_name || "",
    clinica_documento: clinic?.document ? formatCpfOrCnpj(clinic.document) : "",
    clinica_contato: [clinic?.phone ? formatPhone(clinic.phone) : "", clinic?.email].filter(Boolean).join(" | "),
    clinica_cidade: [clinic?.city, clinic?.state].filter(Boolean).join(" - "),
    paciente_nome: patient?.social_name || patient?.full_name || "",
    paciente_nome_civil: patient?.full_name || "",
    paciente_cpf: patient?.cpf ? formatCpf(patient.cpf) : "",
    paciente_telefone: patient?.phone ? formatPhone(patient.phone) : "",
    paciente_email: patient?.email || "",
    profissional_nome: professional?.full_name || "",
    profissional_registro: registry,
    servico_nome: appointment?.service_name || "",
    consulta_data: appointmentDate ? appointmentDate.toLocaleDateString("pt-BR") : "",
    consulta_hora: appointmentDate ? appointmentDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "",
    data_atendimento: appointmentDate ? appointmentDate.toLocaleDateString("pt-BR") : "",
    horario_atendimento: appointmentDate ? appointmentDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "",
    valor: financial ? formatMoney(financial.amount_cents) : "",
    valor_pago: financial ? formatMoney(financial.paid_cents) : "",
    vencimento: financial ? new Date(`${financial.due_date}T12:00:00`).toLocaleDateString("pt-BR") : "",
    cidade_data: `${clinic?.city || "Local"}, ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`,
    data_emissao: new Date().toLocaleDateString("pt-BR"),
  };
  return source.replace(/{{\s*([\w_]+)\s*}}/g, (match, key: string) => variables[key] || match);
}

function patientLabel(patient: DocumentPatientOption) {
  return `${patient.social_name || patient.full_name}${patient.cpf ? ` · ${formatCpf(patient.cpf)}` : ""}`;
}

function professionalLabel(professional: DocumentProfessionalOption) {
  const registry = [professional.council_type, professional.council_number, professional.council_state].filter(Boolean).join(" ");
  return `${professional.full_name}${registry ? ` · ${registry}` : ""}`;
}

function appointmentLabel(appointment: DocumentAppointmentOption, patients: DocumentPatientOption[]) {
  const patient = patients.find((item) => item.id === appointment.patient_id);
  return `${new Date(appointment.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${patient?.social_name || patient?.full_name || "Paciente"} · ${appointment.service_name}`;
}

function financialLabel(entry: DocumentFinancialOption) {
  return `${entry.description} · ${formatMoney(entry.amount_cents)} · venc. ${new Date(`${entry.due_date}T12:00:00`).toLocaleDateString("pt-BR")}`;
}

function IssueDocumentModal({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DocumentsWorkspaceData;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createGeneratedDocumentAction, {});
  const [step, setStep] = useState(1);
  const [selections, setSelections] = useState<IssueSelections>({
    templateId: "",
    patientId: "",
    appointmentId: "",
    encounterId: "",
    professionalId: "",
    financialId: "",
  });
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const resetAndClose = useCallback(() => {
    onOpenChange(false);
    setStep(1);
    router.refresh();
  }, [onOpenChange, router]);
  useDocumentsToast(state, resetAndClose);

  const selectedTemplate = data.templates.find((item) => item.id === selections.templateId);
  const activeAppointments = useMemo(
    () => data.appointments.filter((item) => !["cancelled", "no_show"].includes(item.status)),
    [data.appointments],
  );

  function applyTemplate(next: IssueSelections, template = selectedTemplate) {
    if (!template) return;
    setTitle(template.name);
    setContent(replaceVariables(template.content, data, next));
  }

  function selectTemplate(templateId: string) {
    const next = { ...selections, templateId };
    setSelections(next);
    applyTemplate(next, data.templates.find((item) => item.id === templateId));
  }

  function selectAppointment(appointmentId: string) {
    const appointment = data.appointments.find((item) => item.id === appointmentId);
    const linkedFinancial = data.financialEntries.find((item) => item.appointment_id === appointmentId);
    const next = {
      ...selections,
      appointmentId,
      encounterId: appointment?.encounter_id ?? "",
      patientId: appointment?.patient_id ?? selections.patientId,
      professionalId: appointment?.professional_member_id ?? selections.professionalId,
      financialId: linkedFinancial?.id ?? "",
    };
    setSelections(next);
    applyTemplate(next);
  }

  function updateSelection(key: keyof IssueSelections, value: string) {
    let next = { ...selections, [key]: value };
    if (key === "patientId") {
      const appointment = data.appointments.find((item) => item.id === selections.appointmentId);
      const financial = data.financialEntries.find((item) => item.id === selections.financialId);
      if ((appointment && appointment.patient_id !== value) || (financial?.patient_id && financial.patient_id !== value)) {
        next = {
          ...next,
          appointmentId: "",
          encounterId: "",
          financialId: "",
        };
      }
    }
    if (key === "financialId") {
      const financial = data.financialEntries.find((item) => item.id === value);
      const linkedAppointment = data.appointments.find((item) => item.id === financial?.appointment_id);
      next = {
        ...next,
        patientId: financial?.patient_id ?? next.patientId,
        appointmentId: linkedAppointment?.id ?? "",
        encounterId: linkedAppointment?.encounter_id ?? "",
        professionalId: linkedAppointment?.professional_member_id ?? next.professionalId,
      };
    }
    setSelections(next);
    if (selectedTemplate) applyTemplate(next);
  }

  const canContinue = Boolean(selectedTemplate);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Emitir documento" description="Vincule o contexto quando necessário, revise o conteúdo e emita com rastreabilidade." size="xl">
      <form action={action} className="grid gap-4">
        <input type="hidden" name="template_id" value={selections.templateId} />
        <input type="hidden" name="patient_id" value={selections.patientId} />
        <input type="hidden" name="appointment_id" value={selections.appointmentId} />
        <input type="hidden" name="encounter_id" value={selections.encounterId} />
        <input type="hidden" name="professional_member_id" value={selections.professionalId} />
        <input type="hidden" name="financial_entry_id" value={selections.financialId} />

        <div className="grid grid-cols-3 gap-2 border-b pb-4">
          {["Contexto", "Conteúdo", "Revisão"].map((label, index) => {
            const number = index + 1;
            return (
              <button type="button" key={label} disabled={number > step || (number > 1 && !canContinue)} onClick={() => setStep(number)} className={`flex h-9 items-center justify-center gap-2 rounded-md border text-xs font-medium ${step === number ? "border-primary bg-primary/5 text-primary" : "bg-background text-muted-foreground"}`}>
                <span className={`grid size-5 place-items-center rounded-full text-[11px] ${step > number ? "bg-emerald-600 text-white" : "bg-muted"}`}>{step > number ? <Check className="size-3" /> : number}</span>
                {label}
              </button>
            );
          })}
        </div>

        {step === 1 ? (
          <div className="grid gap-4">
            <section className="grid gap-3">
              <div>
                <p className="text-sm font-semibold">Modelo documental</p>
                <p className="text-xs text-muted-foreground">O modelo define a base, mas o texto final sempre pode ser revisado.</p>
              </div>
              <select value={selections.templateId} onChange={(event) => selectTemplate(event.target.value)} className={inputClass} required>
                <option value="">Selecione um modelo ativo</option>
                {data.templates.filter((item) => item.active).map((template) => <option key={template.id} value={template.id}>{typeLabels[template.template_type]} · {template.name}</option>)}
              </select>
              {selectedTemplate ? <div className="rounded-md border bg-muted/15 p-3 text-xs"><p className="font-medium">{selectedTemplate.description}</p><p className="mt-1 leading-5 text-muted-foreground">{selectedTemplate.legal_basis || "Sem orientação complementar cadastrada."}</p></div> : null}
            </section>

            <section className="grid gap-3 border-t pt-4">
              <div>
                <p className="text-sm font-semibold">Contexto inteligente</p>
                <p className="text-xs text-muted-foreground">Todos os vínculos são opcionais. Selecione uma consulta para preencher paciente e profissional automaticamente.</p>
              </div>
              {data.access.canUseSchedule ? (
                <label className="grid gap-1.5 text-xs font-medium">
                  Consulta relacionada
                  <select value={selections.appointmentId} onChange={(event) => selectAppointment(event.target.value)} className={inputClass}>
                    <option value="">Documento avulso, sem consulta</option>
                    {activeAppointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{appointmentLabel(appointment, data.patients)}</option>)}
                  </select>
                </label>
              ) : null}
              <div className="grid gap-3 lg:grid-cols-2">
                {data.access.canUsePatients ? (
                  <label className="grid gap-1.5 text-xs font-medium">
                    Paciente
                    <select value={selections.patientId} onChange={(event) => updateSelection("patientId", event.target.value)} className={inputClass}>
                      <option value="">Sem vínculo com paciente</option>
                      {data.patients.map((patient) => <option key={patient.id} value={patient.id}>{patientLabel(patient)}</option>)}
                    </select>
                  </label>
                ) : null}
                <label className="grid gap-1.5 text-xs font-medium">
                  Profissional responsável
                  <select value={selections.professionalId} onChange={(event) => updateSelection("professionalId", event.target.value)} className={inputClass}>
                    <option value="">Sem profissional específico</option>
                    {data.professionals.map((professional) => <option key={professional.id} value={professional.id}>{professionalLabel(professional)}</option>)}
                  </select>
                </label>
              </div>
              {data.access.canUseFinancial ? (
                <label className="grid gap-1.5 text-xs font-medium">
                  Lançamento financeiro
                  <select value={selections.financialId} onChange={(event) => updateSelection("financialId", event.target.value)} className={inputClass}>
                    <option value="">Sem vínculo financeiro</option>
                    {data.financialEntries.filter((entry) => !selections.patientId || !entry.patient_id || entry.patient_id === selections.patientId).map((entry) => <option key={entry.id} value={entry.id}>{financialLabel(entry)}</option>)}
                  </select>
                </label>
              ) : null}
            </section>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold">Conteúdo final</p><p className="text-xs text-muted-foreground">Variáveis conhecidas foram preenchidas. Revise os campos entre chaves que restaram.</p></div>
              <Button type="button" variant="outline" size="sm" onClick={() => applyTemplate(selections)}><FileCheck2 /> Reaplicar modelo</Button>
            </div>
            <label className="grid gap-1.5 text-xs font-medium">Título<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} required /></label>
            <label className="grid gap-1.5 text-xs font-medium">Texto do documento<textarea name="content" value={content} onChange={(event) => setContent(event.target.value)} className={`${textareaClass} min-h-[360px] leading-6`} required /></label>
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium">Validade, se aplicável<input type="date" name="expires_at" className={inputClass} /></label>
              <label className="grid gap-1.5 text-xs font-medium">Observação interna<input name="observations" className={inputClass} placeholder="Não aparece no corpo do documento" /></label>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4">
            <div className="grid gap-2 rounded-md border bg-muted/15 p-3 text-xs lg:grid-cols-3">
              <div><span className="text-muted-foreground">Modelo</span><p className="mt-1 font-medium">{selectedTemplate?.name}</p></div>
              <div><span className="text-muted-foreground">Paciente</span><p className="mt-1 font-medium">{data.patients.find((item) => item.id === selections.patientId)?.full_name || "Sem vínculo"}</p></div>
              <div><span className="text-muted-foreground">Profissional</span><p className="mt-1 font-medium">{data.professionals.find((item) => item.id === selections.professionalId)?.full_name || "Sem vínculo"}</p></div>
            </div>
            <article className="mx-auto w-full max-w-[760px] border bg-white px-10 py-9 text-slate-900 shadow-sm">
              <p className="text-center text-lg font-semibold">{title}</p>
              <div className="mt-7 whitespace-pre-wrap text-sm leading-7">{content}</div>
            </article>
            <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p>A emissão gera número único e preserva o conteúdo. Depois de emitido, correções devem ocorrer por cancelamento formal e nova emissão.</p>
            </div>
          </div>
        ) : null}

        <ModalFooter className="justify-between">
          <Button type="button" variant="outline" disabled={step === 1 || pending} onClick={() => setStep((current) => current - 1)}><ChevronLeft /> Voltar</Button>
          {step < 3 ? (
            <Button type="button" disabled={!canContinue || (step === 2 && (!title.trim() || content.trim().length < 40))} onClick={() => setStep((current) => current + 1)}>Continuar <ChevronRight /></Button>
          ) : (
            <div className="flex gap-2">
              <Button type="submit" name="status" value="draft" variant="outline" disabled={pending}><Save /> {pending ? "Salvando..." : "Salvar rascunho"}</Button>
              <Button type="submit" name="status" value="issued" disabled={pending}><FileCheck2 /> {pending ? "Emitindo..." : "Emitir documento"}</Button>
            </div>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}

function IssueDraftForm({ document, onCompleted }: { document: GeneratedDocumentSummary; onCompleted: () => void }) {
  const [state, action, pending] = useActionState(issueGeneratedDocumentAction, {});
  const done = useCallback(() => onCompleted(), [onCompleted]);
  useDocumentsToast(state, done);
  return <form action={action}><input type="hidden" name="document_id" value={document.id} /><Button disabled={pending}><FileCheck2 />{pending ? "Emitindo..." : "Emitir rascunho"}</Button></form>;
}

function CancelDocumentForm({ document, onCompleted }: { document: GeneratedDocumentSummary; onCompleted: () => void }) {
  const [state, action, pending] = useActionState(cancelGeneratedDocumentAction, {});
  const done = useCallback(() => onCompleted(), [onCompleted]);
  useDocumentsToast(state, done);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="document_id" value={document.id} />
      <label className="grid gap-1.5 text-xs font-medium">Motivo do cancelamento<textarea name="reason" className={`${textareaClass} min-h-24`} placeholder="Descreva por que este documento não deve mais ser utilizado." required minLength={5} /></label>
      <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-xs text-muted-foreground">O documento continuará no histórico, identificado como cancelado. O número não será reutilizado.</div>
      <ModalFooter><Button variant="destructive" disabled={pending}><Ban />{pending ? "Cancelando..." : "Confirmar cancelamento"}</Button></ModalFooter>
    </form>
  );
}

function DocumentDetail({
  document,
  data,
  onRefresh,
  onCancel,
}: {
  document: GeneratedDocumentSummary;
  data: DocumentsWorkspaceData;
  onRefresh: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-md border bg-muted/15 p-3 text-xs lg:grid-cols-4">
        <div><span className="text-muted-foreground">Número</span><div className="mt-1 flex items-center gap-1 font-medium"><span className="selectable">{document.document_number || "Ainda não emitido"}</span>{document.document_number ? <CopyButton value={document.document_number} label="número do documento" /> : null}</div></div>
        <div><span className="text-muted-foreground">Status</span><p className="mt-1"><Badge className={statusClass(document.status)}>{statusLabels[document.status]}</Badge></p></div>
        <div><span className="text-muted-foreground">Emitido em</span><p className="mt-1 font-medium">{formatDate(document.issued_at)}</p></div>
        <div><span className="text-muted-foreground">Validade</span><p className="mt-1 font-medium">{formatDate(document.expires_at, false)}</p></div>
      </div>

      <div className="grid gap-3 text-xs lg:grid-cols-3">
        <div className="rounded-md border p-3"><span className="text-muted-foreground">Paciente</span><p className="mt-1 font-medium">{document.patient?.social_name || document.patient?.full_name || "Sem vínculo"}</p>{document.patient?.cpf ? <div className="mt-1 flex items-center gap-1 text-muted-foreground"><span className="selectable">{formatCpf(document.patient.cpf)}</span><CopyButton value={document.patient.cpf} label="CPF" /></div> : null}</div>
        <div className="rounded-md border p-3"><span className="text-muted-foreground">Profissional</span><p className="mt-1 font-medium">{document.professional?.profile?.full_name || "Sem vínculo"}</p></div>
        <div className="rounded-md border p-3"><span className="text-muted-foreground">Origem</span><p className="mt-1 font-medium">{document.appointment ? `Consulta de ${formatDate(document.appointment.starts_at)}` : document.financial_entry?.description || "Documento avulso"}</p></div>
      </div>

      {document.status === "cancelled" ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"><p className="font-medium text-destructive">Documento cancelado</p><p className="mt-1 text-muted-foreground">{document.cancellation_reason}</p></div> : null}

      <section>
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Conteúdo preservado</p>
        <div className="selectable max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded-md border bg-background p-4 text-sm leading-6">{document.content}</div>
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Rastreabilidade</p>
        <div className="grid gap-2">
          {document.events.length ? document.events.map((event) => <div key={event.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs"><span className="flex items-center gap-2 font-medium"><Clock3 className="size-3.5 text-muted-foreground" />{eventLabels[event.event_type]}</span><span className="text-muted-foreground">{formatDate(event.created_at)}</span></div>) : <p className="rounded-md border p-3 text-xs text-muted-foreground">Nenhum evento complementar registrado.</p>}
        </div>
      </section>

      <ModalFooter>
        {document.status === "draft" ? <IssueDraftForm document={document} onCompleted={onRefresh} /> : null}
        {document.status !== "draft" && data.access.canExport ? <Button asChild variant="outline"><a href={`/api/documentos/${document.id}/imprimir`} target="_blank" rel="noreferrer"><Printer /> Imprimir ou salvar PDF <ExternalLink /></a></Button> : null}
        {document.status !== "cancelled" && data.access.canManage ? <Button type="button" variant="destructive" onClick={onCancel}><Ban /> Cancelar documento</Button> : null}
      </ModalFooter>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-40 place-items-center border-t px-4 py-8 text-center"><div><FileText className="mx-auto size-6 text-muted-foreground" /><p className="mt-2 text-sm font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div></div>;
}

export function DocumentsWorkspace({ data, section }: { data: DocumentsWorkspaceData; section: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<DocumentTemplate | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<GeneratedDocumentSummary | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const refresh = useCallback(() => {
    setSelectedDocument(null);
    setCancelling(false);
    router.refresh();
  }, [router]);

  const templates = useMemo(() => {
    if (section === "contracts") return data.templates.filter((template) => template.template_type === "service_contract" || template.template_type === "payment_acknowledgement");
    if (section === "consents") return data.templates.filter((template) => template.template_type === "lgpd_consent" || template.template_type === "procedure_consent");
    return data.templates;
  }, [data.templates, section]);

  const filteredDocuments = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    return data.generatedDocuments.filter((document) => {
      if (status !== "all" && document.status !== status) return false;
      if (!normalized) return true;
      return [document.title, document.document_number, document.patient?.full_name, document.patient?.social_name, document.template?.name].some((value) => value?.toLocaleLowerCase("pt-BR").includes(normalized));
    });
  }, [data.generatedDocuments, search, status]);
  const pageCount = Math.max(1, Math.ceil(filteredDocuments.length / pageSize));
  const visibleDocuments = filteredDocuments.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [search, status]);

  const issuedCount = data.generatedDocuments.filter((item) => item.status === "issued" || item.status === "signed").length;
  const draftCount = data.generatedDocuments.filter((item) => item.status === "draft").length;

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div>
          <h1 className="text-xl font-semibold">Documentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Emissão inteligente, modelos versionados e histórico rastreável por clínica.</p>
        </div>
        <div className="flex gap-2">
          {data.access.canManage && section !== "history" ? <Button size="sm" variant="outline" onClick={() => setCreatingTemplate(true)}><FilePlus2 /> Novo modelo</Button> : null}
          {(data.access.canCreate || data.access.canManage) ? <Button size="sm" onClick={() => setIssuing(true)}><FileCheck2 /> Emitir documento</Button> : null}
        </div>
      </header>

      <section className="grid gap-2 lg:grid-cols-4">
        <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2.5"><div><p className="text-lg font-semibold tabular-nums">{data.templates.filter((item) => item.active).length}</p><p className="text-xs text-muted-foreground">Modelos ativos</p></div><FileText className="size-4 text-primary" /></div>
        <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2.5"><div><p className="text-lg font-semibold tabular-nums">{issuedCount}</p><p className="text-xs text-muted-foreground">Emitidos</p></div><FileCheck2 className="size-4 text-emerald-600" /></div>
        <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2.5"><div><p className="text-lg font-semibold tabular-nums">{draftCount}</p><p className="text-xs text-muted-foreground">Rascunhos</p></div><Pencil className="size-4 text-amber-600" /></div>
        <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2.5"><div><p className="text-lg font-semibold tabular-nums">{data.generatedDocuments.length}</p><p className="text-xs text-muted-foreground">Histórico total</p></div><History className="size-4 text-primary" /></div>
      </section>

      {section === "history" ? (
        <section className="overflow-hidden rounded-md border bg-card">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b px-4 py-3">
            <div><p className="text-sm font-semibold">Histórico documental</p><p className="text-xs text-muted-foreground">Documentos avulsos ou vinculados a paciente, consulta e financeiro.</p></div>
            <div className="flex gap-2">
              <label className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar documento ou paciente" className={`${inputClass} w-64 pl-8`} /></label>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className={`${inputClass} w-36`}><option value="all">Todos os status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </div>
          </div>
          {visibleDocuments.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-[13px]">
                  <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2.5">Número</th><th className="px-3 py-2.5">Documento</th><th className="px-3 py-2.5">Paciente</th><th className="px-3 py-2.5">Origem</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Data</th><th className="sticky right-0 bg-muted/40 px-3 py-2.5 text-right">Ação</th></tr></thead>
                  <tbody>{visibleDocuments.map((document) => <tr key={document.id} className="border-t hover:bg-muted/20"><td className="selectable whitespace-nowrap px-3 py-2.5 font-mono text-xs">{document.document_number || "Rascunho"}</td><td className="max-w-60 px-3 py-2.5"><p className="truncate font-medium" title={document.title}>{document.title}</p><p className="truncate text-xs text-muted-foreground">{document.template?.name ?? "Modelo livre"}</p></td><td className="max-w-48 truncate px-3 py-2.5">{document.patient?.social_name || document.patient?.full_name || "Sem vínculo"}</td><td className="px-3 py-2.5 text-xs text-muted-foreground">{document.appointment ? "Consulta" : document.financial_entry ? "Financeiro" : "Avulso"}</td><td className="px-3 py-2.5"><Badge className={statusClass(document.status)}>{statusLabels[document.status]}</Badge></td><td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{formatDate(document.issued_at || document.created_at)}</td><td className="sticky right-0 bg-card px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => setSelectedDocument(document)}>Detalhar</Button></td></tr>)}</tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground"><span>{filteredDocuments.length} registro(s)</span><div className="flex items-center gap-2"><Button size="icon" variant="ghost" className="size-8" disabled={page === 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft /></Button><span className="tabular-nums">{page} de {pageCount}</span><Button size="icon" variant="ghost" className="size-8" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}><ChevronRight /></Button></div></div>
            </>
          ) : <EmptyState title="Nenhum documento encontrado" description="Ajuste os filtros ou emita o primeiro documento da clínica." />}
        </section>
      ) : section === "preferences" ? (
        <section className="grid gap-4 rounded-md border bg-card p-4">
          <div><p className="text-sm font-semibold">Preferências documentais</p><p className="text-xs text-muted-foreground">Configurações e padrões aplicados à central de emissão.</p></div>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-md border p-3"><ShieldCheck className="size-4 text-primary" /><p className="mt-2 text-sm font-medium">Conteúdo imutável</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Após a emissão, o texto é preservado. Correções exigem cancelamento e nova emissão.</p></div>
            <div className="rounded-md border p-3"><UserRound className="size-4 text-primary" /><p className="mt-2 text-sm font-medium">Contexto opcional</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Paciente, consulta, profissional e financeiro podem ser vinculados conforme o documento.</p></div>
            <div className="rounded-md border p-3"><History className="size-4 text-primary" /><p className="mt-2 text-sm font-medium">Trilha documental</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Criação, emissão, impressão e cancelamento permanecem registrados.</p></div>
          </div>
          <div className="rounded-md border bg-muted/15 p-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Variáveis disponíveis:</strong> {"{{clinica_nome}}, {{clinica_documento}}, {{paciente_nome}}, {{paciente_cpf}}, {{profissional_nome}}, {{profissional_registro}}, {{servico_nome}}, {{consulta_data}}, {{consulta_hora}}, {{valor}}, {{vencimento}}, {{cidade_data}}."}</div>
          <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Revisão obrigatória:</strong> os modelos fornecidos são referências operacionais. Consentimentos, contratos e avisos de privacidade devem ser adequados à especialidade, ao procedimento e às orientações jurídica e técnica da clínica.</div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-md border bg-card">
          <div className="border-b px-4 py-3"><p className="text-sm font-semibold">{section === "contracts" ? "Contratos e ciência financeira" : section === "consents" ? "Consentimentos e privacidade" : "Biblioteca de modelos"}</p><p className="text-xs text-muted-foreground">Modelos da clínica com controle de versão e ativação.</p></div>
          {templates.length ? <div className="divide-y">{templates.map((template) => <article key={template.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{template.name}</p><Badge className="bg-muted text-muted-foreground">{typeLabels[template.template_type]}</Badge><Badge className={template.active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}>{template.active ? "Ativo" : "Inativo"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{template.description || "Sem descrição."}</p><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{template.legal_basis}</p></div><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">v{template.version_number}</span><Button size="sm" variant="outline" disabled={!data.access.canEdit && !data.access.canManage} onClick={() => setEditing(template)}><Pencil /> Editar</Button></div></article>)}</div> : <EmptyState title="Nenhum modelo nesta categoria" description="Crie um modelo para começar a emitir documentos." />}
        </section>
      )}

      <IssueDocumentModal open={issuing} onOpenChange={setIssuing} data={data} />
      <Modal open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} title="Editar modelo" description="Uma nova versão será criada sem alterar documentos já emitidos." size="xl">{editing ? <TemplateForm template={editing} onCompleted={() => { setEditing(null); router.refresh(); }} /> : null}</Modal>
      <Modal open={creatingTemplate} onOpenChange={setCreatingTemplate} title="Novo modelo documental" description="Crie uma base reutilizável para a clínica." size="xl"><TemplateForm onCompleted={() => { setCreatingTemplate(false); router.refresh(); }} /></Modal>
      <Modal open={Boolean(selectedDocument) && !cancelling} onOpenChange={(open) => !open && setSelectedDocument(null)} title={selectedDocument?.title || "Detalhes do documento"} description="Conteúdo, vínculos e histórico da emissão." size="xl">{selectedDocument ? <DocumentDetail document={selectedDocument} data={data} onRefresh={refresh} onCancel={() => setCancelling(true)} /> : null}</Modal>
      <Modal open={cancelling} onOpenChange={setCancelling} title="Cancelar documento" description="Informe o motivo para preservar a rastreabilidade da correção." size="sm">{selectedDocument ? <CancelDocumentForm document={selectedDocument} onCompleted={refresh} /> : null}</Modal>
    </div>
  );
}
