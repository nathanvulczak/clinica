import type { ClinicalEncounterStatus } from "@/types/domain";

export const CLINICAL_ENCOUNTER_STATUS_LABELS: Record<ClinicalEncounterStatus, string> = {
  awaiting_preconsultation_decision: "Aguardando definição",
  waiting_triage: "Aguardando pré-consulta",
  triage_in_progress: "Em pré-consulta",
  ready_for_consultation: "Liberado para atendimento",
  consultation_in_progress: "Consulta em andamento",
  consultation_completed: "Atendimento concluído",
  billing_pending: "Liberado para cobrança",
  billed: "Cobrança concluída",
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
