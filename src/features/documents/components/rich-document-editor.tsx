"use client";

import { useEffect, useRef } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_DOCUMENT_PAGE_SETTINGS,
  normalizeDocumentText,
  type DocumentPageSettings,
} from "@/features/documents/document-editor";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function editorHtml(value: string) {
  const normalized = normalizeDocumentText(value);
  if (!normalized) return "<p><br /></p>";
  if (/<\/?[a-z][\s\S]*>/i.test(normalized)) return normalized;
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

function ToolButton({
  label,
  command,
  value,
  children,
}: {
  label: string;
  command: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => document.execCommand(command, false, value)}
    >
      {children}
    </Button>
  );
}

export function RichDocumentEditor({
  value,
  onChange,
  settings = DEFAULT_DOCUMENT_PAGE_SETTINGS,
  onSettingsChange,
  name = "content",
  minHeight = 560,
}: {
  value: string;
  onChange: (value: string) => void;
  settings?: DocumentPageSettings;
  onSettingsChange: (settings: DocumentPageSettings) => void;
  name?: string;
  minHeight?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    const next = editorHtml(value);
    if (editor.innerHTML !== next) editor.innerHTML = next;
  }, [value]);

  function updateSetting<K extends keyof DocumentPageSettings>(
    key: K,
    settingValue: DocumentPageSettings[K],
  ) {
    onSettingsChange({ ...settings, [key]: settingValue });
  }

  const pageWidth = settings.orientation === "portrait" ? 794 : 1123;
  const pageMinHeight = settings.orientation === "portrait" ? minHeight : Math.max(480, minHeight - 80);
  const fontFamily = settings.fontFamily === "serif" ? "Georgia, 'Times New Roman', serif" : "Arial, sans-serif";

  return (
    <div className="overflow-hidden rounded-md border bg-muted/20">
      <input type="hidden" name={name} value={value} />
      <input type="hidden" name="page_settings" value={JSON.stringify(settings)} />
      <div className="flex flex-wrap items-center gap-1 border-b bg-card px-2 py-1.5">
        <ToolButton label="Desfazer" command="undo"><Undo2 /></ToolButton>
        <ToolButton label="Refazer" command="redo"><Redo2 /></ToolButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolButton label="Negrito" command="bold"><Bold /></ToolButton>
        <ToolButton label="Itálico" command="italic"><Italic /></ToolButton>
        <ToolButton label="Sublinhado" command="underline"><Underline /></ToolButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolButton label="Alinhar à esquerda" command="justifyLeft"><AlignLeft /></ToolButton>
        <ToolButton label="Centralizar" command="justifyCenter"><AlignCenter /></ToolButton>
        <ToolButton label="Alinhar à direita" command="justifyRight"><AlignRight /></ToolButton>
        <ToolButton label="Justificar" command="justifyFull"><AlignJustify /></ToolButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolButton label="Lista com marcadores" command="insertUnorderedList"><List /></ToolButton>
        <ToolButton label="Lista numerada" command="insertOrderedList"><ListOrdered /></ToolButton>
        <ToolButton label="Diminuir recuo" command="outdent"><IndentDecrease /></ToolButton>
        <ToolButton label="Aumentar recuo" command="indent"><IndentIncrease /></ToolButton>
        <select
          aria-label="Estilo do parágrafo"
          className="ml-auto h-8 rounded-md border bg-background px-2 text-xs"
          defaultValue="p"
          onChange={(event) => document.execCommand("formatBlock", false, event.target.value)}
        >
          <option value="p">Parágrafo</option>
          <option value="h2">Título</option>
          <option value="h3">Subtítulo</option>
          <option value="blockquote">Citação</option>
        </select>
      </div>

      <div className="grid border-b bg-card/80 px-3 py-2 lg:grid-cols-[repeat(4,minmax(82px,1fr))_130px_130px_140px] lg:items-end">
        {([
          ["Superior", "marginTop"],
          ["Direita", "marginRight"],
          ["Inferior", "marginBottom"],
          ["Esquerda", "marginLeft"],
        ] as const).map(([label, key]) => (
          <label key={key} className="grid gap-1 px-1 text-[11px] font-medium text-muted-foreground">
            Margem {label.toLowerCase()} (mm)
            <input
              type="number"
              min={8}
              max={35}
              step={1}
              value={settings[key]}
              onChange={(event) => updateSetting(key, Number(event.target.value))}
              className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
            />
          </label>
        ))}
        <label className="grid gap-1 px-1 text-[11px] font-medium text-muted-foreground">
          Fonte
          <select value={settings.fontFamily} onChange={(event) => updateSetting("fontFamily", event.target.value as DocumentPageSettings["fontFamily"])} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground">
            <option value="serif">Serifada</option>
            <option value="sans">Sem serifa</option>
          </select>
        </label>
        <label className="grid gap-1 px-1 text-[11px] font-medium text-muted-foreground">
          Corpo (pt)
          <input type="number" min={9} max={14} step={0.5} value={settings.fontSize} onChange={(event) => updateSetting("fontSize", Number(event.target.value))} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground" />
        </label>
        <label className="grid gap-1 px-1 text-[11px] font-medium text-muted-foreground">
          Página
          <select value={settings.orientation} onChange={(event) => updateSetting("orientation", event.target.value as DocumentPageSettings["orientation"])} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground">
            <option value="portrait">A4 retrato</option>
            <option value="landscape">A4 paisagem</option>
          </select>
        </label>
      </div>

      <div className="max-h-[66vh] overflow-auto p-4 lg:p-6">
        <div
          className="document-editor-page selectable mx-auto bg-white text-slate-950 shadow-[0_8px_24px_rgb(15_23_42/0.08)] outline-none transition-[width,padding] duration-150"
          style={{
            width: `min(100%, ${pageWidth}px)`,
            minHeight: pageMinHeight,
            paddingTop: `${settings.marginTop}mm`,
            paddingRight: `${settings.marginRight}mm`,
            paddingBottom: `${settings.marginBottom}mm`,
            paddingLeft: `${settings.marginLeft}mm`,
            fontFamily,
            fontSize: `${settings.fontSize}pt`,
            lineHeight: settings.lineHeight,
          }}
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Conteúdo do documento"
          suppressContentEditableWarning
          onInput={(event) => onChange(event.currentTarget.innerHTML)}
          dangerouslySetInnerHTML={{ __html: editorHtml(value) }}
        />
      </div>
    </div>
  );
}
