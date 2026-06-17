import type { ClinicalEncounterStatus } from "@/types/domain";

export const CLINICAL_ENCOUNTER_STATUS_LABELS: Record<ClinicalEncounterStatus, string> = {
  awaiting_preconsultation_decision: "Aguardando definicao",
  waiting_triage: "Aguardando pre-consulta",
  triage_in_progress: "Em pre-consulta",
  ready_for_consultation: "Liberado para atendimento",
  consultation_in_progress: "Consulta em andamento",
  consultation_completed: "Atendimento concluido",
  billing_pending: "Liberado para cobranca",
  billed: "Cobranca concluida",
  cancelled: "Cancelado",
};

export const NURSING_QUEUE_STATUSES: ClinicalEncounterStatus[] = [
  "waiting_triage",
  "triage_in_progress",
];

export const ACTIVE_CARE_STATUSES: ClinicalEncounterStatus[] = [
  "awaiting_preconsultation_decision",
  "waiting_triage",
  "triage_in_progress",
  "ready_for_consultation",
  "consultation_in_progress",
];
