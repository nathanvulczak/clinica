"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const modalWidths = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
} as const;

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  size = "xl",
  expandable = false,
  expanded = false,
  onExpandedChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  size?: keyof typeof modalWidths;
  expandable?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:duration-100 data-[state=closed]:duration-75 motion-reduce:animate-none" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-card shadow-[0_18px_55px_rgb(15_23_42/0.16)] outline-none will-change-transform",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=open]:zoom-in-[0.99] data-[state=closed]:fade-out data-[state=closed]:zoom-out-[0.99] data-[state=open]:duration-150 data-[state=closed]:duration-100 motion-reduce:animate-none",
            modalWidths[size],
            expanded && "inset-3 max-h-none w-auto max-w-none translate-x-0 translate-y-0",
            className,
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b px-5 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-[13px] leading-5 text-muted-foreground">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">
                  Janela de ação do sistema.
                </Dialog.Description>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {expandable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={expanded ? "Restaurar tamanho do modal" : "Expandir modal"}
                  title={expanded ? "Restaurar tamanho" : "Expandir"}
                  onClick={() => onExpandedChange?.(!expanded)}
                >
                  {expanded ? <Minimize2 /> : <Maximize2 />}
                </Button>
              ) : null}
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" className="size-9" aria-label="Fechar">
                  <X />
                </Button>
              </Dialog.Close>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ModalFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return (
    <footer
      className={cn(
        "sticky bottom-0 -mx-5 -mb-5 mt-5 flex items-center justify-end gap-2 border-t bg-card/95 px-5 py-3 backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

export function ModalSection({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("space-y-4 border-b pb-5 last:border-b-0 last:pb-0", className)} {...props} />;
}
