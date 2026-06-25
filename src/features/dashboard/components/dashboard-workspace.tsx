"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
import { Modal } from "@/components/ui/modal";
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

type WidgetId =
  | "agenda"
  | "reception"
  | "care"
  | "cash"
  | "nextAppointments"
  | "careFlow"
  | "administration";

const defaultWidgetOrder: WidgetId[] = [
  "agenda",
  "reception",
  "care",
  "cash",
  "nextAppointments",
  "careFlow",
  "administration",
];

function storageKey(clinicId: string | null) {
  return `clinicore.dashboard.widgets.${clinicId ?? "no-clinic"}`;
}

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
    <section className="rounded-lg border bg-card p-3.5 shadow-sm">
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
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
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
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border bg-card shadow-sm ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          {description ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DashboardWorkspace(props: DashboardWorkspaceProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(defaultWidgetOrder);
  const currentStorageKey = storageKey(props.activeClinicId);
  const careTotal =
    props.metrics.waitingTriage + props.metrics.readyForConsultation + props.metrics.inConsultation;

  useEffect(() => {
    const saved = window.localStorage.getItem(currentStorageKey);
    if (!saved) {
      setVisibleWidgets(defaultWidgetOrder);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as WidgetId[];
      const clean = parsed.filter((item): item is WidgetId => defaultWidgetOrder.includes(item));
      setVisibleWidgets(clean.length ? clean : defaultWidgetOrder);
    } catch {
      setVisibleWidgets(defaultWidgetOrder);
    }
  }, [currentStorageKey]);

  function persist(next: WidgetId[]) {
    setVisibleWidgets(next);
    window.localStorage.setItem(currentStorageKey, JSON.stringify(next));
  }

  const availableWidgets = useMemo(() => {
    const widgets: Array<{ id: WidgetId; label: string; render: () => ReactNode }> = [
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
            detail="Recebimentos carregados no financeiro"
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
                <Link href="/agenda">
                  Abrir agenda
                  <ArrowRight />
                </Link>
              </Button>
            }
            className="xl:col-span-2"
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
          <WidgetChrome title="Fluxo assistencial" description="Movimento atual entre recepção e consulta">
            <div className="grid gap-1 p-3">
              <div className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm hover:bg-muted/30">
                <span className="flex items-center gap-2">
                  <Clock3 className="size-4 text-amber-600" />
                  Pré-consulta
                </span>
                <strong className="tabular-nums">{props.metrics.waitingTriage}</strong>
              </div>
              <div className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm hover:bg-muted/30">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Prontos para consulta
                </span>
                <strong className="tabular-nums">{props.metrics.readyForConsultation}</strong>
              </div>
              <div className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm hover:bg-muted/30">
                <span className="flex items-center gap-2">
                  <Activity className="size-4 text-primary" />
                  Em atendimento
                </span>
                <strong className="tabular-nums">{props.metrics.inConsultation}</strong>
              </div>
            </div>
            <div className="border-t p-3">
              <Button asChild className="w-full" variant="outline">
                <Link href="/atendimentos">
                  Acompanhar atendimentos
                  <ArrowRight />
                </Link>
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
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="size-3.5" />
                    {props.membersCount} membros
                  </span>
                ) : null}
                {props.canViewAudit ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ShieldCheck className="size-3.5" />
                    Auditoria ativa
                  </span>
                ) : null}
              </div>
              {props.canViewFinancial ? (
                <Button asChild size="sm" className="mt-4">
                  <Link href="/financeiro">
                    Abrir financeiro
                    <ArrowRight />
                  </Link>
                </Button>
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
  const availableIds = availableWidgets.map((widget) => widget.id);
  const orderedVisible = visibleWidgets.filter((id) => availableIds.includes(id));

  function toggleWidget(id: WidgetId) {
    if (visibleWidgets.includes(id)) {
      persist(visibleWidgets.filter((item) => item !== id));
      return;
    }
    persist([...visibleWidgets, id]);
  }

  function moveWidget(id: WidgetId, direction: -1 | 1) {
    const index = visibleWidgets.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= visibleWidgets.length) return;
    const next = [...visibleWidgets];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    persist(next);
  }

  return (
    <div className="grid gap-5">
      <AccessDeniedToast denied={props.accessDenied} module={props.deniedModule} />
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase text-primary">Painel personalizável</p>
            {props.activeClinicId ? (
              <RealtimeClinicSync
                clinicId={props.activeClinicId}
                tables={["appointments", "clinical_encounters", "financial_entries", "financial_payments"]}
              />
            ) : null}
          </div>
          <h1 className="mt-1 text-xl font-semibold">Olá, {props.firstName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha os cards que fazem sentido para sua rotina e mantenha a visão do dia mais limpa.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.canCreateClinic ? (
            <Button asChild variant="outline">
              <Link href="/clinicas/nova">Nova clínica</Link>
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings2 />
            Personalizar painel
          </Button>
        </div>
      </header>

      <section className="grid gap-3 lg:grid-cols-4">
        {orderedVisible.slice(0, 4).map((id) => {
          const widget = availableWidgets.find((item) => item.id === id);
          return widget ? <Fragment key={id}>{widget.render()}</Fragment> : null;
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {orderedVisible.slice(4).map((id) => {
          const widget = availableWidgets.find((item) => item.id === id);
          return widget ? <Fragment key={id}>{widget.render()}</Fragment> : null;
        })}
      </section>

      <Modal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="Personalizar painel"
        description="Ative, oculte e ordene os cards disponíveis para o seu perfil."
        className="max-w-2xl"
      >
        <div className="grid gap-2">
          {availableWidgets.map((widget) => {
            const visible = visibleWidgets.includes(widget.id);
            return (
              <div key={widget.id} className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <GripVertical className="size-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{widget.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {visible ? "Visível no painel" : "Oculto no painel"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => moveWidget(widget.id, -1)}>
                    Subir
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => moveWidget(widget.id, 1)}>
                    Descer
                  </Button>
                  <Button type="button" size="sm" variant={visible ? "secondary" : "outline"} onClick={() => toggleWidget(widget.id)}>
                    {visible ? <Check /> : <LayoutDashboard />}
                    {visible ? "Ativo" : "Adicionar"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
