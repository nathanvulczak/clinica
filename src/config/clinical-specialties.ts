export type ClinicalSpecialtySlug =
  | "general_medicine"
  | "cardiology"
  | "pediatrics"
  | "gynecology_obstetrics"
  | "mental_health"
  | "dentistry"
  | "physiotherapy"
  | "dermatology"
  | "nutrition"
  | "aesthetics"
  | "nursing_care"
  | "speech_therapy";

export type ClinicalSpecialtyDefinition = {
  slug: ClinicalSpecialtySlug;
  label: string;
  shortLabel: string;
  group: "medical" | "dental" | "therapy" | "wellness" | "nursing";
  description: string;
  suggestedCouncil: string;
  visualMap?: "body_composition" | "body_pain" | "face_skin" | "odontogram" | "voice_pathway";
  keywords: string[];
};

export const CLINICAL_SPECIALTIES: ClinicalSpecialtyDefinition[] = [
  {
    slug: "general_medicine",
    label: "Medicina geral / Clinica medica",
    shortLabel: "Clinica medica",
    group: "medical",
    description: "SOAP clinico, diagnosticos, conduta, exames e retorno.",
    suggestedCouncil: "CRM",
    keywords: ["clinica geral", "clinica medica", "medicina", "medico", "general_medicine"],
  },
  {
    slug: "cardiology",
    label: "Cardiologia",
    shortLabel: "Cardiologia",
    group: "medical",
    description: "Risco cardiovascular, sintomas, ECG e conduta cardiologica.",
    suggestedCouncil: "CRM",
    keywords: ["cardiologia", "cardio", "cardiology"],
  },
  {
    slug: "pediatrics",
    label: "Pediatria",
    shortLabel: "Pediatria",
    group: "medical",
    description: "Crescimento, desenvolvimento, vacinacao e responsavel.",
    suggestedCouncil: "CRM",
    keywords: ["pediatria", "pediatrico", "pediatrics"],
  },
  {
    slug: "gynecology_obstetrics",
    label: "Ginecologia e obstetricia",
    shortLabel: "Gineco/Obstetricia",
    group: "medical",
    description: "Historia ginecologica, obstetrica, reprodutiva e rastreios.",
    suggestedCouncil: "CRM",
    keywords: ["ginecologia", "obstetricia", "gineco", "obstetra", "gynecology_obstetrics"],
  },
  {
    slug: "mental_health",
    label: "Psicologia / Saude mental",
    shortLabel: "Saude mental",
    group: "therapy",
    description: "Evolucao por sessao, plano terapeutico, escalas e sigilo reforcado.",
    suggestedCouncil: "CRP",
    keywords: ["psicologia", "psicologo", "psiquiatria", "saude mental", "mental_health"],
  },
  {
    slug: "dentistry",
    label: "Odontologia",
    shortLabel: "Odontologia",
    group: "dental",
    description: "Odontograma, procedimentos por dente, conduta e acompanhamento.",
    suggestedCouncil: "CRO",
    visualMap: "odontogram",
    keywords: ["odontologia", "dentista", "odonto", "dentistry", "dental"],
  },
  {
    slug: "physiotherapy",
    label: "Fisioterapia",
    shortLabel: "Fisioterapia",
    group: "therapy",
    description: "Mapa de dor, mobilidade, funcionalidade e plano de exercicios.",
    suggestedCouncil: "CREFITO",
    visualMap: "body_pain",
    keywords: ["fisioterapia", "fisio", "reabilitacao", "physiotherapy"],
  },
  {
    slug: "dermatology",
    label: "Dermatologia",
    shortLabel: "Dermatologia",
    group: "medical",
    description: "Lesoes, pele, anexos, procedimentos e acompanhamento fotografico.",
    suggestedCouncil: "CRM",
    visualMap: "face_skin",
    keywords: ["dermatologia", "dermato", "pele", "dermatology"],
  },
  {
    slug: "nutrition",
    label: "Nutricao",
    shortLabel: "Nutricao",
    group: "wellness",
    description: "Antropometria, metas, plano alimentar e evolucao corporal.",
    suggestedCouncil: "CRN",
    visualMap: "body_composition",
    keywords: ["nutricao", "nutricionista", "nutri", "nutrition"],
  },
  {
    slug: "aesthetics",
    label: "Estetica e procedimentos",
    shortLabel: "Estetica",
    group: "wellness",
    description: "Mapa facial/corporal, produtos aplicados, antes e depois e plano de sessoes.",
    suggestedCouncil: "CNEP",
    visualMap: "face_skin",
    keywords: ["estetica", "esteta", "procedimento estetico", "aesthetics"],
  },
  {
    slug: "nursing_care",
    label: "Enfermagem",
    shortLabel: "Enfermagem",
    group: "nursing",
    description: "Sinais vitais, escalas, protocolos, feridas, medicacoes e orientacoes.",
    suggestedCouncil: "COREN",
    visualMap: "body_pain",
    keywords: ["enfermagem", "enfermeiro", "nurse", "nursing_care"],
  },
  {
    slug: "speech_therapy",
    label: "Fonoaudiologia",
    shortLabel: "Fonoaudiologia",
    group: "therapy",
    description: "Voz, fala, linguagem, degluticao, audicao e plano terapeutico.",
    suggestedCouncil: "CREFONO",
    visualMap: "voice_pathway",
    keywords: ["fonoaudiologia", "fono", "voz", "fala", "linguagem", "speech_therapy"],
  },
];

const specialtyBySlug = new Map(CLINICAL_SPECIALTIES.map((specialty) => [specialty.slug, specialty]));

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function normalizeClinicalSpecialtySlug(value: string | null | undefined): ClinicalSpecialtySlug {
  const normalized = normalizeSearchText(value ?? "");
  if (!normalized) return "general_medicine";

  const bySlug = specialtyBySlug.get(normalized as ClinicalSpecialtySlug);
  if (bySlug) return bySlug.slug;

  const match = CLINICAL_SPECIALTIES.find((specialty) =>
    specialty.keywords.some((keyword) => normalized.includes(normalizeSearchText(keyword))),
  );

  return match?.slug ?? "general_medicine";
}

export function getClinicalSpecialty(value: string | null | undefined) {
  return specialtyBySlug.get(normalizeClinicalSpecialtySlug(value)) ?? specialtyBySlug.get("general_medicine")!;
}

export function getClinicalSpecialtyLabel(value: string | null | undefined) {
  return getClinicalSpecialty(value).label;
}

export const CLINICAL_SPECIALTY_OPTIONS = CLINICAL_SPECIALTIES.map((specialty) => ({
  value: specialty.slug,
  label: specialty.label,
  description: specialty.description,
  suggestedCouncil: specialty.suggestedCouncil,
}));
