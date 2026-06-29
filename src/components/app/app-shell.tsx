"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Activity, Sparkles } from "lucide-react";
import { TopNavigation } from "@/components/app/top-navigation";
import { Button } from "@/components/ui/button";
import { dismissWelcomeAction } from "@/features/onboarding/actions";
import { cn } from "@/lib/utils";
import type { Clinic, UserProfile } from "@/types/domain";
import type { NavigationKey } from "@/services/authorization/clinic-access";

const WELCOME_SESSION_KEY = "clinicore.welcome.seen";

export function AppShell({
  children,
  profile,
  clinics,
  activeClinic,
  allowedNavigation,
}: {
  children: React.ReactNode;
  profile: UserProfile | null;
  clinics: Clinic[];
  activeClinic: Clinic | null;
  allowedNavigation: NavigationKey[];
}) {
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomePhase, setWelcomePhase] = useState<"entering" | "visible" | "leaving">("entering");
  const welcomeTimerRef = useRef<number | null>(null);
  const [, startWelcomeTransition] = useTransition();

  useEffect(() => {
    const alreadySeen = window.sessionStorage.getItem(WELCOME_SESSION_KEY) === "true";
    const shouldShow = !profile?.app_preferences?.hide_welcome && !alreadySeen;
    setShowWelcome(shouldShow);

    if (shouldShow) {
      setWelcomePhase("entering");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setWelcomePhase("visible"));
      });
    }

    return () => {
      if (welcomeTimerRef.current) window.clearTimeout(welcomeTimerRef.current);
    };
  }, [profile?.app_preferences?.hide_welcome]);

  const firstName = useMemo(() => profile?.full_name?.split(" ")[0] ?? "bem-vindo", [profile]);

  function closeWelcome(hidePermanently = false) {
    window.sessionStorage.setItem(WELCOME_SESSION_KEY, "true");
    setWelcomePhase("leaving");

    welcomeTimerRef.current = window.setTimeout(() => {
      setShowWelcome(false);

      if (hidePermanently) {
        startWelcomeTransition(() => {
          void dismissWelcomeAction();
        });
      }
    }, 1500);
  }

  return (
    <div className="app-interface min-h-screen bg-background" data-app-interface>
      <TopNavigation
        profile={profile}
        clinics={clinics}
        activeClinic={activeClinic}
        allowedNavigation={allowedNavigation}
      />

      <main className="w-full px-5 py-5 lg:px-7 xl:px-8">{children}</main>

      {showWelcome ? (
        <div
          className={cn(
            "welcome-screen fixed inset-0 z-50 grid place-items-center overflow-hidden bg-background px-4",
            welcomePhase === "visible" && "welcome-screen-visible",
            welcomePhase === "leaving" && "welcome-screen-leaving",
          )}
        >
          <div className="welcome-background absolute inset-0" />
          <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
          <section className="welcome-content relative z-10 grid w-full max-w-xl gap-8 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Activity className="size-8" />
            </div>
            <div>
              <p className="text-sm font-medium uppercase text-muted-foreground">CliniCore</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
                Bem-vindo, {firstName}.
              </h1>
              <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                Seu ambiente clínico está pronto para operar com contexto ativo, permissões e auditoria.
              </p>
            </div>
            <div className="mx-auto grid w-full max-w-xs gap-3">
              <Button type="button" onClick={() => closeWelcome()} size="lg">
                <Sparkles />
                Entrar no sistema
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => closeWelcome(true)}
              >
                Não mostrar novamente
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
