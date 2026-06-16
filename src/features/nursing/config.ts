export const NURSING_FIELD_OPTIONS = [
  { key: "chief_complaint", label: "Queixa principal", group: "Anamnese" },
  { key: "allergies", label: "Alergias", group: "Anamnese" },
  { key: "current_medications", label: "Medicamentos em uso", group: "Anamnese" },
  { key: "comorbidities", label: "Comorbidades", group: "Anamnese" },
  { key: "pain_score", label: "Escala de dor", group: "Dor" },
  { key: "pain_location", label: "Local da dor", group: "Dor" },
  { key: "systolic_bp", label: "PA sistólica", group: "Sinais vitais" },
  { key: "diastolic_bp", label: "PA diastólica", group: "Sinais vitais" },
  { key: "heart_rate", label: "Frequência cardíaca", group: "Sinais vitais" },
  { key: "respiratory_rate", label: "Frequência respiratória", group: "Sinais vitais" },
  { key: "temperature_c", label: "Temperatura", group: "Sinais vitais" },
  { key: "oxygen_saturation", label: "Saturação", group: "Sinais vitais" },
  { key: "capillary_glucose", label: "Glicemia capilar", group: "Sinais vitais" },
  { key: "weight_kg", label: "Peso", group: "Medidas" },
  { key: "height_cm", label: "Altura", group: "Medidas" },
  { key: "risk_level", label: "Classificação de risco", group: "Classificação" },
  { key: "nursing_notes", label: "Observações de enfermagem", group: "Conduta" },
  { key: "recommendations", label: "Recomendações ao profissional", group: "Conduta" },
] as const;

export type NursingFieldKey = (typeof NURSING_FIELD_OPTIONS)[number]["key"];

export const DEFAULT_REQUIRED_NURSING_FIELDS: NursingFieldKey[] = ["chief_complaint"];

export const nursingFieldLabels = Object.fromEntries(
  NURSING_FIELD_OPTIONS.map((field) => [field.key, field.label]),
) as Record<NursingFieldKey, string>;

export function isNursingFieldKey(value: string): value is NursingFieldKey {
  return NURSING_FIELD_OPTIONS.some((field) => field.key === value);
}
