"use client";

import { useMemo, useState } from "react";
import { Clock, MapPin, Pencil, Stethoscope, UserRound } from "lucide-react";
import {
  APPOINTMENT_STATUS_LABELS,
  SCHEDULE_BLOCK_TYPE_LABELS,
} from "@/config/schedule";
import { AppointmentDetailsModal } from "@/features/schedule/components/appointment-details-modal";
import { formatTimeBr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type {
  AppointmentSummary,
  AppointmentWorkflowEvent,
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

function professionalName(professionals: ScheduleProfessional[], professionalId: string) {
  return (
    professionals.find((professional) => professional.id === professionalId)?.profile?.full_name ??
    "Profissional não localizado"
  );
}

function statusBadgeClass(status: AppointmentSummary["status"]) {
  return cn(
    status === "scheduled" && "bg-muted text-muted-foreground",
    status === "confirmed" && "bg-primary/10 text-primary",
    status === "checked_in" && "bg-emerald-500/10 text-emerald-700",
    status === "in_triage" && "bg-cyan-500/10 text-cyan-700",
    status === "in_progress" && "bg-blue-500/10 text-blue-700",
    status === "completed" && "bg-slate-500/10 text-slate-700",
    status === "billing_pending" && "bg-amber-500/10 text-amber-700",
    status === "billed" && "bg-emerald-600/10 text-emerald-700",
    ["cancelled", "no_show", "rescheduled"].includes(status) && "bg-destructive/10 text-destructive",
  );
}

export function AppointmentsBoard({
  appointments,
  blocks,
  professionals,
  patients,
  services,
  rooms,
  professionalProfiles,
  scheduleSettings,
  workflowEvents,
  canManage,
  canDelete,
  canUpdateStatus,
  confirmationUrlBase,
}: {
  appointments: AppointmentSummary[];
  blocks: ScheduleBlock[];
  professionals: ScheduleProfessional[];
  patients: PatientSummary[];
  services: ClinicService[];
  rooms: ClinicRoom[];
  professionalProfiles: ProfessionalOperationalProfile[];
  scheduleSettings: ScheduleSettings[];
  workflowEvents: AppointmentWorkflowEvent[];
  canManage: boolean;
  canDelete: boolean;
  canUpdateStatus: boolean;
  confirmationUrlBase: string;
}) {
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const selectedAppointment =
    appointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null;
  const workflowEventsByAppointment = useMemo(() => {
    const eventsByAppointment = new Map<string, AppointmentWorkflowEvent[]>();

    for (const event of workflowEvents) {
      const current = eventsByAppointment.get(event.appointment_id) ?? [];
      current.push(event);
      eventsByAppointment.set(event.appointment_id, current);
    }

    return eventsByAppointment;
  }, [workflowEvents]);

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        {appointments.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 px-6 py-10 text-center">
            <CalendarEmptyState />
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <div className="hidden grid-cols-[110px_minmax(220px,1.3fr)_minmax(190px,1fr)_minmax(170px,0.8fr)_150px_110px] gap-4 border-b bg-muted/60 px-4 py-2.5 text-xs font-medium uppercase text-muted-foreground xl:grid">
              <span>Horário</span>
              <span>Paciente</span>
              <span>Profissional</span>
              <span>Serviço / local</span>
              <span>Status</span>
              <span className="text-right">Ações</span>
            </div>
            <div className="divide-y">
              {appointments.map((appointment) => (
                <article
                  key={appointment.id}
                  className="grid min-w-0 gap-4 bg-card px-4 py-4 transition-colors hover:bg-muted/20 xl:grid-cols-[110px_minmax(220px,1.3fr)_minmax(190px,1fr)_minmax(170px,0.8fr)_150px_110px] xl:items-center"
                >
                  <div>
                    <p className="flex items-center gap-2 text-lg font-semibold">
                      <Clock className="size-4 text-primary" />
                      {formatTimeBr(appointment.starts_at)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      até {formatTimeBr(appointment.ends_at)}
                    </p>
                  </div>

                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <UserRound className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {appointment.patient?.social_name ||
                          appointment.patient?.full_name ||
                          "Paciente não localizado"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {appointment.patient?.phone ?? "Telefone não informado"}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {appointment.professional?.profile?.full_name ?? "Não informado"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {appointment.channel}
                    </p>
                  </div>

                  <div className="grid min-w-0 gap-1">
                    <p className="flex min-w-0 items-center gap-2 truncate text-sm">
                      <Stethoscope className="size-3.5 shrink-0 text-primary" />
                      <span className="truncate">
                        {appointment.service?.name ?? appointment.appointment_type}
                      </span>
                    </p>
                    <p className="flex min-w-0 items-center gap-2 truncate text-xs text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      <span className="truncate">{appointment.room?.name ?? "Local a definir"}</span>
                    </p>
                  </div>

                  <div>
                    <Badge className={statusBadgeClass(appointment.status)}>
                      {APPOINTMENT_STATUS_LABELS[appointment.status]}
                    </Badge>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedAppointmentId(appointment.id)}
                    >
                      <Pencil />
                      Detalhes
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {selectedAppointment ? (
        <AppointmentDetailsModal
          key={selectedAppointment.id}
          appointment={selectedAppointment}
          workflowEvents={workflowEventsByAppointment.get(selectedAppointment.id) ?? []}
          professionals={professionals}
          patients={patients}
          services={services}
          rooms={rooms}
          professionalProfiles={professionalProfiles}
          scheduleSettings={scheduleSettings}
          canManage={canManage}
          canDelete={canDelete}
          canUpdateStatus={canUpdateStatus}
          confirmationUrl={`${confirmationUrlBase}/${selectedAppointment.confirmation_token}`}
          controlledOpen
          onControlledOpenChange={(open) => {
            if (!open) setSelectedAppointmentId(null);
          }}
          showTrigger={false}
        />
      ) : null}

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bloqueios do dia</h2>
          <Badge>{blocks.length}</Badge>
        </div>
        {blocks.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
            Nenhum bloqueio cadastrado para os filtros atuais.
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {blocks.map((block) => (
              <div key={block.id} className="rounded-md border bg-card p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {formatTimeBr(block.starts_at)} até {formatTimeBr(block.ends_at)}
                    </p>
                    <p className="mt-1 truncate text-muted-foreground">
                      {professionalName(professionals, block.professional_member_id)}
                    </p>
                  </div>
                  <Badge>{SCHEDULE_BLOCK_TYPE_LABELS[block.block_type]}</Badge>
                </div>
                {block.reason ? <p className="mt-3 text-muted-foreground">{block.reason}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CalendarEmptyState() {
  return (
    <div className="mx-auto grid max-w-sm justify-items-center gap-2">
      <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Clock className="size-5" />
      </div>
      <p className="font-medium">Nenhum compromisso neste período</p>
      <p className="text-sm leading-6 text-muted-foreground">
        Ajuste os filtros ou utilize “Novo compromisso” para iniciar a agenda.
      </p>
    </div>
  );
}
