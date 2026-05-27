"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UserCircle,
  Users,
} from "lucide-react";
import { signOutAction } from "@/features/auth/actions";
import { dismissWelcomeAction } from "@/features/onboarding/actions";
import { ClinicSwitcher } from "@/features/clinics/components/clinic-switcher";
import type { Clinic, UserProfile } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/clinicas", label: "Clínicas", icon: Building2 },
  { href: "/usuarios", label: "Usuários", icon: Users },
  { href: "/assinatura", label: "Assinatura", icon: CreditCard },
  { href: "/auditoria", label: "Auditoria", icon: ShieldCheck },
  { href: "/perfil", label: "Meu perfil", icon: UserCircle },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, disabled: true },
];

export function AppShell({
  children,
  profile,
  clinics,
  activeClinic,
}: {
  children: React.ReactNode;
  profile: UserProfile | null;
  clinics: Clinic[];
  activeClinic: Clinic | null;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("clinicore.sidebar.collapsed");
    setCollapsed(saved === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("clinicore.sidebar.collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setShowWelcome(!profile?.app_preferences?.hide_welcome);
  }, [profile?.app_preferences?.hide_welcome]);

  const firstName = useMemo(() => profile?.full_name?.split(" ")[0] ?? "bem-vindo", [profile]);

  return (
    <div className="min-h-screen bg-background lg:grid" style={{ gridTemplateColumns: collapsed ? "88px 1fr" : "284px 1fr" }}>
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
          {nav.map((item) => {
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
          {nav
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

        {showWelcome ? (
          <section className="border-b bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fafc_55%,#fff7ed_100%)] px-4 py-4 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Bem-vindo ao CliniCore, {firstName}.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escolha a clínica ativa e gerencie usuários, assinatura e operação com segurança por permissão.
                </p>
              </div>
              <form action={dismissWelcomeAction}>
                <Button variant="ghost" size="sm" onClick={() => setShowWelcome(false)}>
                  Não mostrar novamente
                </Button>
              </form>
            </div>
          </section>
        ) : null}

        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
