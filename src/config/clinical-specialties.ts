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

export type ClinicalSpecialtyDocumentTemplate = {
  key: string;
  title: string;
  description: string;
  content: string;
};

export type ClinicalSpecialtyExperience = {
  workflowSteps: string[];
  keyIndicators: string[];
  suggestedExams: string[];
  serviceSuggestions: string[];
  documentTemplates: ClinicalSpecialtyDocumentTemplate[];
  deduplicationHints: string[];
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

export const CLINICAL_SPECIALTY_EXPERIENCES: Record<ClinicalSpecialtySlug, ClinicalSpecialtyExperience> = {
  general_medicine: {
    workflowSteps: ["Queixa principal", "Historia clinica", "Exame fisico", "Hipotese/CID", "Conduta e retorno"],
    keyIndicators: ["Sinais vitais", "Diagnostico principal", "Exames solicitados", "Retorno programado"],
    suggestedExams: ["Hemograma", "Glicemia", "PCR", "Urina tipo I", "Imagem conforme queixa"],
    serviceSuggestions: ["Consulta inicial", "Retorno clinico", "Teleorientacao"],
    documentTemplates: [
      {
        key: "general_referral",
        title: "Encaminhamento clinico",
        description: "Encaminhamento objetivo para outro profissional ou servico.",
        content: `Paciente: {{patient_name}}
Data: {{date}}

Encaminho o(a) paciente para avaliacao em [especialidade/servico], devido a [motivo clinico].

Resumo clinico:
- Queixa principal: [descrever]
- Hipotese diagnostica: [descrever]
- Exames/condutas ja realizados: [descrever]

Profissional: {{professional_name}}`,
      },
    ],
    deduplicationHints: [
      "Se a queixa ja veio da Enfermagem, use o campo SOAP para complementar contexto e tomada de decisao.",
      "Evite repetir sinais vitais no exame fisico; eles ja ficam no painel de Enfermagem.",
    ],
  },
  cardiology: {
    workflowSteps: ["Sintomas cardiovasculares", "Risco e antecedentes", "Exame cardiovascular", "ECG/exames", "Conduta e estratificacao"],
    keyIndicators: ["PA", "FC", "NYHA", "Risco cardiovascular", "ECG"],
    suggestedExams: ["ECG", "Holter", "MAPA", "Ecocardiograma", "Perfil lipidico", "Troponina quando indicado"],
    serviceSuggestions: ["Consulta cardiologica", "Risco cirurgico", "Avaliacao de hipertensao"],
    documentTemplates: [
      {
        key: "cardiology_risk_report",
        title: "Relatorio cardiologico",
        description: "Resumo cardiologico com risco, achados e conduta.",
        content: `Paciente: {{patient_name}}
Data: {{date}}

Relatorio cardiologico:
- Sintomas principais: [descrever]
- Fatores de risco: [descrever]
- Exame cardiovascular/ECG: [descrever]
- Hipotese/diagnostico: [descrever]
- Conduta: [descrever]

Profissional: {{professional_name}}`,
      },
    ],
    deduplicationHints: [
      "Nao replique PA e FC no texto se ja foram registradas na Enfermagem; referencie como dados de triagem.",
      "Use o formulario cardiovascular para NYHA, risco e sintomas; deixe o SOAP para interpretacao clinica.",
    ],
  },
  pediatrics: {
    workflowSteps: ["Responsavel presente", "Historia perinatal", "Crescimento", "Vacinas", "Conduta familiar"],
    keyIndicators: ["Peso/altura", "Marcos do desenvolvimento", "Situacao vacinal", "Sinais de alerta"],
    suggestedExams: ["Exames conforme idade e queixa", "Triagem auditiva/visual", "Hemograma quando indicado"],
    serviceSuggestions: ["Consulta pediatrica", "Puericultura", "Retorno pediatrico"],
    documentTemplates: [
      {
        key: "pediatric_school_note",
        title: "Declaracao pediatrica",
        description: "Declaracao para escola ou responsavel.",
        content: `Paciente: {{patient_name}}
Data: {{date}}

Declaro que o(a) paciente foi avaliado(a) em consulta pediatrica nesta data.

Orientacoes ao responsavel:
- [orientacao 1]
- [orientacao 2]

Retorno: [prazo/criterio]

Profissional: {{professional_name}}`,
      },
    ],
    deduplicationHints: [
      "Medidas pediatricas devem ser interpretadas por idade; evite classificar apenas por IMC adulto.",
      "Dados do responsavel e vacinacao ficam no formulario especializado; nao precisam ser repetidos no SOAP.",
    ],
  },
  gynecology_obstetrics: {
    workflowSteps: ["Historia ginecologica", "Historia obstetrica", "Rastreamentos", "Exame/achados", "Conduta e retorno"],
    keyIndicators: ["DUM", "Gesta/para/aborto", "Rastreamentos", "Contracepcao", "Sinais de alerta"],
    suggestedExams: ["Citopatologico", "USG", "Beta-hCG", "Mamografia conforme idade", "Exames pre-natais"],
    serviceSuggestions: ["Consulta ginecologica", "Pre-natal", "Retorno de exames"],
    documentTemplates: [
      {
        key: "gynecology_orientation",
        title: "Orientacoes ginecologicas",
        description: "Orientacoes de rastreamento, tratamento ou retorno.",
        content: `Paciente: {{patient_name}}
Data: {{date}}

Orientacoes:
- [orientacao clinica]
- [cuidados]
- [sinais de alerta]

Retorno recomendado: [prazo]

Profissional: {{professional_name}}`,
      },
    ],
    deduplicationHints: [
      "Dados gineco-obstetricos estruturados ficam no formulario da especialidade.",
      "Use o campo de conduta para decisao clinica e orientacoes, sem repetir todo o historico.",
    ],
  },
  mental_health: {
    workflowSteps: ["Demanda da sessao", "Estado mental", "Risco", "Intervencao", "Plano terapeutico"],
    keyIndicators: ["Humor/afeto", "Risco atual", "Adesao", "Objetivos terapeuticos", "Plano de crise"],
    suggestedExams: ["Escalas clinicas quando aplicavel", "Encaminhamentos multiprofissionais"],
    serviceSuggestions: ["Sessao individual", "Avaliacao psicologica", "Retorno terapeutico"],
    documentTemplates: [
      {
        key: "mental_health_attendance",
        title: "Declaracao de comparecimento",
        description: "Documento objetivo preservando sigilo clinico.",
        content: `Declaro, para os devidos fins, que {{patient_name}} compareceu em {{date}} para atendimento de saude.

Este documento nao descreve conteudo clinico da sessao, preservando sigilo profissional.

Profissional: {{professional_name}}`,
      },
    ],
    deduplicationHints: [
      "Conteudo sensivel da sessao deve ficar no campo especializado/nota clinica adequada.",
      "Documentos externos devem preservar sigilo e evitar expor hipoteses ou detalhes terapeuticos.",
    ],
  },
  dentistry: {
    workflowSteps: ["Queixa odontologica", "Odontograma", "Procedimento/orcamento", "Conduta", "Retorno"],
    keyIndicators: ["Dentes envolvidos", "Procedimentos", "Material", "Plano de tratamento", "Retorno"],
    suggestedExams: ["Radiografia periapical", "Panoramica", "Tomografia quando indicado"],
    serviceSuggestions: ["Avaliacao odontologica", "Profilaxia", "Restauracao", "Endodontia", "Orcamento odontologico"],
    documentTemplates: [
      {
        key: "dentistry_treatment_plan",
        title: "Plano odontologico",
        description: "Plano de tratamento por dentes/procedimentos.",
        content: `Paciente: {{patient_name}}
Data: {{date}}

Plano odontologico:
- Dentes/regioes envolvidos: [descrever]
- Procedimentos indicados: [descrever]
- Materiais/observacoes: [descrever]
- Numero estimado de sessoes: [descrever]

Profissional: {{professional_name}}`,
      },
    ],
    deduplicationHints: [
      "Use o odontograma para dente/regiao; no SOAP registre apenas justificativa e conduta.",
      "Nao repita procedimento em varios campos; escolha odontograma + plano odontologico.",
    ],
  },
  physiotherapy: {
    workflowSteps: ["Queixa funcional", "Mapa de dor", "Mobilidade/forca", "Conduta", "Plano de exercicios"],
    keyIndicators: ["Dor 0-10", "Amplitude", "Forca", "Funcionalidade", "Adesao aos exercicios"],
    suggestedExams: ["Escalas funcionais", "Imagem quando encaminhada", "Teste de mobilidade"],
    serviceSuggestions: ["Avaliacao fisioterapeutica", "Sessao de reabilitacao", "Retorno funcional"],
    documentTemplates: [
      {
        key: "physio_exercise_plan",
        title: "Plano de exercicios",
        description: "Orientacoes domiciliares de reabilitacao.",
        content: `Paciente: {{patient_name}}
Data: {{date}}

Plano de exercicios:
1. [exercicio] - [series/repeticoes] - [frequencia]
2. [exercicio] - [series/repeticoes] - [frequencia]

Cuidados:
- Interromper se houver piora importante ou sinais de alerta.
- Retornar conforme plano terapeutico.

Profissional: {{professional_name}}`,
      },
    ],
    deduplicationHints: [
      "Mapa de dor registra local/intensidade; no SOAP descreva impacto funcional e conduta.",
      "Exercicios orientados devem ficar no documento/plano de exercicios para facilitar entrega ao paciente.",
    ],
  },
  dermatology: {
    workflowSteps: ["Lesao/queixa", "Mapa visual", "Dermatoscopia/fotos", "Hipotese", "Conduta/procedimento"],
    keyIndicators: ["Localizacao", "Tempo de evolucao", "Alteracao de lesao", "Procedimento", "Fotos"],
    suggestedExams: ["Dermatoscopia", "Biopsia", "Cultura quando indicada"],
    serviceSuggestions: ["Consulta dermatologica", "Procedimento dermatologico", "Retorno de biopsia"],
    documentTemplates: [
      {
        key: "derm_procedure_orientation",
        title: "Orientacoes pos-procedimento dermatologico",
        description: "Cuidados apos biopsia, cauterizacao ou procedimento.",
        content: `Paciente: {{patient_name}}
Data: {{date}}

Orientacoes pos-procedimento:
- Manter area limpa e seca conforme orientado.
- Observar sinais de infeccao, sangramento persistente ou dor intensa.
- Retornar em [prazo] ou antes se houver sinais de alerta.

Profissional: {{professional_name}}`,
      },
    ],
    deduplicationHints: [
      "Mapa/fotos documentam localizacao; no texto registre criterio clinico, hipotese e conduta.",
      "Produtos ou procedimentos devem ficar no campo especifico para rastreabilidade.",
    ],
  },
  nutrition: {
    workflowSteps: ["Objetivo", "Antropometria", "Silhueta/medidas", "Plano alimentar", "Metas e retorno"],
    keyIndicators: ["Peso", "IMC", "Cintura/quadril", "Gordura corporal", "Meta nutricional"],
    suggestedExams: ["Glicemia", "Insulina", "Perfil lipidico", "TSH", "Vitamina D", "Hemograma"],
    serviceSuggestions: ["Consulta nutricional inicial", "Retorno nutricional", "Bioimpedancia"],
    documentTemplates: [
      {
        key: "nutrition_plan",
        title: "Plano alimentar resumido",
        description: "Resumo alimentar e metas para entrega ao paciente.",
        content: `Paciente: {{patient_name}}
Data: {{date}}

Plano alimentar resumido:
- Objetivo: [objetivo]
- Estrategia nutricional: [descrever]
- Metas ate o retorno: [descrever]
- Observacoes/restricoes: [descrever]

Profissional: {{professional_name}}`,
      },
    ],
    deduplicationHints: [
      "Peso/altura podem vir da Enfermagem, mas a Nutricao pode registrar medidas comparativas no mapa corporal.",
      "Nao repita todas as medidas no SOAP; use o mapa corporal e deixe o SOAP para interpretacao e plano.",
    ],
  },
  aesthetics: {
    workflowSteps: ["Avaliacao estetica", "Mapa facial/corporal", "Produto/lote", "Procedimento", "Cuidados e retorno"],
    keyIndicators: ["Area tratada", "Produto/lote", "Quantidade", "Fotos", "Eventos adversos"],
    suggestedExams: ["Fotos padronizadas", "Termo de consentimento", "Avaliacao medica quando indicada"],
    serviceSuggestions: ["Avaliacao estetica", "Procedimento injetavel", "Retorno pos-procedimento"],
    documentTemplates: [
      {
        key: "aesthetic_consent",
        title: "Termo de ciencia estetica",
        description: "Modelo base para consentimento e cuidados de procedimento estetico.",
        content: `Paciente: {{patient_name}}
Data: {{date}}

Declaro que recebi orientacoes sobre o procedimento [procedimento], beneficios esperados, limitacoes, cuidados, possiveis intercorrencias e necessidade de retorno.

Areas/produtos:
- [descrever areas, produto, lote e quantidade]

Profissional: {{professional_name}}`,
      },
    ],
    deduplicationHints: [
      "Produto, lote e area tratada devem ficar no formulario especializado/mapa para rastreabilidade.",
      "Use documentos para consentimento; evite escrever o mesmo termo dentro da evolucao clinica.",
    ],
  },
  nursing_care: {
    workflowSteps: ["Protocolo", "Sinais vitais", "Intervencao", "Materiais/medicacao", "Orientacao"],
    keyIndicators: ["PA", "SpO2", "Dor", "Risco", "Materiais usados"],
    suggestedExams: ["Glicemia capilar", "Escalas conforme protocolo", "Registro fotografico de feridas quando permitido"],
    serviceSuggestions: ["Triagem", "Curativo", "Medicacao", "Procedimento de enfermagem"],
    documentTemplates: [
      {
        key: "nursing_orientation",
        title: "Orientacoes de enfermagem",
        description: "Orientacoes apos procedimento ou curativo.",
        content: `Paciente: {{patient_name}}
Data: {{date}}

Orientacoes de enfermagem:
- [orientacao]
- [cuidados domiciliares]
- [sinais de alerta]

Profissional: {{professional_name}}`,
      },
    ],
    deduplicationHints: [
      "Sinais vitais ja ficam estruturados na ficha de Enfermagem.",
      "No prontuario medico, referencie a pre-consulta em vez de copiar todos os sinais novamente.",
    ],
  },
  speech_therapy: {
    workflowSteps: ["Queixa comunicativa", "Voz/fala/linguagem", "Degluticao/audicao", "Plano terapeutico", "Exercicios"],
    keyIndicators: ["Qualidade vocal", "Articulacao", "Degluticao", "Adesao aos exercicios", "Evolucao funcional"],
    suggestedExams: ["Avaliacoes fonoaudiologicas", "Encaminhamento ORL quando indicado", "Audiometria quando indicada"],
    serviceSuggestions: ["Avaliacao fonoaudiologica", "Sessao terapeutica", "Retorno fonoaudiologico"],
    documentTemplates: [
      {
        key: "speech_home_exercises",
        title: "Exercicios fonoaudiologicos",
        description: "Plano domiciliar com exercicios e frequencia.",
        content: `Paciente: {{patient_name}}
Data: {{date}}

Exercicios orientados:
1. [exercicio] - [frequencia]
2. [exercicio] - [frequencia]

Observacoes:
- Realizar conforme orientado.
- Suspender e comunicar o profissional em caso de desconforto relevante.

Profissional: {{professional_name}}`,
      },
    ],
    deduplicationHints: [
      "Use o formulario especializado para voz/fala/linguagem; no SOAP registre sintese e decisao terapeutica.",
      "Exercicios devem ser emitidos como documento para facilitar entrega e reimpressao.",
    ],
  },
};

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

export function getClinicalSpecialtyExperience(value: string | null | undefined) {
  return CLINICAL_SPECIALTY_EXPERIENCES[normalizeClinicalSpecialtySlug(value)];
}

export function getClinicalSpecialtyDocumentTemplates(value: string | null | undefined) {
  return getClinicalSpecialtyExperience(value).documentTemplates;
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
