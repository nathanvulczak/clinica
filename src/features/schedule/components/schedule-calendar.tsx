"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type {
  BusinessHoursInput,
  DateSelectArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core";
import {
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  PanelsTopLeft,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { SCHEDULE_BLOCK_TYPE_LABELS } from "@/config/schedule";
import { moveCalendarAppointmentAction } from "@/features/schedule/actions";
import { AppointmentModal } from "@/features/schedule/components/appointment-modal";
import {
  getAdjacentCalendarDate,
  getCalendarTitle,
  toInputDate,
  type CalendarViewMode,
} from "@/features/schedule/calendar";
import { formatTimeBr, getTodayInputDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type {
  AppointmentSummary,
  ClinicRoom,
  ClinicService,
  PatientSummary,
  ProfessionalOperationalProfile,
  ScheduleBlock,
  ScheduleProfessional,
  ScheduleSettings,
} from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

const CALENDAR_VIEW_STORAGE_KEY = "clinicore.schedule.calendar-view";
const MAX_PANEL_PROFESSIONALS = 6;

type CalendarSelection = {
  date: string;
  startTime: string;
  duration: number;
  professionalId?: string;
};

type ScheduleCalendarProps = {
  date: string;
  view: CalendarViewMode;
  appointments: AppointmentSummary[];
  blocks: ScheduleBlock[];
  professionals: ScheduleProfessional[];
  patients: PatientSummary[];
  services: ClinicService[];
  rooms: ClinicRoom[];
  professionalProfiles: ProfessionalOperationalProfile[];
  scheduleSettings: ScheduleSettings[];
  professionalId: string;
  panelProfessionalIds: string[];
  status: string;
  canManage: boolean;
  focusMode?: boolean;
};

function queryUrl({
  date,
  view,
  professionalId,
  panelProfessionalIds,
  status,
}: {
  date: string;
  view: CalendarViewMode;
  professionalId: string;
  panelProfessionalIds: string[];
  status: string;
}) {
  const params = new URLSearchParams({
    date,
    view,
    professional_id: professionalId,
    status,
  });
  if (panelProfessionalIds.length) params.set("professionals", panelProfessionalIds.join(","));
  return `/agenda?${params.toString()}`;
}

function minutesInSaoPaulo(value: string) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).formatToParts(new Date(value));
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return Number(byType.get("hour")) * 60 + Number(byType.get("minute"));
}

function timeInput(value: Date) {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function viewPluginName(view: CalendarViewMode) {
  if (view === "month") return "dayGridMonth";
  if (view === "week") return "timeGridWeek";
  if (view === "list") return "listWeek";
  return "timeGridDay";
}

function viewLabel(view: CalendarViewMode) {
  const labels: Record<CalendarViewMode, string> = {
    day: "Dia",
    week: "Semana",
    month: "Mês",
    list: "Lista",
    clinic: "Painel da clínica",
  };
  return labels[view];
}

function professionalName(professionals: ScheduleProfessional[], id: string) {
  return professionals.find((item) => item.id === id)?.profile?.full_name ?? "Profissional";
}

function professionalColor(
  appointment: AppointmentSummary,
  profiles: ProfessionalOperationalProfile[],
) {
  return (
    profiles.find((profile) => profile.professional_member_id === appointment.professional_member_id)
      ?.appointment_color ??
    appointment.service?.color ??
    "#0f766e"
  );
}

function eventIsEditable(appointment: AppointmentSummary, canManage: boolean) {
  return canManage && ["scheduled", "confirmed"].includes(appointment.status);
}

function intervalsOverlap(startA: Date, endA: Date, startB: string, endB: string) {
  return startA.getTime() < new Date(endB).getTime() && endA.getTime() > new Date(startB).getTime();
}

function businessHoursFor(
  professionalId: string,
  settings: ScheduleSettings[],
): BusinessHoursInput {
  const source = professionalId === "all"
    ? settings
    : settings.filter((item) => item.professional_member_id === professionalId);
  const hours = source.flatMap((item) => {
    const configured = item.working_hours as { days?: string[]; start?: string; end?: string };
    if (!configured.days?.length || !configured.start || !configured.end) return [];
    return [{
      daysOfWeek: configured.days.map(Number),
      startTime: configured.start,
      endTime: configured.end,
    }];
  });
  return hours.length
    ? hours
    : [{ daysOfWeek: [1, 2, 3, 4, 5, 6], startTime: "07:00", endTime: "20:00" }];
}

function CalendarEventContent({ event, timeText, view }: EventContentArg) {
  const details = event.extendedProps as {
    kind?: string;
    status?: AppointmentSummary["status"];
    professionalName?: string;
    serviceName?: string;
    roomName?: string;
  };
  if (details.kind !== "appointment") return null;
  const compact = view.type === "dayGridMonth";

  return (
    <div className="min-w-0 px-0.5 py-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        {timeText ? <span className="shrink-0 text-[11px] font-semibold tabular-nums">{timeText}</span> : null}
        <span className="truncate text-[11px] font-semibold">{event.title}</span>
      </div>
      {!compact ? (
        <>
          <p className="mt-0.5 truncate text-[10px] opacity-80">
            {details.serviceName} · {details.professionalName}
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] opacity-75">
            <MapPin className="size-2.5 shrink-0" />{details.roomName}
          </p>
        </>
      ) : null}
    </div>
  );
}

