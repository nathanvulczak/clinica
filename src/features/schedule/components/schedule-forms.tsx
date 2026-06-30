"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Ban, CalendarPlus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  APPOINTMENT_CHANNELS,
  APPOINTMENT_DURATIONS,
  SCHEDULE_BLOCK_TYPE_LABELS,
  SCHEDULE_BLOCK_TYPES,
} from "@/config/schedule";
import {
  createAppointmentAction,
  createScheduleBlockAction,
  deleteScheduleBlockAction,
  upsertProfessionalScheduleSettingsAction,
} from "@/features/schedule/actions";
import type {
  ClinicRoom,
  ClinicService,
  PatientSummary,
  ProfessionalOperationalProfile,
  ScheduleBlock,
  ScheduleProfessional,
  ScheduleSettings,
} from "@/types/domain";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const weekdays = [
  { value: "1", label: "Seg" },
  { value: "2", label: "Ter" },
  { value: "3", label: "Qua" },
  { value: "4", label: "Qui" },
  { value: "5", label: "Sex" },
  { value: "6", label: "Sáb" },
  { value: "0", label: "Dom" },
];

function useScheduleToast(state: { success?: string; error?: string }, successDescription: string) {
  const { toast } = useToast();

  useEffect(() => {
    if (state.success) {
      toast({ title: state.success, description: successDescription });
    }

    if (state.error) {
      toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
    }
  }, [state.error, state.success, successDescription, toast]);
}

