"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Activity, Check, ChevronDown, ChevronLeft, ChevronRight, LogOut, Settings, UserCircle } from "lucide-react";
import {
  APP_NAVIGATION_MODULES,
  type AppNavigationItem,
  type AppNavigationModule,
} from "@/config/app-navigation";
import { signOutAction } from "@/features/auth/actions";
import { ClinicSwitcher } from "@/features/clinics/components/clinic-switcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Clinic, UserProfile } from "@/types/domain";
import type { NavigationKey } from "@/services/authorization/clinic-access";

function filterNavigationItems(
  items: AppNavigationItem[],
  allowed: Set<NavigationKey>,
): AppNavigationItem[] {
  return items.flatMap((item) => {
    if (item.navigationKey && !allowed.has(item.navigationKey)) return [];

    const children = item.children ? filterNavigationItems(item.children, allowed) : undefined;
    if (!item.href && (!children || children.length === 0)) return [];

    return [{ ...item, children }];
  });
}

function itemContainsPath(item: AppNavigationItem, pathname: string): boolean {
  if (item.href && new URL(item.href, "https://clinicore.local").pathname === pathname) return true;
  return item.children?.some((child) => itemContainsPath(child, pathname)) ?? false;
}

function isItemActive(
  item: AppNavigationItem,
  pathname: string,
  searchParams: URLSearchParams,
): boolean {
  if (!item.href) return item.children?.some((child) => isItemActive(child, pathname, searchParams)) ?? false;

  const url = new URL(item.href, "https://clinicore.local");
  if (url.pathname !== pathname) return false;

  return [...url.searchParams.entries()].every(([key, value]) => searchParams.get(key) === value);
}

