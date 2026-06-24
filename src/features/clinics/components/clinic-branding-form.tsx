"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileImage, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { saveClinicBrandingAction, uploadClinicBrandingLogoAction } from "@/features/clinics/branding-actions";
import type { ClinicBrandingView } from "@/repositories/clinic-branding";

type LogoFieldProps = {
  id: string;
  name: string;
  label: string;
  hint: string;
  currentUrl: string | null;
  previewClass: string;
  onValidationError: (message: string) => void;
};

function LogoField({ id, name, label, hint, currentUrl, previewClass, onValidationError }: LogoFieldProps) {
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
          if (file.size > 2 * 1024 * 1024) {
            event.currentTarget.value = "";
            onValidationError("Cada imagem deve ter no máximo 2 MB.");
            return;
          }
          if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            event.currentTarget.value = "";
            onValidationError("Use somente imagens JPG, PNG ou WEBP.");
            return;
          }
          if (localUrl.current) URL.revokeObjectURL(localUrl.current);
          localUrl.current = URL.createObjectURL(file);
          setPreview(localUrl.current);
        }}
      />
    </label>
  );
}

export function ClinicBrandingForm({ branding }: { branding: ClinicBrandingView }) {
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState("");
  const { toast } = useToast();
  const router = useRouter();

  function showError(message: string) {
    toast({ title: "Não foi possível salvar", description: message, variant: "destructive" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    const source = new FormData(event.currentTarget);
    const uploads = [
      { variant: "horizontal", field: "horizontal_logo_file", label: "marca horizontal" },
      { variant: "compact", field: "compact_logo_file", label: "marca compacta" },
      { variant: "vertical", field: "vertical_logo_file", label: "marca vertical" },
    ];

    try {
      for (const upload of uploads) {
        const file = source.get(upload.field);
        if (!(file instanceof File) || file.size === 0) continue;
        setProgress(`Processando ${upload.label}...`);
        const logoData = new FormData();
        logoData.set("variant", upload.variant);
        logoData.set("logo_file", file);
        const result = await uploadClinicBrandingLogoAction(logoData);
        if (result.error) {
          showError(result.error);
          return;
        }
      }

      setProgress("Salvando padrão institucional...");
      const settings = new FormData();
      for (const field of ["primary_color", "document_header", "document_footer"]) {
        const value = source.get(field);
        if (typeof value === "string") settings.set(field, value);
      }
      for (const field of ["show_legal_name", "show_document", "show_contact"]) {
        if (source.has(field)) settings.set(field, "on");
      }
      const result = await saveClinicBrandingAction({}, settings);
      if (result.error) {
        showError(result.error);
        return;
      }
      toast({ title: "Identidade atualizada", description: result.success ?? "Marcas e preferências salvas." });
      router.refresh();
    } catch {
      showError("A conexão foi interrompida durante o envio. Tente novamente.");
    } finally {
      setProgress("");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <section className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Marcas para documentos</h2>
          <p className="mt-1 text-xs text-muted-foreground">O sistema otimiza as imagens e escolhe a versão adequada em cada documento.</p>
        </div>
        <div className="grid gap-3 p-4 xl:grid-cols-3">
          <LogoField id="horizontal_logo_file" name="horizontal_logo_file" label="Marca principal horizontal" hint="Cabeçalhos de prontuários, relatórios e recibos. Mínimo 400 x 100 px, máximo 2 MB." currentUrl={branding.horizontal_logo_url} previewClass="h-16 w-36" onValidationError={showError} />
          <LogoField id="compact_logo_file" name="compact_logo_file" label="Marca compacta" hint="Espaços reduzidos e identificação rápida. Preferencialmente quadrada, mínimo 200 x 200 px, máximo 2 MB." currentUrl={branding.compact_logo_url} previewClass="size-16" onValidationError={showError} />
          <LogoField id="vertical_logo_file" name="vertical_logo_file" label="Marca vertical" hint="Capas e documentos com composição vertical. Mínimo 220 x 360 px, máximo 2 MB." currentUrl={branding.vertical_logo_url} previewClass="h-20 w-14" onValidationError={showError} />
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
        <Button type="submit" disabled={pending}><Upload className={pending ? "animate-pulse" : "hidden"} />{pending ? progress || "Processando..." : <><Save />Salvar identidade</>}</Button>
      </div>
    </form>
  );
}
