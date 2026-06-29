"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

async function copyWithFallback(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("clipboard_unavailable");
}

export function CopyButton({
  value,
  label = "Copiar",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyWithFallback(value);
      setCopied(true);
      toast({ title: "Copiado!", description: `${label} copiado para a área de transferência.` });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({
        title: "Não foi possível copiar",
        description: "Selecione o conteúdo manualmente e tente novamente.",
        variant: "destructive",
      });
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-7 shrink-0 text-muted-foreground", className)}
      onClick={handleCopy}
      aria-label={copied ? "Copiado!" : label}
      title={copied ? "Copiado!" : label}
    >
      {copied ? <Check className="text-primary" /> : <Copy />}
    </Button>
  );
}

export function CopyableText({
  value,
  label,
  className,
  children,
}: {
  value: string;
  label?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span className="selectable min-w-0 break-all">{children ?? value}</span>
      <CopyButton value={value} label={label} />
    </span>
  );
}
