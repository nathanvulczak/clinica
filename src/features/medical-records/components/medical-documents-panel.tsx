"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { FileDown, FileText, Printer, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { PRESCRIPTION_TEMPLATES } from "@/features/medical-records/config";
import {
  deleteMedicalDocumentAction,
  logMedicalDocumentEventAction,
  saveMedicalDocumentAction,
  type MedicalDocumentActionState,
} from "@/features/medical-records/actions";
import type {
  MedicalDocumentEvent,
  MedicalPrescription,
  MedicalRecordEncounterDetail,
} from "@/repositories/medical-records";

function formatDate(value: string | null | undefined) {
  if (!value) return "Nao informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function registryFromDetail(detail: MedicalRecordEncounterDetail) {
  const profile = detail.professional_profile;
  if (!profile?.council_number) return "";
  return [profile.council_type, profile.council_number, profile.council_state]
    .filter(Boolean)
    .join(" ");
}

function fillTemplate(template: string, detail: MedicalRecordEncounterDetail) {
  const patientName = detail.patient?.social_name || detail.patient?.full_name || "Paciente";
  const professionalName = detail.professional?.profile?.full_name || "Profissional";
  const registry = registryFromDetail(detail);
  const date = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  return template
    .replaceAll("{{patient_name}}", patientName)
    .replaceAll("{{professional_name}}", registry ? `${professionalName} - ${registry}` : professionalName)
    .replaceAll("{{date}}", date);
}

function DocumentForm({
  detail,
  document,
  onDone,
}: {
  detail: MedicalRecordEncounterDetail;
  document?: MedicalPrescription | null;
  onDone: () => void;
}) {
  const [templateKey, setTemplateKey] = useState(document?.template_key ?? "");
  const [title, setTitle] = useState(document?.title ?? "");
  const [content, setContent] = useState(document?.content ?? "");
  const [state, formAction, pending] = useActionState<MedicalDocumentActionState, FormData>(
    saveMedicalDocumentAction,
    {},
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) {
      toast({ title: "Documento nao salvo", description: state.error, variant: "destructive" });
    }
    if (state.success) {
      toast({ title: "Documento clinico", description: state.success });
      onDone();
    }
  }, [onDone, state.error, state.success, toast]);

  function applyTemplate(key: string) {
    const template = PRESCRIPTION_TEMPLATES.find((item) => item.key === key);
    setTemplateKey(key);
    if (!template) return;
    setTitle(template.title);
    setContent(fillTemplate(template.content, detail));
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="encounter_id" value={detail.id} />
      <input type="hidden" name="medical_record_id" value={detail.medical_record?.id ?? ""} />
      <input type="hidden" name="document_id" value={document?.id ?? ""} />
      <input type="hidden" name="template_key" value={templateKey} />

      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        <label className="grid gap-2 text-sm font-medium">
          Modelo
          <Select value={templateKey} onChange={(event) => applyTemplate(event.target.value)}>
            <option value="">Selecionar modelo</option>
            {PRESCRIPTION_TEMPLATES.map((template) => (
              <option key={template.key} value={template.key}>
                {template.title}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Titulo
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        Registro profissional
        <input
          name="professional_registry"
          defaultValue={document?.professional_registry ?? registryFromDetail(detail)}
          placeholder="Ex.: CRM 12345 PR"
          className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Conteudo
        <textarea
          name="content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="min-h-72 rounded-md border bg-background px-3 py-2 font-mono text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <div className="flex justify-end gap-2">
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          name="action"
          value="draft"
        >
          <Save />
          {pending ? "Salvando..." : "Salvar rascunho"}
        </Button>
        <Button type="submit" disabled={pending} name="action" value="issue">
          <FileText />
          {pending ? "Emitindo..." : "Emitir documento"}
        </Button>
      </div>
    </form>
  );
}

function DeleteDocumentForm({
  document,
  onDone,
}: {
  document: MedicalPrescription;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<MedicalDocumentActionState, FormData>(
    deleteMedicalDocumentAction,
    {},
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) {
      toast({ title: "Documento nao excluido", description: state.error, variant: "destructive" });
    }
    if (state.success) {
      toast({ title: "Documento clinico", description: state.success });
      onDone();
    }
  }, [onDone, state.error, state.success, toast]);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="document_id" value={document.id} />
      <label className="grid gap-2 text-sm font-medium">
        Motivo da exclusao
        <textarea
          name="reason"
          className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Explique o motivo. O documento continuara visivel no historico do paciente."
        />
      </label>
      <div className="flex justify-end">
        <Button variant="destructive" disabled={pending}>
          <Trash2 />
          {pending ? "Excluindo..." : "Confirmar exclusao"}
        </Button>
      </div>
    </form>
  );
}

