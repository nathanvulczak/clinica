"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { FileCheck2, FileText, History, Scale, Save, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { saveDocumentTemplateAction, type DocumentsActionState } from "@/features/documents/actions";
import type { DocumentTemplate, DocumentTemplateType } from "@/types/domain";
import type { DocumentsWorkspace as DocumentsWorkspaceData } from "@/repositories/documents";

const typeLabels: Record<DocumentTemplateType, string> = {
  service_contract: "Contrato",
  lgpd_consent: "LGPD",
  procedure_consent: "Consentimento",
  payment_acknowledgement: "Ciência financeira",
  attendance_declaration: "Declaração",
  receipt: "Recibo",
  other: "Outro",
};

function useDocumentsToast(state: DocumentsActionState, onCompleted?: () => void) {
  const { toast } = useToast();
  useEffect(() => {
    if (state.error) toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
    if (state.success) {
      toast({ title: "Documentos", description: state.success });
      onCompleted?.();
    }
  }, [onCompleted, state, toast]);
}

function TemplateForm({ template, onCompleted }: { template: DocumentTemplate; onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(saveDocumentTemplateAction, {});
  const [content, setContent] = useState(template.content);
  const [fileName, setFileName] = useState(template.accepted_file_name ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  useDocumentsToast(state, onCompleted);

  async function readFile(file: File) {
    if (!/\.(txt|md)$/i.test(file.name)) {
      setFileName("");
      return;
    }
    const text = await file.text();
    setContent(text);
    setFileName(file.name);
  }

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={template.id} />
      <input type="hidden" name="accepted_file_name" value={fileName} />
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Nome do modelo
          <input name="name" defaultValue={template.name} className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm font-medium lg:mt-6">
          <input name="active" type="checkbox" defaultChecked={template.active} className="size-4" />
          Modelo ativo
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">
        Descrição
        <input name="description" defaultValue={template.description ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Base legal / observação jurídica
        <textarea name="legal_basis" defaultValue={template.legal_basis ?? ""} className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <div className="grid gap-2 rounded-md border bg-muted/15 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Arquivo padrão da clínica</p>
            <p className="text-xs text-muted-foreground">Aceitamos `.txt` ou `.md` para substituir o texto do modelo. Logos vêm da Identidade da clínica.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload />
            Enviar arquivo
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={(event) => event.target.files?.[0] && readFile(event.target.files[0])} />
        {fileName ? <p className="text-xs text-muted-foreground">Arquivo carregado: {fileName}</p> : null}
      </div>
      <label className="grid gap-1.5 text-sm font-medium">
        Conteúdo do modelo
        <textarea name="content" value={content} onChange={(event) => setContent(event.target.value)} className="min-h-[360px] rounded-md border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <div className="flex justify-end">
        <Button disabled={pending}><Save />{pending ? "Salvando..." : "Salvar modelo"}</Button>
      </div>
    </form>
  );
}

export function DocumentsWorkspace({ data, section }: { data: DocumentsWorkspaceData; section: string }) {
  const [editing, setEditing] = useState<DocumentTemplate | null>(null);
  const templates = useMemo(() => {
    if (section === "contracts") return data.templates.filter((template) => template.template_type === "service_contract" || template.template_type === "payment_acknowledgement");
    if (section === "consents") return data.templates.filter((template) => template.template_type === "lgpd_consent" || template.template_type === "procedure_consent");
    return data.templates;
  }, [data.templates, section]);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold">Documentos e contratos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Modelos versionados, base legal, identidade visual da clínica e histórico documental por paciente.
          </p>
        </div>
        <Badge className="bg-primary/10 text-primary">Modelos padrão ativos</Badge>
      </header>

      <section className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-3.5"><FileText className="size-4 text-primary" /><p className="mt-2 text-xl font-semibold">{data.templates.length}</p><p className="text-xs text-muted-foreground">Modelos configurados</p></div>
        <div className="rounded-lg border bg-card p-3.5"><FileCheck2 className="size-4 text-emerald-600" /><p className="mt-2 text-xl font-semibold">{data.templates.filter((item) => item.active).length}</p><p className="text-xs text-muted-foreground">Modelos ativos</p></div>
        <div className="rounded-lg border bg-card p-3.5"><History className="size-4 text-primary" /><p className="mt-2 text-xl font-semibold">{data.generatedDocuments.length}</p><p className="text-xs text-muted-foreground">Documentos gerados</p></div>
        <div className="rounded-lg border bg-card p-3.5"><Scale className="size-4 text-primary" /><p className="mt-2 text-xl font-semibold">LGPD</p><p className="text-xs text-muted-foreground">Rastreabilidade e versões</p></div>
      </section>

      {section === "history" ? (
        <section className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3"><p className="font-medium">Histórico documental</p><p className="text-sm text-muted-foreground">Documentos emitidos, impressos ou salvos por paciente.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-[13px]"><thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2.5">Documento</th><th className="px-3 py-2.5">Paciente</th><th className="px-3 py-2.5">Modelo</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Data</th></tr></thead><tbody>{data.generatedDocuments.map((document) => <tr key={document.id} className="border-t"><td className="px-3 py-2.5 font-medium">{document.title}</td><td className="px-3 py-2.5">{document.patient?.social_name || document.patient?.full_name || "Sem paciente"}</td><td className="px-3 py-2.5">{document.template?.name ?? "Modelo livre"}</td><td className="px-3 py-2.5">{document.status}</td><td className="px-3 py-2.5">{new Date(document.created_at).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div>
        </section>
      ) : section === "preferences" ? (
        <section className="grid gap-3 rounded-lg border bg-card p-4">
          <p className="font-medium">Preferências documentais</p>
          <p className="text-sm text-muted-foreground">
            A identidade visual aplicada aos PDFs vem de Administração &gt; Identidade e documentos. Os modelos aceitam variáveis como paciente, clínica, profissional, serviço, valor e vencimento.
          </p>
          <div className="grid gap-2 text-sm lg:grid-cols-3">
            <div className="rounded-md border bg-background p-3"><strong>Versão preservada</strong><p className="mt-1 text-xs text-muted-foreground">Cada alteração cria versão para não mudar documentos antigos.</p></div>
            <div className="rounded-md border bg-background p-3"><strong>Base legal visível</strong><p className="mt-1 text-xs text-muted-foreground">O usuário entende o fundamento antes de emitir.</p></div>
            <div className="rounded-md border bg-background p-3"><strong>Logos centralizados</strong><p className="mt-1 text-xs text-muted-foreground">Cabeçalho e marcas usam a identidade da clínica.</p></div>
          </div>
        </section>
      ) : (
        <section className="grid gap-3">
          {templates.map((template) => (
            <article key={template.id} className="grid gap-3 rounded-lg border bg-card p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{template.name}</p>
                  <Badge className="bg-muted text-muted-foreground">{typeLabels[template.template_type]}</Badge>
                  <Badge className={template.active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}>{template.active ? "Ativo" : "Inativo"}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{template.legal_basis}</p>
              </div>
              <div className="flex items-center gap-2 lg:justify-end">
                <span className="text-xs text-muted-foreground">v{template.version_number}</span>
                <Button size="sm" variant="outline" disabled={!data.access.canEdit && !data.access.canManage} onClick={() => setEditing(template)}>
                  Editar modelo
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}

      <Modal open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} title="Editar modelo documental" description="A alteração cria uma nova versão; documentos antigos permanecem preservados." className="max-w-5xl">
        {editing ? <TemplateForm template={editing} onCompleted={() => setEditing(null)} /> : null}
      </Modal>
    </div>
  );
}
