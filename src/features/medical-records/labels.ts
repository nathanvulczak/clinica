import { CLINICAL_ENCOUNTER_STATUS_LABELS } from "@/config/clinical-workflow";
import type { ClinicalEncounterStatus } from "@/types/domain";
import type { MedicalPrescriptionStatus, MedicalRecordStatus } from "@/repositories/medical-records";

export const MEDICAL_RECORD_STATUS_LABELS: Record<MedicalRecordStatus, string> = {
  draft: "Rascunho",
  completed: "Concluido",
  corrected: "Corrigido",
};

export const MEDICAL_DOCUMENT_STATUS_LABELS: Record<MedicalPrescriptionStatus, string> = {
  draft: "Rascunho",
  issued: "Emitido",
  cancelled: "Cancelado",
  corrected: "Corrigido",
  deleted: "Excluido",
};

export const MEDICAL_DOCUMENT_EVENT_LABELS: Record<string, string> = {
  created: "Criado",
  updated: "Atualizado",
  printed: "Impresso",
  exported_pdf: "Exportado em PDF",
  deleted: "Excluido",
  restored: "Restaurado",
};

export function clinicalStatusLabel(status: string | null | undefined) {
  if (!status) return "Inicio do fluxo";
  return CLINICAL_ENCOUNTER_STATUS_LABELS[status as ClinicalEncounterStatus] ?? status;
}

export function medicalRecordStatusLabel(status: string | null | undefined) {
  if (!status) return "Nao informado";
  return MEDICAL_RECORD_STATUS_LABELS[status as MedicalRecordStatus] ?? status;
}

export function medicalDocumentStatusLabel(status: string | null | undefined) {
  if (!status) return "Nao informado";
  return MEDICAL_DOCUMENT_STATUS_LABELS[status as MedicalPrescriptionStatus] ?? status;
}

export function medicalDocumentEventLabel(eventType: string | null | undefined) {
  if (!eventType) return "Evento registrado";
  return MEDICAL_DOCUMENT_EVENT_LABELS[eventType] ?? eventType;
}