export function MedicalDocumentsPanel({
  detail,
}: {
  detail: MedicalRecordEncounterDetail;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MedicalPrescription | null>(null);
  const [deleting, setDeleting] = useState<MedicalPrescription | null>(null);
  const [previewing, setPreviewing] = useState<MedicalPrescription | null>(null);
  const [printingDocument, setPrintingDocument] = useState<MedicalPrescription | null>(null);
  const [confirmPrint, setConfirmPrint] = useState<"printed" | "exported_pdf" | null>(null);
  const [, startTransition] = useTransition();
  const eventFormRef = useRef<HTMLFormElement>(null);
  const [eventState, eventAction] = useActionState<MedicalDocumentActionState, FormData>(
    logMedicalDocumentEventAction,
    {},
  );
  const { toast } = useToast();

  const eventsByDocument = useMemo(() => {
    const map = new Map<string, MedicalDocumentEvent[]>();
    for (const event of detail.document_events) {
      const list = map.get(event.medical_document_id) ?? [];
      list.push(event);
      map.set(event.medical_document_id, list);
    }
    return map;
  }, [detail.document_events]);

  useEffect(() => {
    if (eventState.success) {
      toast({ title: "Documento clinico", description: eventState.success });
    }
  }, [eventState.success, toast]);

  function requestPrint(type: "printed" | "exported_pdf", document: MedicalPrescription) {
    setPrintingDocument(document);
    setConfirmPrint(type);
  }

  function escapeHtml(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function openPrintableDocument(document: MedicalPrescription) {
    const patientName = detail.patient?.social_name || detail.patient?.full_name || "Paciente";
    const professionalName = detail.professional?.profile?.full_name || "Profissional";
    const registry = document.professional_registry || registryFromDetail(detail) || "Nao informado";
    const printable = window.open("", "_blank", "width=900,height=1000");
    if (!printable) {
      toast({
        title: "Impressao bloqueada",
        description: "Permita pop-ups para abrir a janela de impressao/PDF.",
        variant: "destructive",
      });
      return;
    }

    printable.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(document.title)}</title>
    <style>
      @page { size: A4; margin: 18mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; color: #111827; margin: 0; line-height: 1.55; }
      header { border-bottom: 1px solid #d1d5db; padding-bottom: 14px; margin-bottom: 24px; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      .meta { font-size: 12px; color: #4b5563; }
      pre { white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 13px; margin: 0; }
      footer { border-top: 1px solid #d1d5db; margin-top: 36px; padding-top: 16px; font-size: 12px; color: #4b5563; }
      .signature { margin-top: 48px; text-align: center; }
      .line { border-top: 1px solid #111827; width: 280px; margin: 0 auto 8px; }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(document.title)}</h1>
      <div class="meta">Paciente: ${escapeHtml(patientName)}</div>
      <div class="meta">Data: ${escapeHtml(formatDate(document.updated_at))}</div>
    </header>
    <main>
      <pre>${escapeHtml(document.content)}</pre>
      <div class="signature">
        <div class="line"></div>
        <strong>${escapeHtml(professionalName)}</strong><br />
        ${escapeHtml(registry)}
      </div>
    </main>
    <footer>
      Documento emitido pelo CliniCore com rastreabilidade no prontuario do paciente.
    </footer>
    <script>
      window.onload = function () {
        window.focus();
        window.print();
      };
    </script>
  </body>
</html>`);
    printable.document.close();
  }

  function printCurrentDocument() {
    if (!printingDocument || !confirmPrint) return;
    const form = eventFormRef.current;
    if (form) {
      const eventInput = form.elements.namedItem("event_type") as HTMLInputElement | null;
      const documentInput = form.elements.namedItem("document_id") as HTMLInputElement | null;
      if (eventInput) eventInput.value = confirmPrint;
      if (documentInput) documentInput.value = printingDocument.id;
      startTransition(() => eventAction(new FormData(form)));
    }
    openPrintableDocument(printingDocument);
    setConfirmPrint(null);
    setPrintingDocument(null);
  }

  return (
    <section className="grid gap-4 rounded-lg border bg-card p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="font-medium">Receitas e documentos</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Emita, imprima, exporte e mantenha historico auditavel dos documentos do paciente.
          </p>
        </div>
        <Button type="button" onClick={() => { setEditing(null); setOpen(true); }}>
          <FileText />
          Novo documento
        </Button>
      </div>

      <div className="grid gap-3">
        {detail.prescriptions.length ? (
          detail.prescriptions.map((document) => {
            const deleted = document.status === "deleted" || Boolean(document.deleted_at);

            return (
              <article key={document.id} className="rounded-md border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{document.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {document.status} | atualizado em {formatDate(document.updated_at)}
                    </p>
                    {deleted ? (
                      <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        Excluido do uso operacional. Motivo: {document.deleted_reason ?? "Nao informado"}.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setPreviewing(document)}>
                      Visualizar
                    </Button>
                    {!deleted ? (
                      <>
                        <Button type="button" size="sm" variant="outline" onClick={() => requestPrint("printed", document)}>
                          <Printer />
                          Imprimir
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => requestPrint("exported_pdf", document)}>
                          <FileDown />
                          PDF
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => { setEditing(document); setOpen(true); }}>
                          Editar
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setDeleting(document)}>
                          <Trash2 />
                          Excluir
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Historico: {(eventsByDocument.get(document.id) ?? [])
                    .slice(0, 4)
                    .map((event) => `${event.event_type} em ${formatDate(event.created_at)}`)
                    .join(" | ") || "Sem eventos adicionais"}
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum documento emitido para este atendimento.
          </div>
        )}
      </div>

      <form ref={eventFormRef} action={eventAction} className="hidden">
        <input type="hidden" name="document_id" />
        <input type="hidden" name="event_type" />
      </form>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Editar documento" : "Novo documento"}
        description="Selecione um modelo, ajuste o conteudo e salve no historico do prontuario."
        className="max-w-4xl"
      >
        <DocumentForm
          detail={detail}
          document={editing}
          onDone={() => {
            setOpen(false);
            setEditing(null);
          }}
        />
      </Modal>

      <Modal
        open={Boolean(previewing)}
        onOpenChange={(value) => {
          if (!value) setPreviewing(null);
        }}
        title={previewing?.title ?? "Documento"}
        description="Visualizacao para impressao ou conferencia."
        className="max-w-3xl"
      >
        {previewing ? (
          <div id="medical-document-print-area" className="grid gap-4">
            <div className="rounded-md border bg-background p-6 text-sm leading-7">
              <pre className="whitespace-pre-wrap font-sans">{previewing.content}</pre>
              <div className="mt-6 border-t pt-4 text-xs text-muted-foreground">
                Registro profissional: {previewing.professional_registry || registryFromDetail(detail) || "Nao informado"}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onOpenChange={(value) => {
          if (!value) setDeleting(null);
        }}
        title="Excluir documento"
        description="A exclusao remove o documento do uso operacional, mas preserva historico, conteudo e motivo no prontuario."
        className="max-w-lg"
      >
        {deleting ? <DeleteDocumentForm document={deleting} onDone={() => setDeleting(null)} /> : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmPrint)}
        onOpenChange={(value) => {
          if (!value) setConfirmPrint(null);
        }}
        title={confirmPrint === "exported_pdf" ? "Exportar como PDF?" : "Imprimir documento?"}
        description="A acao sera registrada na auditoria e no historico do documento."
        confirmLabel={confirmPrint === "exported_pdf" ? "Abrir impressao/PDF" : "Imprimir"}
        onConfirm={printCurrentDocument}
      />
    </section>
  );
}
