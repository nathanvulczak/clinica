"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Toast = {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
};

type ToastInput = Omit<Toast, "id">;

const ToastContext = createContext<{ toast: (toast: ToastInput) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((input: ToastInput) => {
    const id = crypto.randomUUID();

    setToasts((current) => [...current, { ...input, id }].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-50 grid w-[min(380px,calc(100vw-2rem))] gap-3">
        {toasts.map((item) => {
          const Icon = item.variant === "destructive" ? XCircle : CheckCircle2;

          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border bg-card p-4 text-sm shadow-lg backdrop-blur animate-in fade-in slide-in-from-top-2",
                item.variant === "destructive" && "border-destructive/40",
              )}
            >
              <div className="flex gap-3">
                <Icon
                  className={cn(
                    "mt-0.5 size-4 text-primary",
                    item.variant === "destructive" && "text-destructive",
                  )}
                />
                <div>
                  <p className="font-medium">{item.title}</p>
                  {item.description ? (
                    <p className="mt-1 text-muted-foreground">{item.description}</p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast deve ser usado dentro de ToastProvider.");
  }

  return context;
}
