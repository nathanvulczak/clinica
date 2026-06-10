"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Activity,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Sparkles,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
import { signOutAction } from "@/features/auth/actions";
import { dismissWelcomeAction } from "@/features/onboarding/actions";
import { ClinicSwitcher } from "@/features/clinics/components/clinic-switcher";
import type { Clinic, UserProfile } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NavigationKey } from "@/services/authorization/clinic-access";

type NavItem = {
  href: string;
  key: NavigationKey;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
};

const nav: NavItem[] = [
  { key: "dashboard", href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { key: "schedule", href: "/agenda", label: "Agenda", icon: CalendarDays },
  { key: "registrations", href: "/cadastros", label: "Cadastros", icon: ClipboardList },
  { key: "clinics", href: "/clinicas", label: "Clínicas", icon: Building2 },
  { key: "members", href: "/usuarios", label: "Usuários", icon: Users },
  { key: "billing", href: "/assinatura", label: "Assinatura", icon: CreditCard },
  { key: "audit", href: "/auditoria", label: "Auditoria", icon: ShieldCheck },
  { key: "profile", href: "/perfil", label: "Meu perfil", icon: UserCircle },
];

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
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomePhase, setWelcomePhase] = useState<"entering" | "visible" | "leaving">("entering");
  const welcomeTimerRef = useRef<number | null>(null);
  const [, startWelcomeTransition] = useTransition();
  const visibleNavigation = useMemo(
    () => nav.filter((item) => allowedNavigation.includes(item.key)),
    [allowedNavigation],
  );

  useEffect(() => {
    const saved = window.localStorage.getItem("clinicore.sidebar.collapsed");
    setCollapsed(saved === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("clinicore.sidebar.collapsed", String(collapsed));
  }, [collapsed]);

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
      if (welcomeTimerRef.current) {
        window.clearTimeout(welcomeTimerRef.current);
      }
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
    <div
      className="min-h-screen bg-background lg:grid"
      style={{ gridTemplateColumns: collapsed ? "88px 1fr" : "284px 1fr" }}
    >
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen border-r bg-card/95 shadow-sm backdrop-blur lg:flex lg:flex-col",
          collapsed ? "px-3" : "px-4",
        )}
      >
        <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "justify-between")}>
          <Link href="/dashboard" className={cn("flex items-center gap-2", collapsed && "justify-center")}>
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Activity className="size-5" />
            </div>
            {!collapsed ? (
              <div>
                <p className="font-semibold leading-none">CliniCore</p>
                <p className="mt-1 text-xs text-muted-foreground">Gestão clínica</p>
              </div>
            ) : null}
          </Link>
          {!collapsed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Recolher menu"
              onClick={() => setCollapsed(true)}
            >
              <ChevronLeft />
            </Button>
          ) : null}
        </div>

        {collapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mx-auto mb-4"
            title="Expandir menu"
            onClick={() => setCollapsed(false)}
          >
            <ChevronRight />
          </Button>
        ) : null}

        <div className="mb-4">
          <ClinicSwitcher clinics={clinics} activeClinicId={activeClinic?.id} collapsed={collapsed} />
        </div>

        <nav className="grid gap-1">
          {visibleNavigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const content = (
              <>
                <item.icon />
                {!collapsed ? <span>{item.label}</span> : null}
              </>
            );

            if (item.disabled) {
              return (
                <Button
                  key={item.href}
                  type="button"
                  variant="ghost"
                  className={cn("justify-start opacity-50", collapsed && "justify-center px-0")}
                  disabled
                  title={item.label}
                >
                  {content}
                </Button>
              );
            }

            return (
              <Button
                key={item.href}
                asChild
                variant={isActive ? "secondary" : "ghost"}
                className={cn("justify-start", collapsed && "justify-center px-0")}
                title={item.label}
              >
                <Link href={item.href}>{content}</Link>
              </Button>
            );
          })}
        </nav>

        <form action={signOutAction} className="mt-auto pb-4">
          <Button variant="outline" className={cn("w-full justify-start", collapsed && "justify-center px-0")}>
            <LogOut />
            {!collapsed ? "Sair" : null}
          </Button>
        </form>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground lg:hidden">
              <Menu className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {activeClinic?.trade_name ?? "Configure sua primeira clínica"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {activeClinic ? "Contexto ativo aplicado ao painel" : "Assinatura ativa é necessária para cadastrar clínica"}
              </p>
            </div>
          </div>
          <form action={signOutAction}>
            <Button variant="outline" size="sm">
              <LogOut />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </form>
        </header>

        <nav className="flex gap-2 overflow-x-auto border-b bg-card px-4 py-2 lg:hidden">
          {visibleNavigation
            .filter((item) => !item.disabled)
            .map((item) => (
              <Button key={item.href} asChild variant={pathname.startsWith(item.href) ? "secondary" : "ghost"} size="sm">
                <Link href={item.href}>
                  <item.icon />
                  {item.label}
                </Link>
              </Button>
            ))}
        </nav>

        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>

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
              <Button
                type="button"
                onClick={() => closeWelcome()}
                size="lg"
              >
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
