import {
  getClinicalSpecialty,
  getClinicalSpecialtyExperience,
  type ClinicalSpecialtySlug,
} from "@/config/clinical-specialties";

export type ClinicalWorkspaceMode = "guided" | "compact";

export type ClinicalWorkspaceConfig = {
  slug: ClinicalSpecialtySlug;
  title: string;
  description: string;
  visualTool: string;
  focus: string[];
  metrics: string[];
  safetyNote: string;
};

const workspaceConfigs: Partial<Record<ClinicalSpecialtySlug, Omit<ClinicalWorkspaceConfig, "slug">>> = {
  general_medicine: {
    title: "Workspace de Clínica Médica",
    description: "Consulta estruturada com triagem, SOAP, diagnóstico, conduta e retorno.",
    visualTool: "Painel clínico e sinais vitais",
    focus: ["Queixa e história", "Exame direcionado", "Diagnóstico", "Conduta"],
    metrics: ["Sinais vitais", "CID-10", "Exames", "Retorno"],
    safetyNote: "Os sinais vitais vêm da Enfermagem quando disponíveis; registre apenas a interpretação clínica.",
  },
  dentistry: {
    title: "Workspace Odontológico",
    description: "Atendimento por dente, superfície, procedimento e plano de tratamento.",
    visualTool: "Odontograma interativo",
    focus: ["Queixa odontológica", "Odontograma", "Procedimento", "Plano e retorno"],
    metrics: ["Dentes envolvidos", "Procedimentos", "Materiais", "Sessões"],
    safetyNote: "O odontograma registra localização e situação; a evolução deve documentar a decisão e a conduta.",
  },
  nutrition: {
    title: "Workspace de Nutrição",
    description: "Acompanhamento antropométrico, metas, medidas corporais e plano alimentar.",
    visualTool: "Mapa de composição corporal",
    focus: ["Objetivo", "Antropometria", "Composição corporal", "Metas"],
    metrics: ["Peso", "IMC", "Cintura", "Metas"],
    safetyNote: "O IMC é uma referência calculada e deve ser interpretado conforme idade, contexto e avaliação profissional.",
  },
  nursing_care: {
    title: "Workspace de Enfermagem",
    description: "Pre-consulta estruturada com sinais vitais, risco, cuidados e encaminhamento seguro.",
    visualTool: "Mapa corporal e risco assistencial",
    focus: ["Sinais vitais", "Dor e risco", "Cuidados", "Encaminhamento"],
    metrics: ["PA", "FC", "SpO2", "Dor", "Risco"],
    safetyNote: "A pre-consulta organiza a assistencia e nao substitui a avaliacao do profissional responsavel pelo atendimento.",
  },
  physiotherapy: {
    title: "Workspace de Fisioterapia",
    description: "Avaliacao funcional com mapa de dor, mobilidade, objetivos e evolucao por sessao.",
    visualTool: "Mapa corporal e mobilidade",
    focus: ["Queixa funcional", "Mapa de dor", "Mobilidade", "Plano de exercicios"],
    metrics: ["Dor", "Amplitude", "Forca", "Funcionalidade"],
    safetyNote: "Registre a avaliacao e a conduta definidas pelo fisioterapeuta; o mapa e um apoio visual e auditavel.",
  },
  mental_health: {
    title: "Workspace de Saude Mental",
    description: "Evolucao por sessao com estado mental, risco, intervencao e plano terapeutico.",
    visualTool: "Linha terapeutica",
    focus: ["Demanda", "Estado mental", "Risco", "Plano terapeutico"],
    metrics: ["Humor", "Risco", "Adesao", "Objetivos"],
    safetyNote: "Conteudo de saude mental exige sigilo reforcado e deve ser acessado somente por profissionais autorizados.",
  },
  aesthetics: {
    title: "Workspace de Estética e Procedimentos",
    description: "Planejamento de áreas, produtos, lotes, execução e acompanhamento do procedimento.",
    visualTool: "Mapa facial e corporal",
    focus: ["Indicação", "Área tratada", "Produto e lote", "Cuidados"],
    metrics: ["Áreas", "Procedimento", "Lote", "Retorno"],
    safetyNote: "O mapa organiza o procedimento, mas não recomenda dose, produto ou técnica sem decisão documentada do responsável.",
  },
  dermatology: {
    title: "Workspace Dermatológico",
    description: "Lesões, localização, evolução fotográfica, hipótese e conduta dermatológica.",
    visualTool: "Mapa de face e pele",
    focus: ["Lesão", "Localização", "Evolução", "Conduta"],
    metrics: ["Lesões", "Fotos", "Exames", "Retorno"],
    safetyNote: "Imagens clínicas exigem consentimento e devem permanecer restritas ao escopo assistencial autorizado.",
  },
};

export function getClinicalWorkspaceConfig(value: string | null | undefined): ClinicalWorkspaceConfig {
  const specialty = getClinicalSpecialty(value);
  const experience = getClinicalSpecialtyExperience(specialty.slug);
  const config = workspaceConfigs[specialty.slug] ?? {
    title: `Workspace de ${specialty.shortLabel}`,
    description: specialty.description,
    visualTool: specialty.visualMap ? "Mapa clínico visual" : "Formulário especializado",
    focus: experience.workflowSteps,
    metrics: experience.keyIndicators,
    safetyNote: "Registre somente informações necessárias ao atendimento e à continuidade assistencial.",
  };

  return { slug: specialty.slug, ...config };
}
