import {
  type ClinicalFormDefinition,
  type ClinicalFormField,
  type ClinicalFormResponseMetadata,
  type ClinicalFormResponseValue,
  type ClinicalFormResponses,
} from "@/features/medical-records/clinical-form-schema";

export type ClinicalFormAnalytics = {
  totalFields: number;
  filledFields: number;
  requiredFields: ClinicalFormField[];
  missingRequiredFields: ClinicalFormField[];
  alertFields: ClinicalFormField[];
  reportableFields: ClinicalFormField[];
  visualMapEntries: number;
  completion: number;
};

export function hasClinicalResponse(value: ClinicalFormResponseValue | undefined) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function visualMapEntryCount(value: ClinicalFormResponseValue | undefined): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const maps = value as Record<string, unknown>;
  return Object.values(maps).reduce<number>((total, mapValue) => {
    if (!mapValue || typeof mapValue !== "object" || Array.isArray(mapValue)) return total;
    const entries = (mapValue as Record<string, unknown>).entries;
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) return total;
    return total + Object.values(entries).filter((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const source = entry as Record<string, unknown>;
      return Boolean(source.value || source.status || source.intensity || source.notes);
    }).length;
  }, 0);
}

export function getClinicalFormAnalytics(
  definition: ClinicalFormDefinition | null | undefined,
  responses: ClinicalFormResponses | null | undefined,
): ClinicalFormAnalytics {
  const fields = definition?.sections.flatMap((section) => section.fields) ?? [];
  const source = responses ?? {};
  const filledFields = fields.filter((field) => hasClinicalResponse(source[field.key]));
  const requiredFields = fields.filter((field) => field.required);
  const missingRequiredFields = requiredFields.filter((field) => !hasClinicalResponse(source[field.key]));
  const alertFields = fields.filter((field) => {
    const value = source[field.key];
    return typeof value === "string" && field.alert_values?.includes(value);
  });
  const reportableFields = fields.filter((field) => field.reportable && hasClinicalResponse(source[field.key]));

  return {
    totalFields: fields.length,
    filledFields: filledFields.length,
    requiredFields,
    missingRequiredFields,
    alertFields,
    reportableFields,
    visualMapEntries: visualMapEntryCount(source._visual_maps),
    completion: fields.length ? Math.round((filledFields.length / fields.length) * 100) : 0,
  };
}

export function formatClinicalResponseValue(
  field: Pick<ClinicalFormField, "options" | "unit">,
  value: ClinicalFormResponseValue | undefined,
) {
  if (!hasClinicalResponse(value)) return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) {
    return value.map((item) => field.options?.find((option) => option.value === item)?.label ?? item).join(", ");
  }
  if (typeof value === "object") return summarizeClinicalMetadata(value);

  const display = field.options?.find((option) => option.value === String(value))?.label ?? String(value);
  return field.unit ? `${display} ${field.unit}` : display;
}

export function summarizeClinicalMetadata(value: ClinicalFormResponseMetadata | undefined): string {
  if (value === null || value === undefined) return "Não informado";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => summarizeClinicalMetadata(item)).join(", ");

  const entries = value as Record<string, ClinicalFormResponseMetadata>;
  const visualEntries = entries.entries;
  if (visualEntries && typeof visualEntries === "object" && !Array.isArray(visualEntries)) {
    const rows = Object.values(visualEntries as Record<string, ClinicalFormResponseMetadata>)
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "";
        const source = entry as Record<string, ClinicalFormResponseMetadata>;
        const parts = [source.label, source.value, source.status, source.intensity, source.notes]
          .filter((item) => item !== null && item !== undefined && item !== "");
        return parts.map((item) => String(item)).join(" - ");
      })
      .filter(Boolean);
    return rows.length ? rows.join("; ") : "Mapa sem marcações";
  }

  return Object.entries(entries)
    .map(([key, entry]) => `${key}: ${summarizeClinicalMetadata(entry)}`)
    .join("; ");
}
