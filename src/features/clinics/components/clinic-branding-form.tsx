"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FileImage, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { saveClinicBrandingAction } from "@/features/clinics/branding-actions";
import type { ClinicBrandingView } from "@/repositories/clinic-branding";

type LogoFieldProps = {
  id: string;
  name: string;
  label: string;
  hint: string;
  currentUrl: string | null;
  previewClass: string;
};

function LogoField({ id, name, label, hint, currentUrl, previewClass }: LogoFieldProps) {
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const localUrl = useRef<string | null>(null);

  useEffect(() => () => {
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
  }, []);

  return (
    <label htmlFor={id} className="grid gap-3 rounded-md border bg-background p-3 text-sm">
      <div className="flex items-start gap-3">
        <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/30 ${previewClass}`}>
          {preview ? <span className="size-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${preview})` }} /> : <FileImage className="size-5 text-muted-foreground" />}
        </div>
        <div className="min-w-0">
          <p className="font-medium">{label}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
        </div>
      </div>
      <Input
        id={id}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (localUrl.current) URL.revokeObjectURL(localUrl.current);
          localUrl.current = URL.createObjectURL(file);
          setPreview(localUrl.current);
        }}
      />
    </label>
  );
}

export function ClinicBrandingForm({ branding }: { branding: ClinicBrandingView }) {
  const [state, action, pending] = useActionState(saveClinicBrandingAction, {});
  const { toast } = useToast();
  const notified = useRef<string | null>(null);

  useEffect(() => {
    const message = state.error ?? state.success;
    if (!message || notified.current === message) return;
    notified.current = message;
    toast({
      title: state.error ? "Não foi possível salvar" : "Identidade atualizada",
      description: message,
      variant: state.error ? "destructive" : "default",
    });
  }, [state.error, state.success, toast]);

  return (
    <form action={action} className="grid gap-5">
      <section className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Marcas para documentos</h2>
          <p className="mt-1 text-xs text-muted-foreground">O sistema otimiza as imagens e escolhe a versão adequada em cada documento.</p>
        </div>
        <div className="grid gap-3 p-4 xl:grid-cols-3">
          <LogoField id="horizontal_logo_file" name="horizontal_logo_file" label="Marca principal horizontal" hint="Cabeçalhos de prontuários, relatórios e recibos. Mínimo 400 x 100 px." currentUrl={branding.horizontal_logo_url} previewClass="h-16 w-36" />
          <LogoField id="compact_logo_file" name="compact_logo_file" label="Marca compacta" hint="Espaços reduzidos e identificação rápida. Preferencialmente quadrada, mínimo 200 x 200 px." currentUrl={branding.compact_logo_url} previewClass="size-16" />
          <LogoField id="vertical_logo_file" name="vertical_logo_file" label="Marca vertical" hint="Capas e documentos com composição vertical. Mínimo 220 x 360 px." currentUrl={branding.vertical_logo_url} previewClass="h-20 w-14" />
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Padrão institucional</h2>
          <p className="mt-1 text-xs text-muted-foreground">Aplicado aos novos PDFs e documentos gerados pela clínica.</p>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="primary_color">Cor institucional</Label>
            <div className="flex items-center gap-2"><Input id="primary_color" name="primary_color" type="color" defaultValue={branding.primary_color} className="h-10 w-16 p-1" /><Input aria-label="Cor hexadecimal" defaultValue={branding.primary_color} readOnly className="max-w-32 font-mono text-xs" /></div>
          </div>
          <div className="grid gap-2 lg:col-span-2"><Label htmlFor="document_header">Texto auxiliar do cabeçalho</Label><Input id="document_header" name="document_header" defaultValue={branding.document_header ?? ""} maxLength={160} placeholder="Ex.: Centro de cuidado integrado" /></div>
          <div className="grid gap-2 lg:col-span-2"><Label htmlFor="document_footer">Rodapé institucional</Label><textarea id="document_footer" name="document_footer" defaultValue={branding.document_footer ?? ""} maxLength={400} rows={3} className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Informações institucionais, canais de contato ou observação legal." /></div>
          <div className="grid gap-2 lg:col-span-2 sm:grid-cols-3">
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" name="show_legal_name" defaultChecked={branding.show_legal_name} className="size-4 accent-primary" />Exibir razão social</label>
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" name="show_document" defaultChecked={branding.show_document} className="size-4 accent-primary" />Exibir CNPJ/CPF</label>
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" name="show_contact" defaultChecked={branding.show_contact} className="size-4 accent-primary" />Exibir contato</label>
          </div>
        </div>
      </section>

      <div className="sticky bottom-3 z-10 flex justify-end rounded-lg border bg-card/95 p-3 shadow-sm backdrop-blur">
        <Button disabled={pending}><Upload className={pending ? "animate-pulse" : "hidden"} />{pending ? "Processando imagens..." : <><Save />Salvar identidade</>}</Button>
      </div>
    </form>
  );
}
