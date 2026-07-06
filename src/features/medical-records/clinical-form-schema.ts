export type ClinicalFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "multiselect"
  | "boolean"
  | "date"
  | "scale";

export type ClinicalFieldOption = {
  value: string;
  label: string;
};

export type ClinicalFormField = {
  key: string;
  label: string;
  type: ClinicalFieldType;
  required: boolean;
  placeholder?: string;
  unit?: string;
  min?: number;
  max?: number;
  options?: ClinicalFieldOption[];
  alert_values?: string[];
  code_system?: string;
  code?: string;
  reportable?: boolean;
};

export type ClinicalFormSection = {
  key: string;
  title: string;
  description?: string;
  columns: 1 | 2 | 3;
  fields: ClinicalFormField[];
};

export type ClinicalFormDefinition = {
  sections: ClinicalFormSection[];
};

export type ClinicalFormResponseValue = string | number | boolean | string[] | null;
export type ClinicalFormResponses = Record<string, ClinicalFormResponseValue>;

const fieldTypes = new Set<ClinicalFieldType>([
  "text",
  "textarea",
  "number",
  "select",
  "multiselect",
  "boolean",
  "date",
  "scale",
]);

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseClinicalFormDefinition(value: unknown): ClinicalFormDefinition {
  const root = asObject(value);
  if (!root || !Array.isArray(root.sections)) return { sections: [] };

  const sections = root.sections.flatMap((sectionValue): ClinicalFormSection[] => {
    const section = asObject(sectionValue);
    if (!section || typeof section.key !== "string" || typeof section.title !== "string") return [];
    const fields = Array.isArray(section.fields)
      ? section.fields.flatMap((fieldValue): ClinicalFormField[] => {
          const field = asObject(fieldValue);
          if (
            !field ||
            typeof field.key !== "string" ||
            typeof field.label !== "string" ||
            typeof field.type !== "string" ||
            !fieldTypes.has(field.type as ClinicalFieldType)
          ) return [];

          const options = Array.isArray(field.options)
            ? field.options.flatMap((optionValue): ClinicalFieldOption[] => {
                const option = asObject(optionValue);
                return option && typeof option.value === "string" && typeof option.label === "string"
                  ? [{ value: option.value, label: option.label }]
                  : [];
              })
            : undefined;

          return [{
            key: field.key,
            label: field.label,
            type: field.type as ClinicalFieldType,
            required: field.required === true,
            placeholder: typeof field.placeholder === "string" ? field.placeholder : undefined,
            unit: typeof field.unit === "string" ? field.unit : undefined,
            min: typeof field.min === "number" ? field.min : undefined,
            max: typeof field.max === "number" ? field.max : undefined,
            options,
            alert_values: Array.isArray(field.alert_values)
              ? field.alert_values.filter((item): item is string => typeof item === "string")
              : undefined,
            code_system: typeof field.code_system === "string" ? field.code_system : undefined,
            code: typeof field.code === "string" ? field.code : undefined,
            reportable: field.reportable === true,
          }];
        })
      : [];

    return [{
      key: section.key,
      title: section.title,
      description: typeof section.description === "string" ? section.description : undefined,
      columns: section.columns === 1 || section.columns === 3 ? section.columns : 2,
      fields,
    }];
  });

  return { sections };
}

export function normalizeSpecialtySlug(value: string | null | undefined) {
  const normalized = value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
  if (!normalized) return "general_medicine";
  if (/cardio/.test(normalized)) return "cardiology";
  if (/pediatr/.test(normalized)) return "pediatrics";
  if (/gineco|obstetr/.test(normalized)) return "gynecology_obstetrics";
  if (/psico|psiquiatr|saude mental/.test(normalized)) return "mental_health";
  if (/odonto|dent/.test(normalized)) return "dentistry";
  if (/fisio|reabilita/.test(normalized)) return "physiotherapy";
  if (/dermato/.test(normalized)) return "dermatology";
  return "general_medicine";
}

function hasResponse(value: ClinicalFormResponseValue | undefined) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function validateClinicalFormResponses(
  definition: ClinicalFormDefinition,
  input: unknown,
  requireCompletion: boolean,
) {
  const source = asObject(input) ?? {};
  const responses: ClinicalFormResponses = {};
  const errors: string[] = [];

  for (const section of definition.sections) {
    for (const field of section.fields) {
      const raw = source[field.key];
      let value: ClinicalFormResponseValue = null;

      if (field.type === "number" || field.type === "scale") {
        if (raw !== null && raw !== undefined && raw !== "") {
          const numeric = typeof raw === "number" ? raw : Number(raw);
          if (!Number.isFinite(numeric)) errors.push(`${field.label}: informe um número válido.`);
          else if (field.min !== undefined && numeric < field.min) errors.push(`${field.label}: valor mínimo ${field.min}.`);
          else if (field.max !== undefined && numeric > field.max) errors.push(`${field.label}: valor máximo ${field.max}.`);
          else value = numeric;
        }
      } else if (field.type === "boolean") {
        if (typeof raw === "boolean") value = raw;
        else if (raw === "true" || raw === "false") value = raw === "true";
      } else if (field.type === "multiselect") {
        const allowed = new Set(field.options?.map((option) => option.value) ?? []);
        value = Array.isArray(raw)
          ? raw.filter((item): item is string => typeof item === "string" && allowed.has(item))
          : [];
      } else if (field.type === "select") {
        const allowed = new Set(field.options?.map((option) => option.value) ?? []);
        if (typeof raw === "string" && (!allowed.size || allowed.has(raw))) value = raw.slice(0, 5000);
      } else if (typeof raw === "string") {
        value = raw.trim().slice(0, field.type === "textarea" ? 10000 : 2000);
      }

      if (requireCompletion && field.required && !hasResponse(value)) {
        errors.push(`${field.label}: preenchimento obrigatório.`);
      }
      responses[field.key] = value;
    }
  }

  return { responses, errors };
}

export function clinicalFormCompletion(definition: ClinicalFormDefinition, responses: ClinicalFormResponses) {
  const fields = definition.sections.flatMap((section) => section.fields);
  if (!fields.length) return 0;
  return Math.round((fields.filter((field) => hasResponse(responses[field.key])).length / fields.length) * 100);
}