function dateTimeInputParts(value?: string) {
  if (!value) {
    return null;
  }

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

export function AppointmentForm({
  professionals,
  patients,
  services,
  rooms,
  professionalProfiles,
  scheduleSettings,
  defaultDate,
  defaultStartTime = "08:00",
  defaultDuration,
  defaultProfessionalId,
  disabled,
  onCompleted,
}: {
  professionals: ScheduleProfessional[];
  patients: PatientSummary[];
  services: ClinicService[];
  rooms: ClinicRoom[];
  professionalProfiles: ProfessionalOperationalProfile[];
  scheduleSettings: ScheduleSettings[];
  defaultDate: string;
  defaultStartTime?: string;
  defaultDuration?: number;
  defaultProfessionalId?: string;
  disabled?: boolean;
  onCompleted?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createAppointmentAction, {});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const initialProfessionalId =
    professionals.find((item) => item.id === defaultProfessionalId)?.id ?? professionals[0]?.id ?? "";
  const initialProfessionalProfile = professionalProfiles.find(
    (item) => item.professional_member_id === initialProfessionalId,
  );
  const initialScheduleSettings = scheduleSettings.find(
    (item) => item.professional_member_id === initialProfessionalId,
  );
  const initialService = services.find(
    (item) => item.id === initialProfessionalProfile?.default_service_id,
  );
  const initialRoom = rooms.find(
    (item) => item.id === initialProfessionalProfile?.default_room_id,
  );
  const [professionalId, setProfessionalId] = useState(initialProfessionalId);
  const [serviceId, setServiceId] = useState(
    initialService?.id ?? "none",
  );
  const [roomId, setRoomId] = useState(initialRoom?.id ?? "none");
  const [duration, setDuration] = useState(
    defaultDuration ?? initialService?.duration_minutes ?? initialScheduleSettings?.slot_minutes ?? 30,
  );

  useScheduleToast(state, "O compromisso entrou no fluxo da agenda e foi registrado na auditoria.");

  useEffect(() => {
    if (state.success) {
      onCompleted?.();
    }
  }, [onCompleted, state.success]);

  const canSubmit = !disabled && professionals.length > 0 && patients.length > 0;

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      {patients.length === 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900">
          <p className="font-medium">Cadastre o paciente antes de criar o compromisso.</p>
          <p className="mt-1">A Agenda utiliza somente pacientes já validados na clínica.</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/cadastros?section=patients">Abrir cadastro de pacientes</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="patient_id">Paciente</Label>
          <Select
            id="patient_id"
            name="patient_id"
            defaultValue={patients[0]?.id}
            disabled={!canSubmit || pending}
            required
          >
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.social_name || patient.full_name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="professional_member_id">Profissional</Label>
        <Select
          id="professional_member_id"
          name="professional_member_id"
          value={professionalId}
          disabled={!canSubmit || pending}
          onChange={(event) => {
            const nextProfessionalId = event.target.value;
            const profile = professionalProfiles.find(
              (item) => item.professional_member_id === nextProfessionalId,
            );
            const service = services.find((item) => item.id === profile?.default_service_id);
            const room = rooms.find((item) => item.id === profile?.default_room_id);
            const settings = scheduleSettings.find(
              (item) => item.professional_member_id === nextProfessionalId,
            );
            const nextServiceId = service?.id ?? "none";

            setProfessionalId(nextProfessionalId);
            setServiceId(nextServiceId);
            setRoomId(room?.id ?? "none");
            setDuration(service?.duration_minutes ?? settings?.slot_minutes ?? 30);
          }}
          required
        >
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>
              {professional.profile?.full_name ?? "Profissional sem nome"}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="service_id">Serviço</Label>
          <Select
            id="service_id"
            name="service_id"
            value={serviceId}
            disabled={!canSubmit || pending}
            onChange={(event) => {
              const nextServiceId = event.target.value;
              setServiceId(nextServiceId);
              const service = services.find((item) => item.id === nextServiceId);

              if (service) {
                setDuration(service.duration_minutes);
              }
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
          <Label htmlFor="room_id">Consultório</Label>
          <Select
            id="room_id"
            name="room_id"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            disabled={!canSubmit || pending}
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

      <div className="grid gap-3 sm:grid-cols-[1fr_140px_140px]">
        <div className="grid gap-2">
          <Label htmlFor="appointment_date">Data</Label>
          <Input
            id="appointment_date"
            name="appointment_date"
            type="date"
            defaultValue={defaultDate}
            disabled={!canSubmit || pending}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="start_time">Início</Label>
          <Input id="start_time" name="start_time" type="time" defaultValue={defaultStartTime} disabled={!canSubmit || pending} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="duration_minutes">Duração</Label>
          <Input
            id="duration_minutes"
            name="duration_minutes"
            type="number"
            min={5}
            max={720}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            disabled={!canSubmit || pending}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="appointment_type">Tipo</Label>
          <Input
            id="appointment_type"
            name="appointment_type"
            defaultValue="Consulta"
            disabled={!canSubmit || pending}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="channel">Canal</Label>
          <Select id="channel" name="channel" defaultValue="Presencial" disabled={!canSubmit || pending}>
            {APPOINTMENT_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Observações</Label>
        <textarea
          id="notes"
          name="notes"
          className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={!canSubmit || pending}
        />
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button
        type="button"
        disabled={!canSubmit || pending}
        onClick={() => setConfirmOpen(true)}
      >
        <CalendarPlus />
        {pending ? "Agendando..." : "Agendar consulta"}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar novo compromisso?"
        description="O horário será validado contra consultas, bloqueios e ocupação do consultório antes da gravação."
        confirmLabel="Confirmar agendamento"
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

export function ScheduleBlockForm({
  professionals,
  defaultDate,
  block,
  fixedProfessionalId,
  disabled,
  onCompleted,
}: {
  professionals: ScheduleProfessional[];
  defaultDate: string;
  block?: ScheduleBlock;
  fixedProfessionalId?: string;
  disabled?: boolean;
  onCompleted?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createScheduleBlockAction, {});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canSubmit = !disabled && professionals.length > 0;
  const start = dateTimeInputParts(block?.starts_at);
  const end = dateTimeInputParts(block?.ends_at);
  const fieldId = block?.id ?? fixedProfessionalId ?? "new";

  useScheduleToast(state, "O bloqueio impede agendamentos no intervalo informado.");

  useEffect(() => {
    if (state.success) {
      onCompleted?.();
    }
  }, [onCompleted, state.success]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      {block?.id ? <input type="hidden" name="id" value={block.id} /> : null}
      {fixedProfessionalId ? (
        <input type="hidden" name="professional_member_id" value={fixedProfessionalId} />
      ) : (
        <div className="grid gap-2">
          <Label htmlFor={`block-professional-${fieldId}`}>Profissional</Label>
          <Select
            id={`block-professional-${fieldId}`}
            name="professional_member_id"
            defaultValue={block?.professional_member_id}
            disabled={!canSubmit || pending}
            required
          >
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.profile?.full_name ?? "Profissional sem nome"}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={`block-date-${fieldId}`}>Data</Label>
          <Input
            id={`block-date-${fieldId}`}
            name="block_date"
            type="date"
            defaultValue={start?.date ?? defaultDate}
            disabled={!canSubmit || pending}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`block-start-${fieldId}`}>Início</Label>
          <Input
            id={`block-start-${fieldId}`}
            name="start_time"
            type="time"
            defaultValue={start?.time ?? "12:00"}
            disabled={!canSubmit || pending}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`block-end-${fieldId}`}>Fim</Label>
          <Input
            id={`block-end-${fieldId}`}
            name="end_time"
            type="time"
            defaultValue={end?.time ?? "13:00"}
            disabled={!canSubmit || pending}
            required
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`block-type-${fieldId}`}>Tipo de bloqueio</Label>
        <Select
          id={`block-type-${fieldId}`}
          name="block_type"
          defaultValue={block?.block_type ?? "unavailable"}
          disabled={!canSubmit || pending}
        >
          {SCHEDULE_BLOCK_TYPES.map((type) => (
            <option key={type} value={type}>
              {SCHEDULE_BLOCK_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`block-reason-${fieldId}`}>Motivo</Label>
        <Input
          id={`block-reason-${fieldId}`}
          name="reason"
          defaultValue={block?.reason ?? ""}
          disabled={!canSubmit || pending}
        />
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button
        type="button"
        variant="outline"
        disabled={!canSubmit || pending}
        onClick={() => setConfirmOpen(true)}
      >
        <Ban />
        {pending ? "Salvando..." : block ? "Salvar bloqueio" : "Bloquear horário"}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={block ? "Salvar alterações do bloqueio?" : "Criar bloqueio de horário?"}
        description="A disponibilidade do profissional será atualizada e a ação ficará registrada na auditoria."
        confirmLabel={block ? "Salvar alterações" : "Criar bloqueio"}
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

export function DeleteScheduleBlockButton({ blockId, disabled }: { blockId: string; disabled?: boolean }) {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteScheduleBlockAction, {});

  useEffect(() => {
    if (state.success) {
      toast({ title: state.success, description: "A remoção foi registrada na auditoria." });
      setOpen(false);
    }

    if (state.error) {
      toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
    }
  }, [state.error, state.success, toast]);

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="id" value={blockId} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Excluir bloqueio"
          disabled={disabled || pending}
          onClick={() => setOpen(true)}
        >
          <Trash2 />
        </Button>
      </form>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Excluir bloqueio?"
        description="O horário voltará a ficar disponível. A alteração permanecerá registrada na auditoria."
        confirmLabel="Excluir bloqueio"
        destructive
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </>
  );
}

export function ProfessionalSettingsForm({
  professionals,
  settings,
  fixedProfessionalId,
  disabled,
  onCompleted,
}: {
  professionals: ScheduleProfessional[];
  settings: ScheduleSettings[];
  fixedProfessionalId?: string;
  disabled?: boolean;
  onCompleted?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(upsertProfessionalScheduleSettingsAction, {});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [professionalId, setProfessionalId] = useState(
    fixedProfessionalId ?? professionals[0]?.id ?? "",
  );
  const selectedSettings = settings.find((item) => item.professional_member_id === professionalId);
  const workingHours = selectedSettings?.working_hours as { days?: string[]; start?: string; end?: string } | undefined;
  const selectedDays = useMemo(() => new Set(workingHours?.days ?? ["1", "2", "3", "4", "5"]), [workingHours?.days]);
  const canSubmit = !disabled && professionals.length > 0;

  useScheduleToast(state, "As próximas agendas usam esta configuração como referência operacional.");

  useEffect(() => {
    if (state.success) {
      onCompleted?.();
    }
  }, [onCompleted, state.success]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      {fixedProfessionalId ? (
        <input type="hidden" name="professional_member_id" value={fixedProfessionalId} />
      ) : (
      <div className="grid gap-2">
        <Label htmlFor="settings_professional_member_id">Profissional</Label>
        <Select
          id="settings_professional_member_id"
          name="professional_member_id"
          value={professionalId}
          disabled={!canSubmit || pending}
          onChange={(event) => setProfessionalId(event.target.value)}
          required
        >
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>
              {professional.profile?.full_name ?? "Profissional sem nome"}
            </option>
          ))}
        </Select>
      </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`slot-minutes-${professionalId}`}>Janela padrão</Label>
          <Select
            key={`${professionalId}-slot`}
            id={`slot-minutes-${professionalId}`}
            name="slot_minutes"
            defaultValue={String(selectedSettings?.slot_minutes ?? 30)}
            disabled={!canSubmit || pending}
          >
            {APPOINTMENT_DURATIONS.map((duration) => (
              <option key={duration} value={duration}>
                {duration} min
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`buffer-minutes-${professionalId}`}>Intervalo entre atendimentos</Label>
          <Input
            key={`${professionalId}-buffer`}
            id={`buffer-minutes-${professionalId}`}
            name="buffer_minutes"
            type="number"
            min={0}
            max={120}
            defaultValue={selectedSettings?.buffer_minutes ?? 0}
            disabled={!canSubmit || pending}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`workday-start-${professionalId}`}>Início do expediente</Label>
          <Input
            key={`${professionalId}-start`}
            id={`workday-start-${professionalId}`}
            name="workday_start"
            type="time"
            defaultValue={workingHours?.start ?? "08:00"}
            disabled={!canSubmit || pending}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`workday-end-${professionalId}`}>Fim do expediente</Label>
          <Input
            key={`${professionalId}-end`}
            id={`workday-end-${professionalId}`}
            name="workday_end"
            type="time"
            defaultValue={workingHours?.end ?? "18:00"}
            disabled={!canSubmit || pending}
            required
          />
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Dias de atendimento</legend>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {weekdays.map((day) => (
            <label
              key={`${professionalId}-${day.value}`}
              className="flex min-h-10 items-center justify-center rounded-md border bg-background px-2 text-sm"
            >
              <input
                type="checkbox"
                name="weekdays"
                value={day.value}
                defaultChecked={selectedDays.has(day.value)}
                disabled={!canSubmit || pending}
                className="sr-only peer"
              />
              <span className="peer-checked:font-semibold peer-checked:text-primary">{day.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor={`default-location-${professionalId}`}>Local padrão</Label>
        <Input
          key={`${professionalId}-location`}
          id={`default-location-${professionalId}`}
          name="default_location"
          defaultValue={selectedSettings?.default_location ?? ""}
          disabled={!canSubmit || pending}
        />
      </div>

      <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm">
        <input
          key={`${professionalId}-online`}
          type="checkbox"
          name="online_booking_enabled"
          defaultChecked={selectedSettings?.online_booking_enabled ?? false}
          disabled={!canSubmit || pending}
        />
        Permitir confirmação/autoagendamento por link no futuro
      </label>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="button" disabled={!canSubmit || pending} onClick={() => setConfirmOpen(true)}>
        {pending ? <Save /> : <SlidersHorizontal />}
        {pending ? "Salvando..." : "Salvar configuração"}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Salvar expediente e preferências?"
        description="A configuração será aplicada à agenda do profissional e ficará registrada na auditoria."
        confirmLabel="Salvar configuração"
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}
