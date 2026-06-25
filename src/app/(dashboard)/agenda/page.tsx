import Link from "next/link";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HeartPulse,
  LockKeyhole,
  Stethoscope,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUSES } from "@/config/schedule";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  getCalendarRange,
  type CalendarViewMode,
} from "@/features/schedule/calendar";
import { AppointmentsBoard } from "@/features/schedule/components/appointments-board";
import { AppointmentModal } from "@/features/schedule/components/appointment-modal";
import { ScheduleCalendar } from "@/features/schedule/components/schedule-calendar";
import { getTodayInputDate } from "@/lib/dates";
import { getAppUrl } from "@/lib/env";
import {
  getRegistrationAccess,
  listClinicRooms,
  listClinicServices,
  listProfessionalOperationalProfiles,
} from "@/repositories/registrations";
import {
  getScheduleAccess,
  listAppointmentWorkflowEvents,
  listAppointments,
  listScheduleBlocks,
  listSchedulePatients,
  listScheduleProfessionals,
  listScheduleSettings,
} from "@/repositories/schedule";
import type { AppointmentStatus, AppointmentSummary } from "@/types/domain";
import { PageHeader } from "@/components/app/page-header";
import { RealtimeClinicSync } from "@/components/app/realtime-clinic-sync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

function normalizeStatus(value?: string): AppointmentStatus | "all" {
  if (value && APPOINTMENT_STATUSES.includes(value as AppointmentStatus)) {
    return value as AppointmentStatus;
  }

  return "all";
}

function normalizeView(value?: string): CalendarViewMode {
  return value === "week" || value === "month" ? value : "day";
}

function metricTone(tone: "neutral" | "success" | "warning" | "care") {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-emerald-500/10 text-emerald-700",
    warning: "bg-amber-500/10 text-amber-700",
    care: "bg-primary/10 text-primary",
  };

  return tones[tone];
}

function AgendaMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "care";
}) {
  return (
    <div className="rounded-lg border bg-card px-3.5 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
        </div>
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-md ${metricTone(tone)}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function formatTime(value?: string | null) {
  if (!value) return "--:--";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function nextOperationalAppointment(appointments: AppointmentSummary[]) {
  const now = Date.now();

  return appointments.find(
    (appointment) =>
      !["cancelled", "no_show", "rescheduled", "completed", "billing_pending", "billed"].includes(
        appointment.status,
      ) && new Date(appointment.starts_at).getTime() >= now,
  );
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { activeClinic } = await getActiveClinicContext();
  const date = params.date || getTodayInputDate();
  const view = normalizeView(params.view);
  const range = getCalendarRange(date, view);
  const status = normalizeStatus(params.status);
  const confirmationUrlBase = `${getAppUrl()}/confirmar-consulta`;
  const scheduleAccess = await getScheduleAccess(activeClinic?.id);
  const registrationAccess = await getRegistrationAccess(activeClinic?.id);
  const professionalId = scheduleAccess.canManage
    ? params.professional_id || "all"
    : scheduleAccess.currentMemberId || "all";

  const [
    professionals,
    patients,
    appointments,
    blocks,
    services,
    rooms,
    professionalProfiles,
    scheduleSettings,
  ] =
    activeClinic && scheduleAccess.canView
      ? await Promise.all([
          listScheduleProfessionals(activeClinic.id, {
            scopeToCurrentUser: true,
            access: scheduleAccess,
          }),
          scheduleAccess.canManage ? listSchedulePatients(activeClinic.id) : Promise.resolve([]),
          listAppointments(activeClinic.id, {
            startDate: range.startDate,
            endDate: range.endDate,
            professionalId,
            status,
          }),
          listScheduleBlocks(activeClinic.id, {
            startDate: range.startDate,
            endDate: range.endDate,
            professionalId,
          }),
          scheduleAccess.canManage ? listClinicServices(activeClinic.id) : Promise.resolve([]),
          scheduleAccess.canManage ? listClinicRooms(activeClinic.id) : Promise.resolve([]),
          scheduleAccess.canManage
            ? listProfessionalOperationalProfiles(activeClinic.id, registrationAccess)
            : Promise.resolve([]),
          scheduleAccess.canManage ? listScheduleSettings(activeClinic.id) : Promise.resolve([]),
        ])
      : [[], [], [], [], [], [], [], []];
  const workflowEvents =
    activeClinic && scheduleAccess.canView
      ? await listAppointmentWorkflowEvents(
          activeClinic.id,
          appointments.map((appointment) => appointment.id),
        )
      : [];

  const confirmedCount = appointments.filter((appointment) =>
    ["confirmed", "checked_in", "in_triage", "in_progress"].includes(appointment.status),
  ).length;
  const waitingCount = appointments.filter((appointment) => appointment.status === "checked_in").length;
  const careFlowCount = appointments.filter((appointment) =>
    ["in_triage", "in_progress"].includes(appointment.status),
  ).length;
  const finishedCount = appointments.filter((appointment) =>
    ["completed", "billing_pending", "billed"].includes(appointment.status),
  ).length;
  const nextAppointment = nextOperationalAppointment(appointments);
  const professionalsInUse = new Set(appointments.map((appointment) => appointment.professional_member_id)).size;

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Central operacional para compromissos, chegada do paciente e liberação do fluxo assistencial."
        action={
          activeClinic && scheduleAccess.canView ? (
            <AppointmentModal
              professionals={professionals}
              patients={patients}
              services={services}
              rooms={rooms}
              professionalProfiles={professionalProfiles}
              scheduleSettings={scheduleSettings}
              defaultDate={date}
              disabled={!scheduleAccess.canManage || professionals.length === 0}
            />
          ) : null
        }
      />

      {!activeClinic ? (
        <Card>
          <CardHeader>
            <CardTitle>Clínica ativa necessária</CardTitle>
            <CardDescription>Cadastre ou selecione uma clínica para liberar a agenda.</CardDescription>
          </CardHeader>
        </Card>
      ) : !scheduleAccess.canView ? (
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>
              Seu perfil atual não possui permissão para visualizar a agenda desta clínica.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
              <LockKeyhole className="size-5 text-primary" />
              Solicite liberação de agenda ao proprietário ou administrador da clínica.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <RealtimeClinicSync clinicId={activeClinic.id} tables={["appointments", "clinical_encounters"]} />

          <section className="rounded-lg border bg-card px-4 py-3 shadow-sm">
            <form className="grid gap-3 xl:grid-cols-[150px_minmax(220px,1fr)_190px_auto] xl:items-end">
              <input type="hidden" name="view" value={view} />
              <div className="grid gap-1.5">
                <Label htmlFor="date" className="text-xs">Data</Label>
                <Input id="date" name="date" type="date" defaultValue={date} className="h-9" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="professional_id" className="text-xs">Profissional</Label>
                <Select id="professional_id" name="professional_id" defaultValue={professionalId} className="h-9">
                  {scheduleAccess.canManage ? <option value="all">Todos os profissionais</option> : null}
                  {professionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>
                      {professional.profile?.full_name ?? "Profissional sem nome"}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="status" className="text-xs">Status</Label>
                <Select id="status" name="status" defaultValue={status} className="h-9">
                  <option value="all">Todos</option>
                  {APPOINTMENT_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {APPOINTMENT_STATUS_LABELS[item]}
                    </option>
                  ))}
                </Select>
              </div>
              <Button className="h-9">
                <CalendarDays className="size-4" />
                Filtrar
              </Button>
            </form>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AgendaMetric
              icon={CalendarClock}
              label="Compromissos"
              value={appointments.length}
              detail={`${professionalsInUse || 0} profissional(is) no período`}
              tone="care"
            />
            <AgendaMetric
              icon={CheckCircle2}
              label="Confirmados / em fluxo"
              value={confirmedCount}
              detail={`${waitingCount} paciente(s) aguardando decisão`}
              tone="success"
            />
            <AgendaMetric
              icon={HeartPulse}
              label="Assistencial"
              value={careFlowCount}
              detail="pré-consulta ou atendimento em andamento"
              tone="warning"
            />
            <AgendaMetric
              icon={CalendarCheck2}
              label="Finalizados"
              value={finishedCount}
              detail={`${blocks.length} bloqueio(s) no período`}
              tone="neutral"
            />
          </section>

          <section className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm xl:grid-cols-[1fr_280px] xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border bg-background text-foreground">{activeClinic.trade_name}</Badge>
                <Badge className="bg-primary/10 text-primary">
                  {scheduleAccess.canManage ? "Visão ampla da clínica" : "Minha agenda"}
                </Badge>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-4">
                {[
                  { label: "Agendar", icon: CalendarDays },
                  { label: "Confirmar", icon: CheckCircle2 },
                  { label: "Chegada", icon: UsersRound },
                  { label: "Cuidado", icon: Stethoscope },
                ].map((step, index) => (
                  <div key={step.label} className="min-w-0 rounded-md border bg-background px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                        {index + 1}
                      </span>
                      <step.icon className="size-3.5 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{step.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground">Próximo compromisso</p>
              <p className="mt-1 truncate text-sm font-semibold">
                {nextAppointment?.patient?.social_name ||
                  nextAppointment?.patient?.full_name ||
                  "Nenhum próximo compromisso"}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock3 className="size-3.5" />
                {nextAppointment
                  ? `${formatTime(nextAppointment.starts_at)} • ${
                      nextAppointment.professional?.profile?.full_name ?? "Profissional"
                    }`
                  : "Agenda livre conforme filtros atuais"}
              </p>
            </div>
          </section>

          <Card>
            <CardHeader className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Calendário operacional</CardTitle>
                  <CardDescription>
                    {scheduleAccess.canManage
                      ? "Visão por dia, semana ou mês com profissionais, consultórios e bloqueios."
                      : "Sua visualização está restrita aos pacientes vinculados à sua agenda."}
                  </CardDescription>
                </div>
                <Badge className="bg-muted text-muted-foreground">
                  {view === "day" ? "Visão diária" : view === "week" ? "Visão semanal" : "Visão mensal"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ScheduleCalendar
                date={date}
                view={view}
                days={range.days}
                appointments={appointments}
                blocks={blocks}
                professionals={professionals}
                professionalId={professionalId}
                status={status}
              />
            </CardContent>
          </Card>

          {professionals.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Profissionais da clínica</CardTitle>
                <CardDescription>
                  Cadastre membros ativos com perfil de médico, enfermagem ou profissional para iniciar a agenda.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {view === "day" ? (
            <Card>
              <CardHeader className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Eventos do dia</CardTitle>
                    <CardDescription>Detalhes, confirmação, chegada, remarcação e exclusão auditada.</CardDescription>
                  </div>
                  <Badge>
                    {scheduleAccess.canManage || scheduleAccess.canOperateOwn
                      ? "Etapas liberadas"
                      : "Somente leitura"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <AppointmentsBoard
                  appointments={appointments}
                  blocks={blocks}
                  professionals={professionals}
                  patients={patients}
                  services={services}
                  rooms={rooms}
                  professionalProfiles={professionalProfiles}
                  scheduleSettings={scheduleSettings}
                  workflowEvents={workflowEvents}
                  canManage={scheduleAccess.canManage}
                  canDelete={scheduleAccess.canDelete}
                  canUpdateStatus={scheduleAccess.canManage || scheduleAccess.canOperateOwn}
                  confirmationUrlBase={confirmationUrlBase}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-base">Configuração profissional</CardTitle>
              <CardDescription>
                Expediente, disponibilidade, consultório padrão e bloqueios continuam centralizados no cadastro do profissional.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Button asChild variant="outline" size="sm">
                <Link href="/cadastros?section=professionals">Abrir cadastros de profissionais</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
