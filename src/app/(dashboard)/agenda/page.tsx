import { Activity, CalendarDays, ClipboardCheck, LockKeyhole, UserRound } from "lucide-react";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUSES } from "@/config/schedule";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  getCalendarRange,
  type CalendarViewMode,
} from "@/features/schedule/calendar";
import { AppointmentsBoard } from "@/features/schedule/components/appointments-board";
import { ScheduleCalendar } from "@/features/schedule/components/schedule-calendar";
import {
  AppointmentForm,
  ProfessionalSettingsForm,
  ScheduleBlockForm,
} from "@/features/schedule/components/schedule-forms";
import { getTodayInputDate } from "@/lib/dates";
import { listClinicRooms, listClinicServices } from "@/repositories/registrations";
import {
  getScheduleAccess,
  listAppointments,
  listScheduleBlocks,
  listSchedulePatients,
  listScheduleProfessionals,
  listScheduleSettings,
} from "@/repositories/schedule";
import { getAppUrl } from "@/lib/env";
import type { AppointmentStatus } from "@/types/domain";
import { PageHeader } from "@/components/app/page-header";
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
  const professionalId = scheduleAccess.canManage
    ? params.professional_id || "all"
    : scheduleAccess.currentMemberId || "all";

  const [professionals, patients, settings, appointments, blocks, services, rooms] =
    activeClinic && scheduleAccess.canView
      ? await Promise.all([
          listScheduleProfessionals(activeClinic.id, {
            scopeToCurrentUser: true,
            access: scheduleAccess,
          }),
          listSchedulePatients(activeClinic.id),
          listScheduleSettings(activeClinic.id),
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
          listClinicServices(activeClinic.id),
          listClinicRooms(activeClinic.id),
        ])
      : [[], [], [], [], [], [], []];

  const confirmedCount = appointments.filter((appointment) =>
    ["confirmed", "checked_in", "in_triage", "in_progress"].includes(appointment.status),
  ).length;
  const finishedCount = appointments.filter((appointment) =>
    ["completed", "billing_pending", "billed"].includes(appointment.status),
  ).length;

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Gerencie compromissos, profissionais, bloqueios e fluxo operacional da clínica ativa com rastreabilidade."
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
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Filtros da agenda</CardTitle>
              <CardDescription>Contexto atual: {activeClinic.trade_name}</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 lg:grid-cols-[160px_minmax(220px,1fr)_220px_auto] lg:items-end">
                <input type="hidden" name="view" value={view} />
                <div className="grid gap-2">
                  <Label htmlFor="date">Data</Label>
                  <Input id="date" name="date" type="date" defaultValue={date} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="professional_id">Profissional</Label>
                  <Select id="professional_id" name="professional_id" defaultValue={professionalId}>
                    {scheduleAccess.canManage ? <option value="all">Todos</option> : null}
                    {professionals.map((professional) => (
                      <option key={professional.id} value={professional.id}>
                        {professional.profile?.full_name ?? "Profissional sem nome"}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  <Select id="status" name="status" defaultValue={status}>
                    <option value="all">Todos</option>
                    {APPOINTMENT_STATUSES.map((item) => (
                      <option key={item} value={item}>
                        {APPOINTMENT_STATUS_LABELS[item]}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button>
                  <CalendarDays />
                  Filtrar
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Calendário da clínica</CardTitle>
              <CardDescription>
                {scheduleAccess.canManage
                  ? "Visão ampla conforme os filtros da clínica ativa."
                  : "Sua visualização está restrita aos pacientes vinculados à sua agenda."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScheduleCalendar
                date={date}
                view={view}
                days={range.days}
                appointments={appointments}
                blocks={blocks}
                professionalId={professionalId}
                status={status}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Compromissos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{appointments.length}</p>
                <p className="text-xs text-muted-foreground">no período filtrado</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Confirmados / em fluxo</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{confirmedCount}</p>
                <p className="text-xs text-muted-foreground">paciente confirmado, chegada ou atendimento</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Finalizados</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{finishedCount}</p>
                <p className="text-xs text-muted-foreground">atendimento concluído ou financeiro liberado</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Bloqueios</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{blocks.length}</p>
                <p className="text-xs text-muted-foreground">intervalos indisponíveis</p>
              </CardContent>
            </Card>
          </div>

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

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_430px]">
            {view === "day" ? (
              <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Eventos do dia</CardTitle>
                    <CardDescription>Fluxo de confirmação, chegada, atendimento e cobrança.</CardDescription>
                  </div>
                  <Badge>
                    {scheduleAccess.canManage || scheduleAccess.canOperateOwn
                      ? "Etapas liberadas"
                      : "Somente leitura"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <AppointmentsBoard
                  appointments={appointments}
                  blocks={blocks}
                  professionals={professionals}
                  canManage={scheduleAccess.canManage}
                  canUpdateStatus={scheduleAccess.canManage || scheduleAccess.canOperateOwn}
                  confirmationUrlBase={confirmationUrlBase}
                />
              </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Resumo do período</CardTitle>
                  <CardDescription>
                    Selecione um dia no calendário para abrir os detalhes, contatos e fluxo operacional.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    A visão {view === "week" ? "semanal" : "mensal"} mantém o calendário leve. Clique em um
                    compromisso ou dia para operar a consulta.
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="size-5 text-primary" />
                    Novo compromisso
                  </CardTitle>
                  <CardDescription>Agende com validação de conflito por profissional.</CardDescription>
                </CardHeader>
                <CardContent>
                  <AppointmentForm
                    professionals={professionals}
                    patients={patients}
                    services={services}
                    rooms={rooms}
                    defaultDate={date}
                    disabled={!scheduleAccess.canManage}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ClipboardCheck className="size-5 text-primary" />
                    Bloqueio de horário
                  </CardTitle>
                  <CardDescription>Reserve intervalos indisponíveis, férias, almoço ou rotinas administrativas.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScheduleBlockForm
                    professionals={professionals}
                    defaultDate={date}
                    disabled={!scheduleAccess.canManage}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <UserRound className="size-5 text-primary" />
                    Agenda do profissional
                  </CardTitle>
                  <CardDescription>Configure janelas, expediente e disponibilidade futura por link.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ProfessionalSettingsForm
                    professionals={professionals}
                    settings={settings}
                    disabled={!scheduleAccess.canManage}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
