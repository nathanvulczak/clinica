"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Clock3, MapPin } from "lucide-react";
import {
  APPOINTMENT_STATUS_LABELS,
  SCHEDULE_BLOCK_TYPE_LABELS,
} from "@/config/schedule";
import {
  getAdjacentCalendarDate,
  getCalendarTitle,
  type CalendarViewMode,
} from "@/features/schedule/calendar";
import { formatTimeBr, getTodayInputDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type {
  AppointmentSummary,
  ScheduleBlock,
  ScheduleProfessional,
} from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CALENDAR_VIEW_STORAGE_KEY = "clinicore.schedule.calendar-view";

function queryUrl({
  date,
  view,
  professionalId,
  status,
}: {
  date: string;
  view: CalendarViewMode;
  professionalId: string;
  status: string;
}) {
  const params = new URLSearchParams({
    date,
    view,
    professional_id: professionalId,
    status,
  });
  return `/agenda?${params.toString()}`;
}

function eventDate(value: string) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(new Date(value));
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function eventHour(value: string) {
  return Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value)),
  );
}

function professionalName(professionals: ScheduleProfessional[], professionalId: string) {
  return (
    professionals.find((professional) => professional.id === professionalId)?.profile?.full_name ??
    "Profissional"
  );
}

function appointmentTone(status: AppointmentSummary["status"]) {
  return cn(
    status === "scheduled" && "border-slate-300 bg-slate-50 text-slate-700",
    status === "confirmed" && "border-primary/30 bg-primary/10 text-primary",
    status === "checked_in" && "border-emerald-300 bg-emerald-50 text-emerald-800",
    status === "in_triage" && "border-cyan-300 bg-cyan-50 text-cyan-800",
    status === "in_progress" && "border-blue-300 bg-blue-50 text-blue-800",
    status === "completed" && "border-slate-300 bg-slate-100 text-slate-700",
    status === "billing_pending" && "border-amber-300 bg-amber-50 text-amber-800",
    status === "billed" && "border-emerald-300 bg-emerald-50 text-emerald-800",
    ["cancelled", "no_show", "rescheduled"].includes(status) &&
      "border-destructive/30 bg-destructive/10 text-destructive",
  );
}

