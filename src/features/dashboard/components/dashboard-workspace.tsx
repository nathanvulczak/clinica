"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  GripVertical,
  LayoutDashboard,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AccessDeniedToast } from "@/components/app/access-denied-toast";
import { RealtimeClinicSync } from "@/components/app/realtime-clinic-sync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { saveDashboardPreferencesAction } from "@/features/dashboard/actions";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  type DashboardLayoutItem,
  type DashboardPreferences,
  type DashboardWidgetId,
} from "@/features/dashboard/types";
import { formatCurrencyBRL } from "@/lib/utils";

type DashboardAppointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  patient_name: string;
  professional_name: string;
  service_name: string;
};

type DashboardWorkspaceProps = {
  accessDenied?: boolean;
  deniedModule?: string;
  activeClinicId: string | null;
  activeClinicName: string;
  clinicLogoUrl: string | null;
  firstName: string;
  canCreateClinic: boolean;
  canViewBilling: boolean;
  canViewMembers: boolean;
  canViewAudit: boolean;
  canViewFinancial: boolean;
  subscriptionPlan: string;
  clinicsCount: number;
  planLimit: number | null;
  membersCount: number;
  preferences: DashboardPreferences;
  metrics: {
    activeAppointments: number;
    confirmedAppointments: number;
    checkedIn: number;
    waitingTriage: number;
    readyForConsultation: number;
    inConsultation: number;
    cashConfirmedCents: number;
  };
  nextAppointments: DashboardAppointment[];
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function DashboardMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: "success" | "warning";
}) {
  return (
    <section className="flex h-full flex-col justify-between rounded-lg border bg-card p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon
          className={
            tone === "success"
              ? "size-4 text-emerald-600"
              : tone === "warning"
                ? "size-4 text-amber-600"
                : "size-4 text-primary"
          }
        />
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </section>
  );
}

