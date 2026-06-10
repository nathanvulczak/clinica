"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type InviteState = "loading" | "expired" | "invalid";

export function InviteSessionBootstrap() {
  const router = useRouter();
  const [state, setState] = useState<InviteState>("loading");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const errorCode = hash.get("error_code");

    if (errorCode === "otp_expired") {
      setState("expired");
      return;
    }

    if (!accessToken || !refreshToken) {
      setState("invalid");
      return;
    }

    void fetch("/api/auth/invite-session", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as { ok?: boolean; error?: string };

        if (!response.ok || !payload.ok) {
          setState(payload.error === "expired" ? "expired" : "invalid");
          return;
        }

        window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
        router.refresh();
      })
      .catch(() => {
        setState("invalid");
      });
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary">
            {state === "loading" ? <LoaderCircle className="animate-spin" /> : <MailWarning />}
          </div>
          <CardTitle>
            {state === "loading"
              ? "Validando seu convite"
              : state === "expired"
                ? "Convite expirado"
                : "Convite inválido"}
          </CardTitle>
          <CardDescription>
            {state === "loading"
              ? "Estamos preparando a etapa segura para você criar sua senha."
              : state === "expired"
                ? "Este link já foi utilizado ou ultrapassou o prazo de validade. Solicite um novo convite à clínica."
                : "Não foi possível identificar uma sessão válida neste link de convite."}
          </CardDescription>
        </CardHeader>
        {state !== "loading" ? (
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Voltar ao login</Link>
            </Button>
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}
