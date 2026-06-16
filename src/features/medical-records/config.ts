export const MEDICAL_RECORD_FIELD_OPTIONS = [
  { key: "chief_complaint", label: "Queixa principal", group: "Anamnese" },
  { key: "history", label: "Historia clinica", group: "Anamnese" },
  { key: "physical_exam", label: "Exame fisico", group: "Exame" },
  { key: "assessment", label: "Avaliacao/hipotese", group: "Conduta" },
  { key: "diagnosis", label: "Diagnostico", group: "Conduta" },
  { key: "cid10", label: "CID-10", group: "Conduta" },
  { key: "plan", label: "Plano terapeutico", group: "Conduta" },
  { key: "patient_guidance", label: "Orientacoes ao paciente", group: "Orientacoes" },
  { key: "follow_up_notes", label: "Retorno/acompanhamento", group: "Orientacoes" },
] as const;

export type MedicalRecordFieldKey = (typeof MEDICAL_RECORD_FIELD_OPTIONS)[number]["key"];

export const DEFAULT_REQUIRED_MEDICAL_RECORD_FIELDS: MedicalRecordFieldKey[] = [
  "assessment",
  "plan",
];

export const medicalRecordFieldLabels = Object.fromEntries(
  MEDICAL_RECORD_FIELD_OPTIONS.map((field) => [field.key, field.label]),
) as Record<MedicalRecordFieldKey, string>;

export function isMedicalRecordFieldKey(value: string): value is MedicalRecordFieldKey {
  return MEDICAL_RECORD_FIELD_OPTIONS.some((field) => field.key === value);
}

export const PRESCRIPTION_TEMPLATES = [
  {
    key: "prescricao_simples",
    title: "Prescricao simples",
    description: "Medicamento, posologia e orientacoes gerais.",
    content: `Paciente: {{patient_name}}
Profissional: {{professional_name}}
Data: {{date}}

Prescricao:
1. [Medicamento] - [dose] - [via] - [frequencia] - [duracao].

Orientacoes:
- Seguir a posologia prescrita.
- Retornar em caso de piora, efeitos adversos ou sinais de alerta.

Assinatura/carimbo do profissional`,
  },
  {
    key: "atestado_comparecimento",
    title: "Atestado de comparecimento",
    description: "Comprovacao de presenca em atendimento.",
    content: `Atesto, para os devidos fins, que {{patient_name}} compareceu a esta clinica em {{date}} para atendimento de saude.

Periodo de permanencia: [horario inicial] as [horario final].

Profissional responsavel: {{professional_name}}

Assinatura/carimbo do profissional`,
  },
  {
    key: "orientacoes_pos_consulta",
    title: "Orientacoes pos-consulta",
    description: "Cuidados, sinais de alerta e retorno.",
    content: `Paciente: {{patient_name}}
Data: {{date}}

Orientacoes:
- [Orientacao clinica 1]
- [Orientacao clinica 2]
- [Cuidados domiciliares]

Sinais de alerta:
- Procurar atendimento se houver piora importante, febre persistente, dor intensa ou outros sinais orientados na consulta.

Retorno:
- [Prazo/condicao para retorno]

Profissional: {{professional_name}}`,
  },
] as const;

export type PrescriptionTemplateKey = (typeof PRESCRIPTION_TEMPLATES)[number]["key"];

export const MEDICAL_RECORD_LGPD_ACK_TEXT = `Estou ciente de que prontuarios, evolucoes, prescricoes, pre-consultas, exames, anexos e demais registros assistenciais podem conter dados pessoais sensiveis de saude. Comprometo-me a acessar somente registros necessarios para minha atividade profissional, manter sigilo, nao compartilhar credenciais, nao copiar dados sem finalidade assistencial ou administrativa legitima, registrar informacoes verdadeiras e pertinentes, e comunicar imediatamente qualquer acesso indevido, incidente ou erro de lancamento. Reconheco que minhas acoes ficam registradas em auditoria, com identificacao de usuario, data, horario e contexto da clinica, para seguranca, rastreabilidade e conformidade com a LGPD.`;
