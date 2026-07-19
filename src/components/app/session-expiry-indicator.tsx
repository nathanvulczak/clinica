"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const SESSION_WINDOW_MS = 45 * 60 * 1000;
const WARNING_WINDOW_MS = 5 * 60 * 1000;

function sessionKey(userId: string) {
  return `clinicore.session.started.${userId}`;
}

function formatRemaining(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function SessionExpiryIndicator({ userId }: { userId?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const promptShownRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;
    const client = createSupabaseBrowserClient();
    let mounted = true;
    const key = sessionKey(userId);

    async function syncSession(session?: { expires_at?: number } | null) {
      if (!mounted) return;
      let startedAt = Number(window.sessionStorage.getItem(key) ?? "0");
      if (!Number.isFinite(startedAt) || startedAt <= 0 || Date.now() - startedAt >= SESSION_WINDOW_MS) {
        startedAt = Date.now();
        window.sessionStorage.setItem(key, String(startedAt));
        promptShownRef.current = false;
      }

      const authExpiry = session?.expires_at ? session.expires_at * 1000 : startedAt + SESSION_WINDOW_MS;
      setExpiresAt(Math.min(authExpiry, startedAt + SESSION_WINDOW_MS));
      setNow(Date.now());
    }

    void client.auth.getSession().then(({ data }) => syncSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void syncSession(session), 0);
    });
    const interval = window.setInterval(() => setNow(Date.now()), 1000);

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
      window.clearInterval(interval);
    };
  }, [userId]);

  const remaining = expiresAt ? expiresAt - now : null;
  const isWarning = remaining !== null && remaining > 0 && remaining <= WARNING_WINDOW_MS;
  const isExpired = remaining !== null && remaining <= 0;
  const label = useMemo(() => {
    if (isExpired) return "Sessão expirada";
    if (remaining === null) return "Sessão protegida";
    return `Sessão: ${formatRemaining(remaining)}`;
  }, [isExpired, remaining]);

  useEffect(() => {
    if (isWarning && !promptShownRef.current) {
      promptShownRef.current = true;
      setPromptOpen(true);
    }
  }, [isWarning]);

  async function continueSession() {
    setPending(true);
    const client = createSupabaseBrowserClient();
    const { data, error } = await client.auth.refreshSession();
    setPending(false);
    if (error || !data.session) {
      window.location.assign("/login?reason=session_expired");
      return;
    }

    window.sessionStorage.setItem(sessionKey(userId ?? "unknown"), String(Date.now()));
    promptShownRef.current = false;
    setPromptOpen(false);
    setNow(Date.now());
    toast({ title: "Sessão renovada", description: "Você continuará conectado por mais 45 minutos." });
  }

  if (!userId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setPromptOpen(true)}
        className={`mr-1 flex h-7 shrink-0 items-center gap-1 rounded-[5px] px-1.5 text-[11px] outline-none transition-colors duration-75 hover:bg-black/[0.055] focus-visible:ring-2 focus-visible:ring-ring/50 ${isWarning || isExpired ? "text-amber-700" : "text-muted-foreground"}`}
        title={`${label}. Clique para renovar.`}
        aria-label={label}
      >
        <Clock3 className="size-3.5" />
        <span className="hidden tabular-nums sm:inline">{remaining !== null ? formatRemaining(remaining) : "--:--"}</span>
      </button>

      <Modal
        open={promptOpen}
        onOpenChange={setPromptOpen}
        title={isExpired ? "Sessão expirada" : "Continuar sessão?"}
        description="Por segurança, a sessão operacional do CliniCore é renovada em ciclos de 45 minutos."
        size="sm"
      >
        <div className="grid gap-3">
          <div className="flex items-start gap-3 rounded-md border bg-muted/20 p-3 text-sm">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              {isExpired ? "Sua sessão precisa ser renovada para continuar trabalhando com dados protegidos." : `Tempo restante: ${remaining !== null ? formatRemaining(remaining) : "calculando"}.`}
            </p>
          </div>
          <ModalFooter>
            <Button type="button" variant="outline" onClick={() => setPromptOpen(false)}>Agora não</Button>
            <Button type="button" onClick={() => void continueSession()} disabled={pending}>
              <RefreshCw className={pending ? "animate-spin" : ""} />
              {pending ? "Renovando..." : "Continuar sessão"}
            </Button>
          </ModalFooter>
        </div>
      </Modal>
    </>
  );
}