function AppointmentRow({ appointment }: { appointment: DashboardAppointment }) {
  const statusLabels: Record<string, string> = {
    scheduled: "Agendado",
    confirmed: "Confirmado",
    checked_in: "Paciente chegou",
    in_progress: "Em atendimento",
    completed: "Concluído",
    cancelled: "Cancelado",
    no_show: "Faltou",
  };

  return (
    <div className="grid grid-cols-[58px_1fr_auto] items-center gap-3 border-b py-2.5 last:border-b-0">
      <span className="text-sm font-medium tabular-nums">{formatTime(appointment.starts_at)}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{appointment.patient_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {appointment.professional_name} | {appointment.service_name}
        </p>
      </div>
      <Badge
        className={
          appointment.status === "confirmed" || appointment.status === "checked_in"
            ? "bg-emerald-500/10 text-emerald-700"
            : undefined
        }
      >
        {statusLabels[appointment.status] ?? appointment.status}
      </Badge>
    </div>
  );
}

function WidgetChrome({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          {description ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

function mergeLayout(current: DashboardLayoutItem[], changed: Layout): DashboardLayoutItem[] {
  const changedById = new Map(changed.map((item) => [item.i, item]));
  return current.map((item) => {
    const next = changedById.get(item.i);
    return next
      ? { ...item, x: next.x, y: next.y, w: next.w, h: next.h }
      : item;
  });
}

export function DashboardWorkspace(props: DashboardWorkspaceProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<DashboardWidgetId[]>(props.preferences.visibleWidgets);
  const [layout, setLayout] = useState<DashboardLayoutItem[]>(props.preferences.layout);
  const [pending, startTransition] = useTransition();
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1280 });
  const { toast } = useToast();
  const careTotal =
    props.metrics.waitingTriage + props.metrics.readyForConsultation + props.metrics.inConsultation;

  const availableWidgets = useMemo(() => {
    const widgets: Array<{ id: DashboardWidgetId; label: string; render: () => ReactNode }> = [
      {
        id: "agenda",
        label: "Agenda de hoje",
        render: () => (
          <DashboardMetric
            icon={CalendarDays}
            label="Agenda de hoje"
            value={String(props.metrics.activeAppointments)}
            detail={`${props.metrics.confirmedAppointments} confirmados`}
          />
        ),
      },
      {
        id: "reception",
        label: "Recepção",
        render: () => (
          <DashboardMetric
            icon={Clock3}
            label="Na recepção"
            value={String(props.metrics.checkedIn)}
            detail="Pacientes com chegada registrada"
            tone={props.metrics.checkedIn ? "warning" : undefined}
          />
        ),
      },
      {
        id: "care",
        label: "Fluxo assistencial",
        render: () => (
          <DashboardMetric
            icon={Stethoscope}
            label="Fluxo assistencial"
            value={String(careTotal)}
            detail={`${props.metrics.inConsultation} em consulta`}
            tone={props.metrics.inConsultation ? "success" : undefined}
          />
        ),
      },
      {
        id: "cash",
        label: "Caixa confirmado",
        render: () => (
          <DashboardMetric
            icon={Wallet}
            label="Caixa confirmado"
            value={formatCurrencyBRL(props.metrics.cashConfirmedCents)}
            detail="Recebimentos confirmados"
            tone="success"
          />
        ),
      },
      {
        id: "nextAppointments",
        label: "Próximos atendimentos",
        render: () => (
          <WidgetChrome
            title="Próximos atendimentos"
            description="Agenda operacional de hoje"
            action={
              <Button asChild size="sm" variant="ghost">
                <Link href="/agenda">Abrir agenda <ArrowRight /></Link>
              </Button>
            }
          >
            <div className="px-4">
              {props.nextAppointments.length ? (
                props.nextAppointments.map((item) => <AppointmentRow key={item.id} appointment={item} />)
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum atendimento pendente para hoje.
                </p>
              )}
            </div>
          </WidgetChrome>
        ),
      },
      {
        id: "careFlow",
        label: "Fila assistencial",
        render: () => (
          <WidgetChrome title="Fluxo assistencial" description="Movimento entre recepção e consulta">
            <div className="grid gap-1 p-3">
              {[
                ["Pré-consulta", props.metrics.waitingTriage, Clock3, "text-amber-600"],
                ["Prontos para consulta", props.metrics.readyForConsultation, CheckCircle2, "text-emerald-600"],
                ["Em atendimento", props.metrics.inConsultation, Activity, "text-primary"],
              ].map(([label, value, Icon, tone]) => {
                const FlowIcon = Icon as LucideIcon;
                return (
                  <div key={String(label)} className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm hover:bg-muted/30">
                    <span className="flex items-center gap-2">
                      <FlowIcon className={`size-4 ${tone}`} />
                      {String(label)}
                    </span>
                    <strong className="tabular-nums">{String(value)}</strong>
                  </div>
                );
              })}
            </div>
            <div className="border-t p-3">
              <Button asChild className="w-full" variant="outline">
                <Link href="/atendimentos">Acompanhar atendimentos <ArrowRight /></Link>
              </Button>
            </div>
          </WidgetChrome>
        ),
      },
      {
        id: "administration",
        label: "Contexto administrativo",
        render: () => (
          <WidgetChrome title="Contexto administrativo">
            <div className="p-4">
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-primary" />
                <p className="text-sm font-medium">{props.activeClinicName}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {props.canViewBilling ? (
                  <span className="text-muted-foreground">
                    Plano <strong className="capitalize text-foreground">{props.subscriptionPlan}</strong> |{" "}
                    {props.clinicsCount} de {props.planLimit ?? "-"} clínicas
                  </span>
                ) : null}
                {props.canViewMembers ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground"><Users className="size-3.5" />{props.membersCount} membros</span>
                ) : null}
                {props.canViewAudit ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground"><ShieldCheck className="size-3.5" />Auditoria ativa</span>
                ) : null}
              </div>
              {props.canViewFinancial ? (
                <Button asChild size="sm" className="mt-4"><Link href="/financeiro">Abrir financeiro <ArrowRight /></Link></Button>
              ) : null}
            </div>
          </WidgetChrome>
        ),
      },
    ];

    return widgets.filter((widget) => {
      if (widget.id === "cash") return props.canViewFinancial;
      if (widget.id === "administration") return props.canViewBilling || props.canViewMembers || props.canViewAudit;
      return true;
    });
  }, [careTotal, props]);

  const availableIds = new Set(availableWidgets.map((widget) => widget.id));
  const renderedWidgets = visibleWidgets.filter((id) => availableIds.has(id));
  const renderedLayout = layout.filter((item) => renderedWidgets.includes(item.i));

  function toggleWidget(id: DashboardWidgetId) {
    setVisibleWidgets((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function resetDashboard() {
    setLayout(DEFAULT_DASHBOARD_LAYOUT);
    setVisibleWidgets(availableWidgets.map((widget) => widget.id));
    toast({ title: "Layout restaurado", description: "Revise e clique em Salvar painel para confirmar." });
  }

  function saveDashboard() {
    startTransition(async () => {
      const result = await saveDashboardPreferencesAction({ visibleWidgets, layout });
      toast({
        title: result.success ?? "Ação não concluída",
        description: result.error ?? "A organização fica vinculada ao seu usuário nesta clínica.",
        variant: result.error ? "destructive" : "default",
      });
      if (!result.error) setEditing(false);
    });
  }

  return (
    <div className="grid gap-4">
      <AccessDeniedToast denied={props.accessDenied} module={props.deniedModule} />
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card">
            {props.clinicLogoUrl ? (
              <Image src={props.clinicLogoUrl} alt={`Marca de ${props.activeClinicName}`} fill sizes="44px" className="object-contain p-1.5" />
            ) : (
              <LayoutDashboard className="size-5 text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-xs font-medium text-primary">{props.activeClinicName}</p>
              {props.activeClinicId ? (
                <RealtimeClinicSync clinicId={props.activeClinicId} tables={["appointments", "clinical_encounters", "financial_entries", "financial_payments"]} />
              ) : null}
            </div>
            <h1 className="mt-0.5 text-xl font-semibold">Olá, {props.firstName}</h1>
            <p className="truncate text-sm text-muted-foreground">Seu resumo operacional, organizado para a rotina de hoje.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.canCreateClinic ? <Button asChild variant="outline"><Link href="/clinicas/nova">Nova clínica</Link></Button> : null}
          {editing ? (
            <>
              <Button type="button" variant="ghost" onClick={resetDashboard}><RotateCcw />Restaurar</Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button type="button" onClick={saveDashboard} disabled={pending}><Save />{pending ? "Salvando..." : "Salvar painel"}</Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => setEditing(true)}><GripVertical />Organizar</Button>
          )}
          <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}><Settings2 />Cards</Button>
        </div>
      </header>

      <div ref={containerRef} className="min-h-[320px]">
        {mounted ? (
          <ReactGridLayout
            width={width}
            layout={renderedLayout}
            gridConfig={{ cols: 12, rowHeight: 28, margin: [12, 12], containerPadding: [0, 0] }}
            dragConfig={{ enabled: editing, handle: ".dashboard-drag-handle", bounded: true }}
            resizeConfig={{ enabled: editing, handles: ["se"] }}
            onLayoutChange={(next) => {
              if (editing) setLayout((current) => mergeLayout(current, next));
            }}
            className="dashboard-grid"
          >
            {renderedWidgets.map((id) => {
              const widget = availableWidgets.find((item) => item.id === id);
              return (
                <div key={id} className="dashboard-widget relative min-h-0">
                  {editing ? (
                    <button type="button" className="dashboard-drag-handle absolute right-2 top-2 z-20 flex size-7 cursor-grab items-center justify-center rounded-md border bg-card/95 text-muted-foreground shadow-sm active:cursor-grabbing" title="Arrastar card">
                      <GripVertical className="size-4" />
                    </button>
                  ) : null}
                  {widget?.render()}
                </div>
              );
            })}
          </ReactGridLayout>
        ) : (
          <div className="grid grid-cols-4 gap-3" aria-label="Carregando painel">
            {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-lg border bg-muted/40" />)}
          </div>
        )}
      </div>

      {!renderedWidgets.length ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center">
          <LayoutDashboard className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Seu painel está vazio</p>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setSettingsOpen(true)}>Adicionar cards</Button>
        </div>
      ) : null}

      <Modal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="Cards do painel"
        description="Escolha apenas as informações úteis ao seu perfil e à clínica ativa."
        size="md"
      >
        <div className="grid gap-2">
          {availableWidgets.map((widget) => {
            const visible = visibleWidgets.includes(widget.id);
            return (
              <div key={widget.id} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{widget.label}</p>
                  <p className="text-xs text-muted-foreground">{visible ? "Visível no painel" : "Oculto no painel"}</p>
                </div>
                <Button type="button" size="sm" variant={visible ? "secondary" : "outline"} onClick={() => toggleWidget(widget.id)}>
                  {visible ? <Check /> : <LayoutDashboard />}{visible ? "Ativo" : "Adicionar"}
                </Button>
              </div>
            );
          })}
        </div>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>Concluir</Button>
          <Button type="button" onClick={() => { setSettingsOpen(false); setEditing(true); }}><GripVertical />Organizar tamanhos</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
