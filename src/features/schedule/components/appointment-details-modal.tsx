"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Clock,
  History,
  Mail,
  MessageCircle,
  Pencil,
  RefreshCw,
  Stethoscope,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  APPOINTMENT_CHANNELS,
  APPOINTMENT_STATUS_HELP,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_TRANSITIONS,
} from "@/config/schedule";
import {
  deleteAppointmentAction,
  rescheduleAppointmentAction,
  sendAppointmentNotificationAction,
  updateAppointmentAction,
  updateAppointmentStatusAction,
} from "@/features/schedule/actions";
import { formatDateTimeBr, formatTimeBr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type {
  AppointmentSummary,
  AppointmentWorkflowEvent,
  ClinicRoom,
  ClinicService,
  PatientSummary,
  ProfessionalOperationalProfile,
  ScheduleProfessional,
  ScheduleSettings,
} from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyableText } from "@/components/ui/copy-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

type DetailView = "summary" | "edit" | "reschedule";

function dateTimeInputParts(value: string) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  }).formatToParts(new Date(value));
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    date: `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`,
    time: `${byType.get("hour")}:${byType.get("minute")}`,
  };
}

function appointmentDuration(appointment: AppointmentSummary) {
  return Math.max(
    5,
    Math.round(
      (new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime()) / 60_000,
    ),
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

export function AppointmentDetailsModal({
  appointment,
  workflowEvents,
  professionals,
  patients,
  services,
  rooms,
  professionalProfiles,
  scheduleSettings,
  canManage,
  canDelete,
  canUpdateStatus,
  confirmationUrl,
  controlledOpen,
  onControlledOpenChange,
  showTrigger = true,
}: {
  appointment: AppointmentSummary;
  workflowEvents: AppointmentWorkflowEvent[];
  professionals: ScheduleProfessional[];
  patients: PatientSummary[];
  services: ClinicService[];
  rooms: ClinicRoom[];
  professionalProfiles: ProfessionalOperationalProfile[];
  scheduleSettings: ScheduleSettings[];
  canManage: boolean;
  canDelete: boolean;
  canUpdateStatus: boolean;
  confirmationUrl: string;
  controlledOpen?: boolean;
  onControlledOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [view, setView] = useState<DetailView>("summary");
  const open = controlledOpen ?? internalOpen;
  const setOpen = onControlledOpenChange ?? setInternalOpen;

  return (
    <>
      {showTrigger ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil />
          Detalhes
        </Button>
      ) : null}
      {open ? (
        <Modal
          open
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) {
              setView("summary");
            }
          }}
          title={appointment.patient?.social_name || appointment.patient?.full_name || "Compromisso"}
          description={`${formatDateTimeBr(appointment.starts_at)} • ${
            appointment.professional?.profile?.full_name ?? "Profissional"
          }`}
          className="max-w-5xl"
        >
          <div className="grid gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-md border bg-background p-1">
              <Button
                type="button"
                size="sm"
                variant={view === "summary" ? "secondary" : "ghost"}
                onClick={() => setView("summary")}
              >
                <Stethoscope />
                Resumo
              </Button>
              {canManage ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant={view === "edit" ? "secondary" : "ghost"}
                    onClick={() => setView("edit")}
                    disabled={!["scheduled", "confirmed", "checked_in"].includes(appointment.status)}
                  >
                    <Pencil />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={view === "reschedule" ? "secondary" : "ghost"}
                    onClick={() => setView("reschedule")}
                    disabled={!["scheduled", "confirmed", "checked_in"].includes(appointment.status)}
                  >
                    <CalendarClock />
                    Remarcar
                  </Button>
                </>
              ) : null}
            </div>
            <Badge className={statusBadgeClass(appointment.status)}>
              {APPOINTMENT_STATUS_LABELS[appointment.status]}
            </Badge>
          </div>

          {view === "summary" ? (
            <AppointmentSummaryView
              appointment={appointment}
              workflowEvents={workflowEvents}
              canManage={canManage}
              canDelete={canDelete}
              canUpdateStatus={canUpdateStatus}
              confirmationUrl={confirmationUrl}
              onDeleted={() => setOpen(false)}
            />
          ) : (
            <AppointmentOperationForm
              mode={view}
              appointment={appointment}
              professionals={professionals}
              patients={patients}
              services={services}
              rooms={rooms}
              professionalProfiles={professionalProfiles}
              scheduleSettings={scheduleSettings}
              onCompleted={() => {
                setView("summary");
                setOpen(false);
              }}
            />
          )}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function AppointmentSummaryView({
  appointment,
  workflowEvents,
  canManage,
  canDelete,
  canUpdateStatus,
  confirmationUrl,
  onDeleted,
}: {
  appointment: AppointmentSummary;
  workflowEvents: AppointmentWorkflowEvent[];
  canManage: boolean;
  canDelete: boolean;
  canUpdateStatus: boolean;
  confirmationUrl: string;
  onDeleted: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 gap-5">
        <div className="grid gap-3 rounded-md border bg-background p-4 md:grid-cols-2">
          <Detail icon={Clock} label="Horário">
            {formatTimeBr(appointment.starts_at)} até {formatTimeBr(appointment.ends_at)}
          </Detail>
          <Detail icon={UserRound} label="Profissional">
            {appointment.professional?.profile?.full_name ?? "Não informado"}
          </Detail>
          <Detail icon={Stethoscope} label="Serviço">
            {appointment.service?.name ?? appointment.appointment_type}
          </Detail>
          <Detail icon={CalendarClock} label="Consultório">
            {appointment.room?.name ?? "A definir"}
          </Detail>
          <Detail icon={MessageCircle} label="Telefone">
            {appointment.patient?.phone ? (
              <CopyableText value={appointment.patient.phone} label="Copiar telefone" />
            ) : (
              "Não informado"
            )}
          </Detail>
          <Detail icon={Mail} label="E-mail">
            {appointment.patient?.email ? (
              <CopyableText value={appointment.patient.email} label="Copiar e-mail" />
            ) : (
              "Não informado"
            )}
          </Detail>
        </div>

        <div className="rounded-md border bg-background p-4">
          <p className="text-xs font-medium uppercase text-muted-foreground">Observações</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {appointment.notes || APPOINTMENT_STATUS_HELP[appointment.status]}
          </p>
        </div>

        <AppointmentHistory events={workflowEvents} />
      </div>

      <aside className="grid content-start gap-4">
        {["checked_in", "in_triage", "in_progress"].includes(appointment.status) ? (
          <Button asChild>
            <Link href="/atendimentos">
              <Stethoscope />
              Abrir fluxo assistencial
            </Link>
          </Button>
        ) : null}
        <AppointmentStatusForm appointment={appointment} disabled={!canUpdateStatus} />
        <AppointmentNotifications
          appointment={appointment}
          confirmationUrl={confirmationUrl}
          disabled={!canManage}
        />
        <DeleteAppointmentButton
          appointment={appointment}
          disabled={!canDelete || !["scheduled", "confirmed"].includes(appointment.status)}
          onDeleted={onDeleted}
        />
      </aside>
    </div>
  );
}

function DeleteAppointmentButton({
  appointment,
  disabled,
  onDeleted,
}: {
  appointment: AppointmentSummary;
  disabled: boolean;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteAppointmentAction, {});
  const { toast } = useToast();

  useEffect(() => {
    if (state.success) {
      toast({
        title: state.success,
        description: "O registro permanece disponível na auditoria.",
      });
      setOpen(false);
      onDeleted();
    }
    if (state.error) {
      toast({ title: "Agendamento não excluído", description: state.error, variant: "destructive" });
    }
  }, [onDeleted, state.error, state.success, toast]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full text-destructive hover:text-destructive"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Trash2 />
        Excluir agendamento
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Excluir agendamento"
        description="Disponível apenas antes da chegada do paciente. O registro será ocultado, mas continuará auditável."
        className="max-w-lg"
      >
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="appointment_id" value={appointment.id} />
          <label className="grid gap-2 text-sm font-medium">
            Motivo da exclusão
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={500}
              className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Ex.: cadastro realizado por engano"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={pending}
            >
              <Trash2 />
              {pending ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-medium">{children}</p>
      </div>
    </div>
  );
}

function AppointmentHistory({ events }: { events: AppointmentWorkflowEvent[] }) {
  return (
    <section className="rounded-md border bg-background p-4">
      <div className="flex items-center gap-2">
        <History className="size-4 text-primary" />
        <h3 className="font-medium">Histórico operacional</h3>
      </div>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma mudança de etapa registrada.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {events.map((event) => (
            <div key={event.id} className="grid grid-cols-[10px_minmax(0,1fr)] gap-3">
              <span className="mt-1.5 size-2 rounded-full bg-primary" />
              <div className="min-w-0 border-b pb-3 last:border-0 last:pb-0">
                <p className="text-sm font-medium">{APPOINTMENT_STATUS_LABELS[event.to_status]}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTimeBr(event.created_at)}
                  {event.notes ? ` • ${event.notes}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AppointmentOperationForm({
  mode,
  appointment,
  professionals,
  patients,
  services,
  rooms,
  professionalProfiles,
  scheduleSettings,
  onCompleted,
}: {
  mode: Exclude<DetailView, "summary">;
  appointment: AppointmentSummary;
  professionals: ScheduleProfessional[];
  patients: PatientSummary[];
  services: ClinicService[];
  rooms: ClinicRoom[];
  professionalProfiles: ProfessionalOperationalProfile[];
  scheduleSettings: ScheduleSettings[];
  onCompleted: () => void;
}) {
  const action = mode === "edit" ? updateAppointmentAction : rescheduleAppointmentAction;
  const [state, formAction, pending] = useActionState(action, {});
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const initialParts = useMemo(() => dateTimeInputParts(appointment.starts_at), [appointment.starts_at]);
  const [professionalId, setProfessionalId] = useState(appointment.professional_member_id);
  const [serviceId, setServiceId] = useState(appointment.service_id ?? "none");
  const [roomId, setRoomId] = useState(appointment.room_id ?? "none");
  const [duration, setDuration] = useState(appointmentDuration(appointment));

  useEffect(() => {
    if (state.success) {
      toast({
        title: state.success,
        description: "A agenda e a auditoria foram atualizadas.",
      });
      onCompleted();
    }

    if (state.error) {
      toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
    }
  }, [onCompleted, state.error, state.success, toast]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      <input type="hidden" name="appointment_id" value={appointment.id} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${mode}-patient`}>Paciente</Label>
          <Select
            id={`${mode}-patient`}
            name="patient_id"
            defaultValue={appointment.patient_id}
            disabled={pending}
          >
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.social_name || patient.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${mode}-professional`}>Profissional</Label>
          <Select
            id={`${mode}-professional`}
            name="professional_member_id"
            value={professionalId}
            disabled={pending}
            onChange={(event) => {
              const nextProfessionalId = event.target.value;
              const profile = professionalProfiles.find(
                (item) => item.professional_member_id === nextProfessionalId,
              );
              const service = services.find((item) => item.id === profile?.default_service_id);
              const settings = scheduleSettings.find(
                (item) => item.professional_member_id === nextProfessionalId,
              );

              setProfessionalId(nextProfessionalId);
              setServiceId(service?.id ?? "none");
              setRoomId(profile?.default_room_id ?? "none");
              setDuration(service?.duration_minutes ?? settings?.slot_minutes ?? 30);
            }}
          >
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.profile?.full_name ?? "Profissional sem nome"}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${mode}-service`}>Serviço</Label>
          <Select
            id={`${mode}-service`}
            name="service_id"
            value={serviceId}
            disabled={pending}
            onChange={(event) => {
              const nextServiceId = event.target.value;
              setServiceId(nextServiceId);
              const service = services.find((item) => item.id === nextServiceId);
              if (service) setDuration(service.duration_minutes);
            }}
          >
            <option value="none">Sem serviço definido</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} • {service.duration_minutes} min
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${mode}-room`}>Consultório</Label>
          <Select
            id={`${mode}-room`}
            name="room_id"
            value={roomId}
            disabled={pending}
            onChange={(event) => setRoomId(event.target.value)}
          >
            <option value="none">Definir posteriormente</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(180px,1fr)_150px_150px]">
        <div className="grid gap-2">
          <Label htmlFor={`${mode}-date`}>Data</Label>
          <Input
            id={`${mode}-date`}
            name="appointment_date"
            type="date"
            defaultValue={initialParts.date}
            disabled={pending}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${mode}-time`}>Início</Label>
          <Input
            id={`${mode}-time`}
            name="start_time"
            type="time"
            defaultValue={initialParts.time}
            disabled={pending}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${mode}-duration`}>Duração</Label>
          <Input
            id={`${mode}-duration`}
            name="duration_minutes"
            type="number"
            min={5}
            max={720}
            value={duration}
            disabled={pending}
            onChange={(event) => setDuration(Number(event.target.value))}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${mode}-type`}>Tipo do compromisso</Label>
          <Input
            id={`${mode}-type`}
            name="appointment_type"
            defaultValue={appointment.appointment_type}
            disabled={pending}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${mode}-channel`}>Canal</Label>
          <Select
            id={`${mode}-channel`}
            name="channel"
            defaultValue={appointment.channel}
            disabled={pending}
          >
            {APPOINTMENT_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {mode === "reschedule" ? (
        <div className="grid gap-2">
          <Label htmlFor="reschedule-reason">Motivo da remarcação</Label>
          <Input
            id="reschedule-reason"
            name="reason"
            placeholder="Ex.: solicitação do paciente"
            disabled={pending}
            required
          />
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor={`${mode}-notes`}>Observações internas</Label>
        <textarea
          id={`${mode}-notes`}
          name="notes"
          defaultValue={appointment.notes ?? ""}
          className="min-h-24 rounded-md border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={pending}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
        >
          {pending ? <RefreshCw className="animate-spin" /> : <CheckCircle2 />}
          {pending ? "Salvando..." : mode === "edit" ? "Salvar alterações" : "Confirmar remarcação"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={mode === "edit" ? "Salvar alterações?" : "Remarcar esta consulta?"}
        description={
          mode === "edit"
            ? "As alterações serão validadas contra conflitos e registradas na auditoria."
            : "O compromisso atual será preservado como remarcado e um novo será criado."
        }
        confirmLabel={mode === "edit" ? "Salvar" : "Remarcar"}
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

function AppointmentStatusForm({
  appointment,
  disabled,
}: {
  appointment: AppointmentSummary;
  disabled?: boolean;
}) {
  const transitions = APPOINTMENT_STATUS_TRANSITIONS[appointment.status].filter(
    (status) => !["in_triage", "in_progress", "completed"].includes(status),
  );
  const [selectedStatus, setSelectedStatus] = useState(transitions[0] ?? appointment.status);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateAppointmentStatusAction, {});

  useEffect(() => {
    if (state.success) {
      toast({ title: state.success, description: "O fluxo operacional foi atualizado e auditado." });
    }
    if (state.error) {
      toast({ title: "Etapa não atualizada", description: state.error, variant: "destructive" });
    }
  }, [state.error, state.success, toast]);

  if (transitions.length === 0) {
    return (
      <div className="rounded-md border bg-background p-4">
        <p className="text-sm font-medium">Fluxo concluído</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Este compromisso não possui novas etapas operacionais.
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 rounded-md border bg-background p-4">
      <input type="hidden" name="appointment_id" value={appointment.id} />
      <div>
        <p className="text-sm font-medium">Próxima etapa</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          A Agenda controla a operação. Pré-consulta e atendimento avançam nos módulos clínicos.
        </p>
      </div>
      <Select
        name="status"
        value={selectedStatus}
        onChange={(event) =>
          setSelectedStatus(event.target.value as AppointmentSummary["status"])
        }
        disabled={disabled || pending}
      >
        {transitions.map((status) => (
          <option key={status} value={status}>
            {APPOINTMENT_STATUS_LABELS[status]}
          </option>
        ))}
      </Select>
      <textarea
        name="notes"
        className="min-h-20 rounded-md border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={disabled || pending}
        placeholder={
          ["cancelled", "no_show", "rescheduled"].includes(selectedStatus)
            ? "Motivo obrigatório"
            : "Observação da etapa"
        }
        required={["cancelled", "no_show", "rescheduled"].includes(selectedStatus)}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
      >
        {pending ? <RefreshCw className="animate-spin" /> : <CheckCircle2 />}
        {pending ? "Atualizando..." : "Aplicar etapa"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Atualizar etapa da consulta?"
        description="A alteração será registrada no histórico operacional e na auditoria."
        confirmLabel="Atualizar etapa"
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

function AppointmentNotifications({
  appointment,
  confirmationUrl,
  disabled,
}: {
  appointment: AppointmentSummary;
  confirmationUrl: string;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [emailState, emailAction, emailPending] = useActionState(
    sendAppointmentNotificationAction,
    {},
  );
  const [whatsappState, whatsappAction, whatsappPending] = useActionState(
    sendAppointmentNotificationAction,
    {},
  );

  useEffect(() => {
    const state = emailState.success || emailState.error ? emailState : whatsappState;
    if (state.success) {
      toast({ title: state.success, description: "O registro ficou disponível na auditoria." });
    }
    if (state.error) {
      toast({ title: "Notificação não enviada", description: state.error, variant: "destructive" });
    }
  }, [emailState, toast, whatsappState]);

  return (
    <div className="grid gap-3 rounded-md border bg-background p-4">
      <div className="flex items-center gap-2">
        <Bell className="size-4 text-primary" />
        <p className="text-sm font-medium">Confirmação do paciente</p>
      </div>
      <CopyableText
        value={confirmationUrl}
        label="Copiar link de confirmação"
        className="text-xs leading-5 text-muted-foreground"
      />
      <div className="grid grid-cols-2 gap-2">
        <form action={emailAction}>
          <input type="hidden" name="appointment_id" value={appointment.id} />
          <input type="hidden" name="channel" value="email" />
          <Button
            className="w-full"
            variant="outline"
            size="sm"
            disabled={disabled || emailPending}
          >
            <Mail />
            {emailPending ? "Enviando..." : "E-mail"}
          </Button>
        </form>
        <form action={whatsappAction}>
          <input type="hidden" name="appointment_id" value={appointment.id} />
          <input type="hidden" name="channel" value="whatsapp" />
          <Button
            className="w-full"
            variant="outline"
            size="sm"
            disabled={disabled || whatsappPending}
          >
            <MessageCircle />
            {whatsappPending ? "Preparando..." : "WhatsApp"}
          </Button>
        </form>
      </div>
    </div>
  );
}
