"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FinancialError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("financial_workspace_error", error);
    void fetch("/api/telemetry/error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error_code: "financial_workspace_error",
        message: "Falha ao carregar o módulo financeiro.",
        route: window.location.pathname,
        digest: error.digest,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);

  return (
    <section className="mx-auto mt-10 max-w-xl rounded-lg border bg-card p-6 text-center shadow-sm">
      <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-700">
        <AlertTriangle className="size-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold">Não foi possível carregar esta área financeira</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Seus dados não foram alterados. Atualize os dados da tela para tentar novamente.
      </p>
      {error.digest ? <p className="mt-2 text-xs text-muted-foreground">Código: {error.digest}</p> : null}
      <Button className="mt-5" onClick={reset}>
        <RefreshCw />
        Tentar novamente
      </Button>
    </section>
  );
}
