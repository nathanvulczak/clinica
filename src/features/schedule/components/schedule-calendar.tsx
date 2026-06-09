import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getAdjacentCalendarDate,
  getCalendarTitle,
  type CalendarViewMode,
} from "@/features/schedule/calendar";
import { formatTimeBr, getTodayInputDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AppointmentSummary, ScheduleBlock } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

export function ScheduleCalendar({
  date,
  view,
  days,
  appointments,
  blocks,
  professionalId,
  status,
}: {
  date: string;
  view: CalendarViewMode;
  days: string[];
  appointments: AppointmentSummary[];
  blocks: ScheduleBlock[];
  professionalId: string;
  status: string;
}) {
  const previousDate = getAdjacentCalendarDate(date, view, -1);
  const nextDate = getAdjacentCalendarDate(date, view, 1);
  const today = getTodayInputDate();

  return (
    <section className="grid gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon" title="Período anterior">
            <Link href={queryUrl({ date: previousDate, view, professionalId, status })}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={queryUrl({ date: today, view, professionalId, status })}>Hoje</Link>
          </Button>
          <Button asChild variant="outline" size="icon" title="Próximo período">
            <Link href={queryUrl({ date: nextDate, view, professionalId, status })}>
              <ChevronRight />
            </Link>
          </Button>
          <h2 className="ml-2 text-lg font-semibold capitalize">{getCalendarTitle(date, view)}</h2>
        </div>

        <div className="flex rounded-md border bg-background p-1">
          {(["day", "week", "month"] as CalendarViewMode[]).map((mode) => (
            <Button
              key={mode}
              asChild
              variant={view === mode ? "secondary" : "ghost"}
              size="sm"
              className="min-w-20"
            >
              <Link href={queryUrl({ date, view: mode, professionalId, status })}>
                {mode === "day" ? "Dia" : mode === "week" ? "Semana" : "Mês"}
              </Link>
            </Button>
          ))}
        </div>
      </header>

      {view === "day" ? null : (
        <div className="overflow-x-auto rounded-lg border">
          <div
            className="grid min-w-[980px] grid-cols-7"
          >
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((weekday) => (
              <div
                key={weekday}
                className="border-b border-r bg-muted px-3 py-2 text-center text-xs font-medium uppercase text-muted-foreground last:border-r-0"
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
                    "min-h-40 border-b border-r p-2 last:border-r-0",
                    view === "week" && "min-h-[420px]",
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
                    {dayAppointments.length > 0 ? <Badge>{dayAppointments.length}</Badge> : null}
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
                        <span className="font-medium">
                          {formatTimeBr(appointment.starts_at)} {appointment.patient?.full_name}
                        </span>
                        <span className="truncate text-muted-foreground">
                          {appointment.professional?.profile?.full_name ?? "Profissional"} •{" "}
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
