"use client";

import { useActionState, useEffect, useState } from "react";
import { Download, FileUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  deleteMedicalAttachmentAction,
  uploadMedicalAttachmentAction,
  type MedicalDocumentActionState,
} from "@/features/medical-records/actions";
import type { MedicalRecordAttachment, MedicalRecordEncounterDetail } from "@/repositories/medical-records";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatSize(value: number) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function UploadForm({
  detail,
  onDone,
}: {
  detail: MedicalRecordEncounterDetail;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<MedicalDocumentActionState, FormData>(
    uploadMedicalAttachmentAction,
    {},
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) {
      toast({ title: "Anexo nao salvo", description: state.error, variant: "destructive" });
    }
    if (state.success) {
      toast({ title: "Anexo clinico", description: state.success });
      onDone();
    }
  }, [onDone, state.error, state.success, toast]);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="encounter_id" value={detail.id} />
      <input type="hidden" name="medical_record_id" value={detail.medical_record?.id ?? ""} />
      <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
        <label className="grid gap-2 text-sm font-medium">
          Tipo
          <Select name="category" defaultValue="exam">
            <option value="exam">Exame</option>
            <option value="report">Laudo</option>
            <option value="image">Imagem</option>
            <option value="attachment">Anexo</option>
            <option value="other">Outro</option>
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Titulo
          <input
            name="title"
            className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Ex.: Hemograma, raio-x, laudo externo"
          />
        </label>
      </div>
      <label className="grid gap-2 text-sm font-medium">
        Descricao
        <textarea
          name="description"
          className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Arquivo
        <input
          type="file"
          name="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,text/plain"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <span className="text-xs font-normal text-muted-foreground">
          Ate 10 MB. Formatos: PDF, JPG, PNG, WEBP ou TXT.
        </span>
      </label>
      <div className="flex justify-end">
        <Button disabled={pending}>
          <FileUp />
          {pending ? "Enviando..." : "Anexar"}
        </Button>
      </div>
    </form>
  );
}

function DeleteAttachmentForm({
  attachment,
  onDone,
}: {
  attachment: MedicalRecordAttachment;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<MedicalDocumentActionState, FormData>(
    deleteMedicalAttachmentAction,
    {},
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) {
      toast({ title: "Anexo nao removido", description: state.error, variant: "destructive" });
    }
    if (state.success) {
      toast({ title: "Anexo clinico", description: state.success });
      onDone();
    }
  }, [onDone, state.error, state.success, toast]);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="attachment_id" value={attachment.id} />
      <label className="grid gap-2 text-sm font-medium">
        Motivo da exclusao
        <textarea
          name="reason"
          className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Explique por que o anexo deve sair do uso operacional."
        />
      </label>
      <div className="flex justify-end">
        <Button variant="destructive" disabled={pending}>
          <Trash2 />
          {pending ? "Removendo..." : "Confirmar exclusao"}
        </Button>
      </div>
    </form>
  );
}

export function MedicalAttachmentsPanel({ detail }: { detail: MedicalRecordEncounterDetail }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<MedicalRecordAttachment | null>(null);

  return (
    <section className="grid gap-4 rounded-lg border bg-card p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="font-medium">Anexos e exames</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Centralize exames, laudos e documentos externos vinculados ao atendimento.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setUploadOpen(true)}>
          <FileUp />
          Novo anexo
        </Button>
      </div>

      <div className="grid gap-3">
        {detail.attachments.length ? (
          detail.attachments.map((attachment) => {
            const deleted = attachment.status === "deleted" || Boolean(attachment.deleted_at);
            return (
              <article key={attachment.id} className="rounded-md border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{attachment.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {attachment.category} | {attachment.file_name} | {formatSize(attachment.file_size)} |{" "}
                      {formatDate(attachment.created_at)}
                    </p>
                    {attachment.description ? (
                      <p className="mt-2 text-sm text-muted-foreground">{attachment.description}</p>
                    ) : null}
                    {deleted ? (
                      <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                        Removido do uso operacional. Motivo: {attachment.deleted_reason ?? "Nao informado"}.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!deleted && attachment.signed_url ? (
                      <Button asChild type="button" size="sm" variant="outline">
                        <a href={attachment.signed_url} target="_blank" rel="noreferrer">
                          <Download />
                          Abrir
                        </a>
                      </Button>
                    ) : null}
                    {!deleted ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => setDeleting(attachment)}>
                        <Trash2 />
                        Excluir
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum exame ou anexo vinculado a este prontuario.
          </div>
        )}
      </div>

      <Modal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        title="Novo anexo ou exame"
        description="O arquivo sera armazenado de forma privada e o acesso sera rastreado no prontuario."
        className="max-w-2xl"
      >
        <UploadForm detail={detail} onDone={() => setUploadOpen(false)} />
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onOpenChange={(value) => {
          if (!value) setDeleting(null);
        }}
        title="Excluir anexo"
        description="A exclusao e logica: o historico permanece preservado no prontuario."
        className="max-w-lg"
      >
        {deleting ? <DeleteAttachmentForm attachment={deleting} onDone={() => setDeleting(null)} /> : null}
      </Modal>
    </section>
  );
}