function rangeHours(appointments: AppointmentSummary[], blocks: ScheduleBlock[]) {
  const hours = [
    ...appointments.map((appointment) => eventHour(appointment.starts_at)),
    ...blocks.map((block) => eventHour(block.starts_at)),
  ];
  const min = Math.min(7, ...hours);
  const max = Math.max(19, ...hours);

  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

function DayTimeline({
  day,
  appointments,
  blocks,
  professionals,
  professionalId,
}: {
  day: string;
  appointments: AppointmentSummary[];
  blocks: ScheduleBlock[];
  professionals: ScheduleProfessional[];
  professionalId: string;
}) {
  const dayAppointments = appointments.filter((appointment) => eventDate(appointment.starts_at) === day);
  const dayBlocks = blocks.filter((block) => eventDate(block.starts_at) === day);
  const activeProfessionalIds = new Set([
    ...dayAppointments.map((appointment) => appointment.professional_member_id),
    ...dayBlocks.map((block) => block.professional_member_id),
  ]);
  const visibleProfessionals = (
    professionalId !== "all"
      ? professionals.filter((professional) => professional.id === professionalId)
      : professionals.filter((professional) => activeProfessionalIds.has(professional.id))
  ).map((professional) => ({
    id: professional.id,
    name: professional.profile?.full_name ?? "Profissional sem nome",
    role: professional.role,
  }));
  const fallbackLanes = Array.from(activeProfessionalIds).map((id) => {
    const appointment = dayAppointments.find((item) => item.professional_member_id === id);
    return {
      id,
      name: appointment?.professional?.profile?.full_name ?? "Profissional",
      role: appointment?.professional?.role ?? "professional",
    };
  });
  const lanes =
    visibleProfessionals.length > 0
      ? visibleProfessionals
      : fallbackLanes.length > 0
        ? fallbackLanes
        : professionals.slice(0, 6).map((professional) => ({
            id: professional.id,
            name: professional.profile?.full_name ?? "Profissional sem nome",
            role: professional.role,
          }));
  const hours = rangeHours(dayAppointments, dayBlocks);

  if (dayAppointments.length === 0 && dayBlocks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center">
        <Clock3 className="mx-auto size-8 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">Agenda livre neste dia</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Use “Novo compromisso” para criar um horário ou ajuste os filtros acima.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <div
        className="grid min-w-[980px]"
        style={{
          gridTemplateColumns: `72px repeat(${Math.max(lanes.length, 1)}, minmax(220px, 1fr))`,
        }}
      >
        <div className="sticky left-0 z-10 border-b border-r bg-muted/70 px-3 py-2 text-xs font-medium text-muted-foreground">
          Hora
        </div>
        {lanes.map((professional) => (
          <div key={professional.id} className="border-b border-r bg-muted/70 px-3 py-2 last:border-r-0">
            <p className="truncate text-xs font-semibold">
              {professional.name}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {professional.role === "doctor" ? "Médico" : professional.role === "nurse" ? "Enfermagem" : "Profissional"}
            </p>
          </div>
        ))}

        {hours.map((hour) => (
          <div key={hour} className="contents">
            <div className="sticky left-0 z-10 border-r border-t bg-card px-3 py-3 text-xs font-medium tabular-nums text-muted-foreground">
              {String(hour).padStart(2, "0")}:00
            </div>
            {lanes.map((professional) => {
              const hourAppointments = dayAppointments.filter(
                (appointment) =>
                  appointment.professional_member_id === professional.id &&
                  eventHour(appointment.starts_at) === hour,
              );
              const hourBlocks = dayBlocks.filter(
                (block) =>
                  block.professional_member_id === professional.id && eventHour(block.starts_at) === hour,
              );

              return (
                <div key={`${hour}-${professional.id}`} className="min-h-20 border-r border-t p-2 last:border-r-0">
                  <div className="grid gap-1.5">
                    {hourAppointments.map((appointment) => (
                      <div
                        key={appointment.id}
                        className={cn(
                          "rounded-md border-l-4 px-2.5 py-2 text-xs shadow-sm",
                          appointmentTone(appointment.status),
                        )}
                        style={{ borderLeftColor: appointment.service?.color ?? undefined }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">
                              {formatTimeBr(appointment.starts_at)} {appointment.patient?.social_name || appointment.patient?.full_name || "Paciente"}
                            </p>
                            <p className="mt-1 truncate text-[11px] opacity-80">
                              {appointment.service?.name ?? appointment.appointment_type}
                            </p>
                          </div>
                          <Badge className="h-5 shrink-0 border bg-background px-1.5 text-[10px] text-foreground">
                            {APPOINTMENT_STATUS_LABELS[appointment.status]}
                          </Badge>
                        </div>
                        <p className="mt-1 flex min-w-0 items-center gap-1 truncate text-[11px] opacity-75">
                          <MapPin className="size-3 shrink-0" />
                          {appointment.room?.name ?? "Local a definir"}
                        </p>
                      </div>
                    ))}
                    {hourBlocks.map((block) => (
                      <div
                        key={block.id}
                        className="rounded-md border border-dashed bg-muted px-2.5 py-2 text-xs text-muted-foreground"
                      >
                        <p className="font-medium">
                          {formatTimeBr(block.starts_at)} até {formatTimeBr(block.ends_at)}
                        </p>
                        <p className="mt-0.5 truncate">
                          {SCHEDULE_BLOCK_TYPE_LABELS[block.block_type]}{block.reason ? ` • ${block.reason}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScheduleCalendar({
  date,
  view,
  days,
  appointments,
  blocks,
  professionals,
  professionalId,
  status,
}: {
  date: string;
  view: CalendarViewMode;
  days: string[];
  appointments: AppointmentSummary[];
  blocks: ScheduleBlock[];
  professionals: ScheduleProfessional[];
  professionalId: string;
  status: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const previousDate = getAdjacentCalendarDate(date, view, -1);
  const nextDate = getAdjacentCalendarDate(date, view, 1);
  const today = getTodayInputDate();

  useEffect(() => {
    if (searchParams.has("view")) {
      window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, view);
      return;
    }

    const savedView = window.localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);

    if (savedView !== "day" && savedView !== "week" && savedView !== "month") {
      return;
    }

    if (savedView !== view) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", savedView);
      router.replace(`/agenda?${params.toString()}`, { scroll: false });
    }
  }, [router, searchParams, view]);

  return (
    <section className="grid gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon" title="Período anterior" className="size-8">
            <Link href={queryUrl({ date: previousDate, view, professionalId, status })}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href={queryUrl({ date: today, view, professionalId, status })}>Hoje</Link>
          </Button>
          <Button asChild variant="outline" size="icon" title="Próximo período" className="size-8">
            <Link href={queryUrl({ date: nextDate, view, professionalId, status })}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          <h2 className="ml-1 text-base font-semibold capitalize">{getCalendarTitle(date, view)}</h2>
        </div>

        <div className="flex rounded-md border bg-background p-1">
          {(["day", "week", "month"] as CalendarViewMode[]).map((mode) => (
            <Button
              key={mode}
              asChild
              variant={view === mode ? "secondary" : "ghost"}
              size="sm"
              className="h-7 min-w-16 px-2 text-xs"
            >
              <Link
                href={queryUrl({ date, view: mode, professionalId, status })}
                onClick={() => window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, mode)}
              >
                {mode === "day" ? "Dia" : mode === "week" ? "Semana" : "Mês"}
              </Link>
            </Button>
          ))}
        </div>
      </header>

      {view === "day" ? (
        <DayTimeline
          day={date}
          appointments={appointments}
          blocks={blocks}
          professionals={professionals}
          professionalId={professionalId}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <div className="grid min-w-[980px] grid-cols-7">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((weekday) => (
              <div
                key={weekday}
                className="border-b border-r bg-muted/70 px-3 py-2 text-center text-xs font-medium uppercase text-muted-foreground last:border-r-0"
              >
                {weekday}
              </div>
            ))}

            {days.map((day) => {
              const dayAppointments = appointments.filter(
                (appointment) => eventDate(appointment.starts_at) === day,
              );
              const dayBlocks = blocks.filter((block) => eventDate(block.starts_at) === day);
              const parsed = new Date(`${day}T12:00:00`);
              const outsideMonth =
                view === "month" &&
                parsed.getMonth() !== new Date(`${date}T12:00:00`).getMonth();

              return (
                <div
                  key={day}
                  className={cn(
                    "min-h-36 border-b border-r p-2 last:border-r-0",
                    view === "week" && "min-h-[380px]",
                    outsideMonth && "bg-muted/30 text-muted-foreground",
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md text-sm font-medium",
                        day === today && "bg-primary text-primary-foreground",
                      )}
                    >
                      {parsed.getDate()}
                    </span>
                    {dayAppointments.length > 0 ? (
                      <Badge className="h-5 border bg-background px-1.5 text-[10px] text-foreground">
                        {dayAppointments.length}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="grid gap-1.5">
                    {dayAppointments.slice(0, view === "month" ? 4 : 12).map((appointment) => (
                      <Link
                        key={appointment.id}
                        href={queryUrl({
                          date: day,
                          view: "day",
                          professionalId,
                          status,
                        })}
                        className="grid gap-0.5 rounded-md border-l-4 bg-card px-2 py-1.5 text-xs shadow-sm transition-colors hover:bg-muted"
                        style={{ borderLeftColor: appointment.service?.color ?? "#0f766e" }}
                      >
                        <span className="truncate font-medium">
                          {formatTimeBr(appointment.starts_at)} {appointment.patient?.full_name}
                        </span>
                        <span className="truncate text-muted-foreground">
                          {professionalName(professionals, appointment.professional_member_id)} •{" "}
                          {appointment.room?.name ?? "Sem sala"}
                        </span>
                      </Link>
                    ))}
                    {view === "month" && dayAppointments.length > 4 ? (
                      <Link
                        href={queryUrl({ date: day, view: "day", professionalId, status })}
                        className="px-1 text-xs font-medium text-primary"
                      >
                        + {dayAppointments.length - 4} compromisso(s)
                      </Link>
                    ) : null}
                    {dayBlocks.map((block) => (
                      <div
                        key={block.id}
                        className="rounded-md border border-dashed bg-muted px-2 py-1 text-xs text-muted-foreground"
                      >
                        {formatTimeBr(block.starts_at)} bloqueado
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
