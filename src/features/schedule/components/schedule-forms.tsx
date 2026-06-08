"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Ban, CalendarPlus, Save, SlidersHorizontal } from "lucide-react";
import {
  APPOINTMENT_CHANNELS,
  APPOINTMENT_DURATIONS,
  SCHEDULE_BLOCK_TYPE_LABELS,
  SCHEDULE_BLOCK_TYPES,
} from "@/config/schedule";
import {
  createAppointmentAction,
  createScheduleBlockAction,
  upsertProfessionalScheduleSettingsAction,
} from "@/features/schedule/actions";
import { formatCpf, formatPhone, normalizeEmail } from "@/lib/formatters";
import type { PatientSummary, ScheduleProfessional, ScheduleSettings } from "@/types/domain";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
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

export function AppointmentForm({
  professionals,
  patients,
  defaultDate,
  disabled,
}: {
  professionals: ScheduleProfessional[];
  patients: PatientSummary[];
  defaultDate: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createAppointmentAction, {});
  const [patientMode, setPatientMode] = useState(patients.length > 0 ? patients[0].id : "new");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useScheduleToast(state, "O compromisso entrou no fluxo da agenda e foi registrado na auditoria.");

  const canSubmit = !disabled && professionals.length > 0;

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="patient_id">Paciente</Label>
        <Select
          id="patient_id"
          name="patient_id"
          value={patientMode}
          disabled={!canSubmit || pending}
          onChange={(event) => setPatientMode(event.target.value)}
        >
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.full_name}
            </option>
          ))}
          <option value="new">Novo paciente</option>
        </Select>
      </div>

      {patientMode === "new" ? (
        <div className="grid gap-3 rounded-md border bg-background p-3">
          <div className="grid gap-2">
            <Label htmlFor="patient_full_name">Nome completo do paciente</Label>
            <Input id="patient_full_name" name="patient_full_name" disabled={!canSubmit || pending} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="patient_cpf">CPF</Label>
              <Input
                id="patient_cpf"
                name="patient_cpf"
                inputMode="numeric"
                value={cpf}
                onChange={(event) => setCpf(formatCpf(event.target.value))}
                disabled={!canSubmit || pending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patient_phone">Telefone</Label>
              <Input
                id="patient_phone"
                name="patient_phone"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(formatPhone(event.target.value))}
                disabled={!canSubmit || pending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patient_email">E-mail</Label>
              <Input
                id="patient_email"
                name="patient_email"
                type="email"
                value={email}
                onChange={(event) => setEmail(normalizeEmail(event.target.value))}
                disabled={!canSubmit || pending}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="professional_member_id">Profissional</Label>
        <Select id="professional_member_id" name="professional_member_id" disabled={!canSubmit || pending} required>
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>
              {professional.profile?.full_name ?? "Profissional sem nome"}
            </option>
          ))}
        </Select>
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
          <Input id="start_time" name="start_time" type="time" defaultValue="08:00" disabled={!canSubmit || pending} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="duration_minutes">Duração</Label>
          <Select id="duration_minutes" name="duration_minutes" defaultValue="30" disabled={!canSubmit || pending}>
            {APPOINTMENT_DURATIONS.map((duration) => (
              <option key={duration} value={duration}>
                {duration} min
              </option>
            ))}
          </Select>
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
      <Button disabled={!canSubmit || pending}>
        <CalendarPlus />
        {pending ? "Agendando..." : "Agendar consulta"}
      </Button>
    </form>
  );
}

export function ScheduleBlockForm({
  professionals,
  defaultDate,
  disabled,
}: {
  professionals: ScheduleProfessional[];
  defaultDate: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createScheduleBlockAction, {});
  const canSubmit = !disabled && professionals.length > 0;

  useScheduleToast(state, "O bloqueio impede agendamentos no intervalo informado.");

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="block_professional_member_id">Profissional</Label>
        <Select
          id="block_professional_member_id"
          name="professional_member_id"
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="block_date">Data</Label>
          <Input id="block_date" name="block_date" type="date" defaultValue={defaultDate} disabled={!canSubmit || pending} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="block_start_time">Início</Label>
          <Input id="block_start_time" name="start_time" type="time" defaultValue="12:00" disabled={!canSubmit || pending} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="block_end_time">Fim</Label>
          <Input id="block_end_time" name="end_time" type="time" defaultValue="13:00" disabled={!canSubmit || pending} required />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="block_type">Tipo de bloqueio</Label>
        <Select id="block_type" name="block_type" defaultValue="unavailable" disabled={!canSubmit || pending}>
          {SCHEDULE_BLOCK_TYPES.map((type) => (
            <option key={type} value={type}>
              {SCHEDULE_BLOCK_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="reason">Motivo</Label>
        <Input id="reason" name="reason" disabled={!canSubmit || pending} />
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button variant="outline" disabled={!canSubmit || pending}>
        <Ban />
        {pending ? "Bloqueando..." : "Bloquear horário"}
      </Button>
    </form>
  );
}

export function ProfessionalSettingsForm({
  professionals,
  settings,
  disabled,
}: {
  professionals: ScheduleProfessional[];
  settings: ScheduleSettings[];
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(upsertProfessionalScheduleSettingsAction, {});
  const [professionalId, setProfessionalId] = useState(professionals[0]?.id ?? "");
  const selectedSettings = settings.find((item) => item.professional_member_id === professionalId);
  const workingHours = selectedSettings?.working_hours as { days?: string[]; start?: string; end?: string } | undefined;
  const selectedDays = useMemo(() => new Set(workingHours?.days ?? ["1", "2", "3", "4", "5"]), [workingHours?.days]);
  const canSubmit = !disabled && professionals.length > 0;

  useScheduleToast(state, "As próximas agendas usam esta configuração como referência operacional.");

  return (
    <form action={formAction} className="grid gap-4">
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="slot_minutes">Janela padrão</Label>
          <Select
            key={`${professionalId}-slot`}
            id="slot_minutes"
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
          <Label htmlFor="buffer_minutes">Intervalo entre atendimentos</Label>
          <Input
            key={`${professionalId}-buffer`}
            id="buffer_minutes"
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
          <Label htmlFor="workday_start">Início do expediente</Label>
          <Input
            key={`${professionalId}-start`}
            id="workday_start"
            name="workday_start"
            type="time"
            defaultValue={workingHours?.start ?? "08:00"}
            disabled={!canSubmit || pending}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="workday_end">Fim do expediente</Label>
          <Input
            key={`${professionalId}-end`}
            id="workday_end"
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
        <Label htmlFor="default_location">Local padrão</Label>
        <Input
          key={`${professionalId}-location`}
          id="default_location"
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
      <Button disabled={!canSubmit || pending}>
        {pending ? <Save /> : <SlidersHorizontal />}
        {pending ? "Salvando..." : "Salvar configuração"}
      </Button>
    </form>
  );
}
