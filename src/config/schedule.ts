import type { AppointmentStatus, ScheduleBlockType } from "@/types/domain";

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "checked_in",
  "in_triage",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
  "billing_pending",
  "billed",
] as const satisfies readonly AppointmentStatus[];

export const OPERATIONAL_APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "checked_in",
  "in_triage",
  "in_progress",
] as const satisfies readonly AppointmentStatus[];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado pelo paciente",
  checked_in: "Paciente chegou",
  in_triage: "Em pré-consulta",
  in_progress: "Em atendimento",
  completed: "Atendimento finalizado",
  cancelled: "Cancelado",
  no_show: "Faltou",
  rescheduled: "Remarcado",
  billing_pending: "Liberado para cobrança",
  billed: "Cobrado",
};

export const APPOINTMENT_STATUS_HELP: Record<AppointmentStatus, string> = {
  scheduled: "Consulta criada e aguardando confirmação.",
  confirmed: "Paciente confirmou dados, profissional e horário.",
  checked_in: "Recepção registrou chegada no dia da consulta.",
  in_triage: "Fluxo liberado para pré-consulta ou enfermagem.",
  in_progress: "Prontuário liberado para o profissional iniciar o atendimento.",
  completed: "Atendimento concluído e orientações registradas.",
  cancelled: "Consulta cancelada com motivo registrado.",
  no_show: "Paciente não compareceu.",
  rescheduled: "Consulta marcada para outro horário.",
  billing_pending: "Atendimento liberado para cobrança.",
  billed: "Cobrança concluída no financeiro.",
};

export const SCHEDULE_BLOCK_TYPES = [
  "unavailable",
  "lunch",
  "vacation",
  "administrative",
  "other",
] as const satisfies readonly ScheduleBlockType[];

export const SCHEDULE_BLOCK_TYPE_LABELS: Record<ScheduleBlockType, string> = {
  unavailable: "Indisponível",
  lunch: "Intervalo",
  vacation: "Férias",
  administrative: "Administrativo",
  other: "Outro",
};

export const APPOINTMENT_DURATIONS = [15, 20, 30, 45, 60, 90, 120];
export const APPOINTMENT_CHANNELS = ["Presencial", "Teleconsulta", "Retorno", "Procedimento"];