function MenuItem({
  item,
  pathname,
  searchParams,
  navigate,
}: {
  item: AppNavigationItem;
  pathname: string;
  searchParams: URLSearchParams;
  navigate: (href: string) => void;
}) {
  const active = isItemActive(item, pathname, searchParams);

  if (item.children?.length) {
    return (
      <>
        {item.separatorBefore ? <DropdownMenuSeparator /> : null}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={cn(active && "bg-black/[0.055]")}> 
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {item.children.map((child) => (
              <MenuItem
                key={`${child.label}-${child.href ?? "group"}`}
                item={child}
                pathname={pathname}
                searchParams={searchParams}
                navigate={navigate}
              />
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </>
    );
  }

  return (
    <>
      {item.separatorBefore ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem
        onSelect={() => item.href && navigate(item.href)}
        className={cn(active && "bg-black/[0.055]")}
      >
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
      </DropdownMenuItem>
    </>
  );
}

function ModuleMenu({
  module,
  openMenu,
  setOpenMenu,
  pathname,
  searchParams,
  navigate,
}: {
  module: AppNavigationModule;
  openMenu: string | null;
  setOpenMenu: (value: string | null) => void;
  pathname: string;
  searchParams: URLSearchParams;
  navigate: (href: string) => void;
}) {
  const active =
    pathname.startsWith(module.pathPrefix) ||
    (module.items?.some((item) => itemContainsPath(item, pathname)) ?? false);

  if (module.href) {
    return (
      <button
        type="button"
        className={cn(
          "h-7 shrink-0 rounded-[5px] px-2 text-[13px] font-normal text-foreground/80 outline-none transition-colors duration-75",
          "hover:bg-black/[0.055] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
          active && "bg-black/[0.055] text-foreground",
        )}
        onPointerEnter={() => openMenu && setOpenMenu(null)}
        onClick={() => navigate(module.href!)}
        aria-current={active ? "page" : undefined}
      >
        {module.label}
      </button>
    );
  }

  return (
    <DropdownMenu
      modal={false}
      open={openMenu === module.id}
      onOpenChange={(open) => setOpenMenu(open ? module.id : null)}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 shrink-0 items-center gap-1 rounded-[5px] px-2 text-[13px] font-normal text-foreground/80 outline-none transition-colors duration-75",
            "hover:bg-black/[0.055] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
            (active || openMenu === module.id) && "bg-black/[0.055] text-foreground",
          )}
          onPointerEnter={() => openMenu && setOpenMenu(module.id)}
          aria-current={active ? "page" : undefined}
        >
          {module.label}
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {module.items?.map((item) => (
          <MenuItem
            key={`${item.label}-${item.href ?? "group"}`}
            item={item}
            pathname={pathname}
            searchParams={searchParams}
            navigate={navigate}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopNavigation({
  profile,
  clinics,
  activeClinic,
  allowedNavigation,
}: {
  profile: UserProfile | null;
  clinics: Clinic[];
  activeClinic: Clinic | null;
  allowedNavigation: NavigationKey[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const navRef = useRef<HTMLElement | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [scrollState, setScrollState] = useState({ left: false, right: false });
  const [pending, startTransition] = useTransition();
  const allowed = useMemo(() => new Set(allowedNavigation), [allowedNavigation]);
  const modules = useMemo(
    () =>
      APP_NAVIGATION_MODULES.flatMap((module) => {
        if (module.navigationKey && !allowed.has(module.navigationKey)) return [];
        const items = module.items ? filterNavigationItems(module.items, allowed) : undefined;
        if (!module.href && (!items || items.length === 0)) return [];
        return [{ ...module, items }];
      }),
    [allowed],
  );

  function navigate(href: string) {
    setOpenMenu(null);
    const current = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
    if (current === href) return;

    startTransition(() => {
      router.push(href);
    });
  }

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const updateScrollState = () => {
      const maxScroll = nav.scrollWidth - nav.clientWidth;
      setScrollState({
        left: nav.scrollLeft > 2,
        right: nav.scrollLeft < maxScroll - 2,
      });
    };

    updateScrollState();
    nav.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      nav.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [modules]);

  function scrollModules(direction: "left" | "right") {
    const nav = navRef.current;
    if (!nav) return;
    nav.scrollBy({ left: direction === "left" ? -240 : 240, behavior: "smooth" });
  }

  const firstName = profile?.full_name?.split(" ")[0] || "Perfil";

  return (
    <header className="sticky top-0 z-40 h-10 border-b border-black/10 bg-[var(--app-chrome)]/95 backdrop-blur-md">
      <div className="flex h-full min-w-0 items-center gap-1 px-2">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="flex h-7 shrink-0 items-center gap-2 rounded-[5px] px-1.5 outline-none transition-colors duration-75 hover:bg-black/[0.055] focus-visible:ring-2 focus-visible:ring-ring/50"
          title="Ir para o painel"
        >
          <span className="flex size-6 items-center justify-center rounded-[5px] bg-primary text-primary-foreground">
            <Activity className="size-3.5" />
          </span>
          <span className="text-[13px] font-semibold">CliniCore</span>
        </button>

        <span className="mx-1 h-5 w-px shrink-0 bg-black/10" aria-hidden="true" />
        <ClinicSwitcher clinics={clinics} activeClinicId={activeClinic?.id} />
        <span className="mx-1 h-5 w-px shrink-0 bg-black/10" aria-hidden="true" />

        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <button
            type="button"
            onClick={() => scrollModules("left")}
            disabled={!scrollState.left}
            className="flex size-7 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors duration-75 hover:bg-black/[0.055] hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
            aria-label="Ver módulos anteriores"
            title="Ver módulos anteriores"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <nav
            ref={navRef}
            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Módulos do sistema"
          >
          {modules.map((module) => (
            <ModuleMenu
              key={module.id}
              module={module}
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              pathname={pathname}
              searchParams={searchParams}
              navigate={navigate}
            />
          ))}
          </nav>
          <button
            type="button"
            onClick={() => scrollModules("right")}
            disabled={!scrollState.right}
            className="flex size-7 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-colors duration-75 hover:bg-black/[0.055] hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
            aria-label="Ver próximos módulos"
            title="Ver próximos módulos"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>

        <DropdownMenu modal={false} onOpenChange={(open) => open && setOpenMenu(null)}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-1 flex h-7 max-w-40 shrink-0 items-center gap-1.5 rounded-[5px] px-1.5 text-[13px] outline-none transition-colors duration-75 hover:bg-black/[0.055] focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-black/[0.055]"
              title="Abrir menu do usuário"
            >
              <span className="relative flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                {profile?.avatar_url ? (
                  <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="20px" />
                ) : (
                  profile?.full_name?.slice(0, 1).toUpperCase() || <UserCircle className="size-4" />
                )}
              </span>
              <span className="max-w-24 truncate">{firstName}</span>
              <ChevronDown className="size-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem onSelect={() => navigate("/perfil")}>
              <Settings className="size-3.5 text-muted-foreground" />
              Meu perfil e preferências
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={signOutAction}>
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full">
                  <LogOut className="size-3.5 text-muted-foreground" />
                  Sair
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {pending ? (
        <div className="absolute inset-x-0 bottom-0 h-px overflow-hidden bg-primary/15" role="status" aria-label="Carregando página">
          <span className="block h-full w-1/3 animate-[menu-progress_900ms_ease-in-out_infinite] bg-primary motion-reduce:animate-none" />
        </div>
      ) : null}
    </header>
  );
}