function ClinicPanel({
  date,
  appointments,
  blocks,
  professionals,
  visibleIds,
  scheduleSettings,
  canManage,
  onSelect,
}: {
  date: string;
  appointments: AppointmentSummary[];
  blocks: ScheduleBlock[];
  professionals: ScheduleProfessional[];
  visibleIds: string[];
  scheduleSettings: ScheduleSettings[];
  canManage: boolean;
  onSelect: (selection: CalendarSelection) => void;
}) {
  const dayProfessionals = visibleIds
    .map((id) => professionals.find((item) => item.id === id))
    .filter((item): item is ScheduleProfessional => Boolean(item));
  const startMinutes = 7 * 60;
  const endMinutes = 21 * 60;
  const pixelsPerHour = 64;
  const totalHeight = ((endMinutes - startMinutes) / 60) * pixelsPerHour;
  const hours = Array.from({ length: (endMinutes - startMinutes) / 60 + 1 }, (_, index) => 7 + index);
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();

  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <div
        className="grid min-w-[1040px]"
        style={{ gridTemplateColumns: `68px repeat(${Math.max(dayProfessionals.length, 1)}, minmax(220px, 1fr))` }}
      >
        <div className="sticky left-0 z-20 border-b border-r bg-muted/80 px-2 py-2 text-xs font-medium text-muted-foreground">Hora</div>
        {dayProfessionals.map((professional) => {
          const count = appointments.filter((item) => item.professional_member_id === professional.id).length;
          return (
            <div key={professional.id} className="border-b border-r bg-muted/80 px-3 py-2 last:border-r-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{professional.profile?.full_name ?? "Profissional"}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{count} compromisso(s)</p>
                </div>
                <Badge className="h-5 shrink-0 border bg-background px-1.5 text-[10px] text-foreground">{professional.role === "doctor" ? "Médico" : "Profissional"}</Badge>
              </div>
            </div>
          );
        })}

        <div className="sticky left-0 z-10 border-r bg-card" style={{ height: totalHeight }}>
          {hours.map((hour) => (
            <span key={hour} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground" style={{ top: (hour - 7) * pixelsPerHour }}>
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {dayProfessionals.map((professional) => {
          const professionalAppointments = appointments.filter((item) => item.professional_member_id === professional.id);
          const professionalBlocks = blocks.filter((item) => item.professional_member_id === professional.id);
          const settings = scheduleSettings.find((item) => item.professional_member_id === professional.id);
          const configured = settings?.working_hours as { days?: string[]; start?: string; end?: string } | undefined;
          const worksToday = configured?.days?.includes(String(dayOfWeek));
          const workingStart = worksToday && configured?.start ? Number(configured.start.slice(0, 2)) * 60 + Number(configured.start.slice(3, 5)) : startMinutes;
          const workingEnd = worksToday && configured?.end ? Number(configured.end.slice(0, 2)) * 60 + Number(configured.end.slice(3, 5)) : endMinutes;

          return (
            <div key={professional.id} className="relative border-r last:border-r-0" style={{ height: totalHeight }}>
              {hours.slice(0, -1).map((hour) => {
                const hourMinutes = hour * 60;
                const unavailable = Boolean(configured) && (!worksToday || hourMinutes < workingStart || hourMinutes >= workingEnd);
                return (
                  <button
                    key={hour}
                    type="button"
                    disabled={!canManage || unavailable}
                    onDoubleClick={() => onSelect({ date, startTime: `${String(hour).padStart(2, "0")}:00`, duration: settings?.slot_minutes ?? 30, professionalId: professional.id })}
                    title={unavailable ? "Fora do expediente" : "Clique duas vezes para agendar"}
                    className={cn("absolute inset-x-0 border-t text-left hover:bg-primary/5", unavailable && "bg-muted/45")}
                    style={{ top: (hour - 7) * pixelsPerHour, height: pixelsPerHour }}
                  />
                );
              })}
              {professionalBlocks.map((block) => {
                const top = ((minutesInSaoPaulo(block.starts_at) - startMinutes) / 60) * pixelsPerHour;
                const height = Math.max(22, ((minutesInSaoPaulo(block.ends_at) - minutesInSaoPaulo(block.starts_at)) / 60) * pixelsPerHour);
                return (
                  <div key={block.id} className="pointer-events-none absolute inset-x-1 z-[2] overflow-hidden rounded-md border border-dashed bg-muted/90 px-2 py-1 text-[10px] text-muted-foreground" style={{ top, height }}>
                    <strong>{SCHEDULE_BLOCK_TYPE_LABELS[block.block_type]}</strong>{block.reason ? ` · ${block.reason}` : ""}
                  </div>
                );
              })}
              {professionalAppointments.map((appointment) => {
                const top = ((minutesInSaoPaulo(appointment.starts_at) - startMinutes) / 60) * pixelsPerHour;
                const duration = minutesInSaoPaulo(appointment.ends_at) - minutesInSaoPaulo(appointment.starts_at);
                const height = Math.max(30, (duration / 60) * pixelsPerHour);
                return (
                  <Link
                    key={appointment.id}
                    href={queryUrl({ date, view: "day", professionalId: professional.id, panelProfessionalIds: visibleIds, status: "all" })}
                    className="absolute inset-x-1 z-[3] overflow-hidden rounded-md border-l-4 bg-card px-2 py-1.5 text-[11px] shadow-sm transition-shadow hover:shadow-md"
                    style={{ top, height, borderLeftColor: appointment.service?.color ?? "#0f766e" }}
                  >
                    <p className="truncate font-semibold">{formatTimeBr(appointment.starts_at)} · {appointment.patient?.social_name || appointment.patient?.full_name || "Paciente"}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{appointment.service?.name ?? appointment.appointment_type}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{appointment.room?.name ?? "Consultório a definir"}</p>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScheduleCalendar(props: ScheduleCalendarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [selection, setSelection] = useState<CalendarSelection | null>(null);
  const [professionalsOpen, setProfessionalsOpen] = useState(false);
  const [draftProfessionalIds, setDraftProfessionalIds] = useState(props.panelProfessionalIds);
  const previousDate = getAdjacentCalendarDate(props.date, props.view, -1);
  const nextDate = getAdjacentCalendarDate(props.date, props.view, 1);
  const today = getTodayInputDate();

  useEffect(() => {
    if (searchParams.has("view")) {
      window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, props.view);
      return;
    }
    const savedView = window.localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY) as CalendarViewMode | null;
    if (!["day", "week", "month", "list", "clinic"].includes(savedView ?? "")) return;
    if (savedView !== props.view) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", savedView as CalendarViewMode);
      router.replace(`/agenda?${params.toString()}`, { scroll: false });
    }
  }, [props.view, router, searchParams]);

  const events = useMemo<EventInput[]>(() => [
    ...props.appointments.map((appointment) => {
      const color = professionalColor(appointment, props.professionalProfiles);
      return {
        id: appointment.id,
        title: appointment.patient?.social_name || appointment.patient?.full_name || "Paciente",
        start: appointment.starts_at,
        end: appointment.ends_at,
        editable: eventIsEditable(appointment, props.canManage),
        backgroundColor: color,
        borderColor: color,
        textColor: "#ffffff",
        extendedProps: {
          kind: "appointment",
          status: appointment.status,
          professionalName: professionalName(props.professionals, appointment.professional_member_id),
          serviceName: appointment.service?.name ?? appointment.appointment_type,
          roomName: appointment.room?.name ?? "Consultório a definir",
        },
      };
    }),
    ...props.blocks.map((block) => ({
      id: `block:${block.id}`,
      start: block.starts_at,
      end: block.ends_at,
      display: "background",
      backgroundColor: "rgba(100, 116, 139, 0.18)",
      editable: false,
      extendedProps: { kind: "block", professionalId: block.professional_member_id },
    })),
  ], [props.appointments, props.blocks, props.canManage, props.professionalProfiles, props.professionals]);

  const businessHours = useMemo(
    () => businessHoursFor(props.professionalId, props.scheduleSettings),
    [props.professionalId, props.scheduleSettings],
  );

  function openSelection(arg: DateSelectArg) {
    if (!props.canManage) return;
    const duration = Math.max(5, Math.round((arg.end.getTime() - arg.start.getTime()) / 60_000));
    setSelection({
      date: toInputDate(arg.start),
      startTime: timeInput(arg.start),
      duration,
      professionalId: props.professionalId === "all" ? undefined : props.professionalId,
    });
  }

  function eventClick(arg: EventClickArg) {
    if (arg.event.extendedProps.kind !== "appointment" || !arg.event.start) return;
    router.push(queryUrl({
      date: toInputDate(arg.event.start),
      view: "day",
      professionalId: props.professionalId,
      panelProfessionalIds: props.panelProfessionalIds,
      status: props.status,
    }));
  }

  function persistMovement(arg: EventDropArg | EventResizeDoneArg) {
    if (!arg.event.start || !arg.event.end) {
      arg.revert();
      return;
    }
    startTransition(async () => {
      const result = await moveCalendarAppointmentAction({
        appointmentId: arg.event.id,
        startsAt: arg.event.start?.toISOString(),
        endsAt: arg.event.end?.toISOString(),
      });
      if (result.error) arg.revert();
      toast({
        title: result.success ?? "Ação não concluída",
        description: result.error ?? "O novo horário foi validado e registrado na auditoria.",
        variant: result.error ? "destructive" : "default",
      });
      if (!result.error) router.refresh();
    });
  }

  function movementAllowed(start: Date, end: Date, draggedId?: string, selectedProfessionalId?: string) {
    const dragged = draggedId ? props.appointments.find((item) => item.id === draggedId) : null;
    const targetProfessionalId = dragged?.professional_member_id ?? selectedProfessionalId;
    const targetRoomId = dragged?.room_id ?? null;
    const conflictsAppointment = props.appointments.some(
      (item) =>
        item.id !== draggedId &&
        !["cancelled", "no_show", "rescheduled"].includes(item.status) &&
        (item.professional_member_id === targetProfessionalId || Boolean(targetRoomId && item.room_id === targetRoomId)) &&
        intervalsOverlap(start, end, item.starts_at, item.ends_at),
    );
    const conflictsBlock = props.blocks.some(
      (item) => item.professional_member_id === targetProfessionalId && intervalsOverlap(start, end, item.starts_at, item.ends_at),
    );
    return !conflictsAppointment && !conflictsBlock;
  }

  function applyPanelProfessionals() {
    const selected = draftProfessionalIds.slice(0, MAX_PANEL_PROFESSIONALS);
    router.push(queryUrl({
      date: props.date,
      view: "clinic",
      professionalId: "all",
      panelProfessionalIds: selected,
      status: props.status,
    }));
    setProfessionalsOpen(false);
  }

  return (
    <section className="grid gap-3">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" title="Período anterior" className="size-8">
            <Link href={queryUrl({ date: previousDate, view: props.view, professionalId: props.professionalId, panelProfessionalIds: props.panelProfessionalIds, status: props.status })}><ChevronLeft className="size-4" /></Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href={queryUrl({ date: today, view: props.view, professionalId: props.professionalId, panelProfessionalIds: props.panelProfessionalIds, status: props.status })}>Hoje</Link>
          </Button>
          <Button asChild variant="ghost" size="icon" title="Próximo período" className="size-8">
            <Link href={queryUrl({ date: nextDate, view: props.view, professionalId: props.professionalId, panelProfessionalIds: props.panelProfessionalIds, status: props.status })}><ChevronRight className="size-4" /></Link>
          </Button>
          <h2 className="ml-1 text-sm font-semibold capitalize">{getCalendarTitle(props.date, props.view)}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {props.view === "clinic" ? (
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setProfessionalsOpen(true)}>
              <SlidersHorizontal />Profissionais ({props.panelProfessionalIds.length})
            </Button>
          ) : null}
          <div className="flex rounded-md border bg-card p-0.5">
            {(["day", "week", "month", "list", "clinic"] as CalendarViewMode[]).map((mode) => (
              <Button key={mode} asChild variant={props.view === mode ? "secondary" : "ghost"} size="sm" className="h-7 px-2 text-xs">
                <Link
                  href={queryUrl({ date: props.date, view: mode, professionalId: mode === "clinic" ? "all" : props.professionalId, panelProfessionalIds: props.panelProfessionalIds, status: props.status })}
                  onClick={() => window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, mode)}
                  title={viewLabel(mode)}
                >
                  {mode === "clinic" ? <PanelsTopLeft className="size-3.5" /> : mode === "list" ? <CalendarRange className="size-3.5" /> : null}
                  {viewLabel(mode)}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </header>

      {props.view === "clinic" ? (
        <ClinicPanel
          date={props.date}
          appointments={props.appointments}
          blocks={props.blocks}
          professionals={props.professionals}
          visibleIds={props.panelProfessionalIds}
          scheduleSettings={props.scheduleSettings}
          canManage={props.canManage}
          onSelect={setSelection}
        />
      ) : (
        <div className="schedule-fullcalendar overflow-hidden rounded-lg border bg-background p-2">
          <FullCalendar
            key={`${props.view}:${props.date}:${props.professionalId}`}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            locale={ptBrLocale}
            firstDay={1}
            initialView={viewPluginName(props.view)}
            initialDate={props.date}
            headerToolbar={false}
            events={events}
            businessHours={businessHours}
            nowIndicator
            selectable={props.canManage && props.patients.length > 0}
            selectMirror
            select={openSelection}
            selectAllow={(arg) => movementAllowed(
              arg.start,
              arg.end,
              undefined,
              props.professionalId === "all" ? props.professionals[0]?.id : props.professionalId,
            )}
            editable={props.canManage}
            eventStartEditable={props.canManage}
            eventDurationEditable={props.canManage}
            eventOverlap={false}
            eventAllow={(drop, dragged) => movementAllowed(drop.start, drop.end, dragged?.id)}
            eventDrop={persistMovement}
            eventResize={persistMovement}
            eventClick={eventClick}
            eventContent={CalendarEventContent}
            eventClassNames={(arg) => [`schedule-event-${String(arg.event.extendedProps.status ?? "block")}`]}
            allDaySlot={false}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            slotDuration="00:15:00"
            snapDuration="00:05:00"
            slotLabelInterval="01:00:00"
            slotEventOverlap={false}
            dayMaxEvents={4}
            navLinks
            height={props.focusMode ? "calc(100vh - 250px)" : "auto"}
            contentHeight={props.focusMode ? "auto" : props.view === "month" ? 690 : 760}
            expandRows
            stickyHeaderDates
            progressiveEventRendering
            weekends
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5"><Clock3 className="size-3.5" />
          {props.view === "clinic"
            ? "Clique duas vezes em um horário livre para agendar na coluna do profissional."
            : "Arraste para mover, redimensione pela borda inferior e selecione um intervalo para agendar."}
        </p>
        <p className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-600" />Conflitos e alterações são validados no servidor.</p>
      </div>

      <AppointmentModal
        professionals={props.professionals}
        patients={props.patients}
        services={props.services}
        rooms={props.rooms}
        professionalProfiles={props.professionalProfiles}
        scheduleSettings={props.scheduleSettings}
        defaultDate={selection?.date ?? props.date}
        defaultStartTime={selection?.startTime}
        defaultDuration={selection?.duration}
        defaultProfessionalId={selection?.professionalId}
        open={Boolean(selection)}
        onOpenChange={(open) => { if (!open) setSelection(null); }}
        hideTrigger
        disabled={!props.canManage}
      />

      <Modal
        open={professionalsOpen}
        onOpenChange={setProfessionalsOpen}
        title="Profissionais visíveis"
        description={`Escolha até ${MAX_PANEL_PROFESSIONALS} agendas para manter o painel rápido e legível.`}
        size="sm"
      >
        <div className="grid gap-2">
          {props.professionals.map((professional) => {
            const checked = draftProfessionalIds.includes(professional.id);
            const atLimit = !checked && draftProfessionalIds.length >= MAX_PANEL_PROFESSIONALS;
            return (
              <label key={professional.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2"><UserRound className="size-4 text-muted-foreground" /><span className="truncate text-sm font-medium">{professional.profile?.full_name ?? "Profissional"}</span></span>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={atLimit}
                  onChange={(event) => setDraftProfessionalIds((current) => event.target.checked ? [...current, professional.id] : current.filter((id) => id !== professional.id))}
                  className="size-4 accent-primary"
                />
              </label>
            );
          })}
        </div>
        <ModalFooter>
          <Button type="button" variant="outline" onClick={() => setProfessionalsOpen(false)}>Cancelar</Button>
          <Button type="button" onClick={applyPanelProfessionals} disabled={!draftProfessionalIds.length}>Aplicar visualização</Button>
        </ModalFooter>
      </Modal>
    </section>
  );
}
