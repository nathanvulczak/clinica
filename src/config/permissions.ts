import type { AppRole, PermissionAction, PermissionModule } from "@/types/domain";

export const PERMISSION_MODULES: PermissionModule[] = [
  "clinics",
  "members",
  "permissions",
  "billing",
  "audit",
  "patients",
  "medical_records",
  "schedule",
  "financial",
  "reports",
];

export const PERMISSION_ACTIONS: PermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "access_medical_record",
  "manage",
  "export",
];

export const ROLE_LABELS: Record<AppRole, string> = {
  platform_admin: "Administrador da plataforma",
  clinic_owner: "Proprietário",
  clinic_admin: "Administrador da clínica",
  doctor: "Médico",
  nurse: "Enfermagem",
  receptionist: "Recepção",
  financial: "Financeiro",
  professional: "Profissional",
};

export const MODULE_LABELS: Record<PermissionModule, string> = {
  clinics: "Clínicas",
  members: "Usuários",
  permissions: "Permissões",
  billing: "Assinatura",
  audit: "Auditoria",
  patients: "Pacientes",
  medical_records: "Prontuário",
  schedule: "Agenda",
  financial: "Financeiro",
  reports: "Relatórios",
};

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "Visualizar",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
  approve: "Aprovar",
  access_medical_record: "Acessar prontuário",
  manage: "Gerenciar",
  export: "Exportar",
};

export const ROLE_PRESET_DESCRIPTIONS: Record<AppRole, string> = {
  platform_admin: "Acesso administrativo global da plataforma.",
  clinic_owner: "Controle total da clínica, assinatura, usuários, permissões e auditoria.",
  clinic_admin: "Administração operacional da clínica, usuários e rotinas internas.",
  doctor: "Atendimento clínico, pacientes e prontuário conforme permissões da clínica.",
  nurse: "Apoio assistencial, triagem e registros clínicos autorizados.",
  receptionist: "Agenda, cadastro inicial de pacientes e rotina de recepção.",
  financial: "Cobranças, pagamentos, financeiro da clínica e relatórios financeiros.",
  professional: "Acesso básico ao ambiente e recursos liberados individualmente.",
};

export const CRITICAL_PERMISSION_OPTIONS: Array<{
  module: PermissionModule;
  action: PermissionAction;
  label: string;
  description: string;
}> = [
  {
    module: "members",
    action: "manage",
    label: "Gerenciar usuários",
    description: "Permite cadastrar, suspender e alterar perfis de membros.",
  },
  {
    module: "permissions",
    action: "manage",
    label: "Gerenciar permissões",
    description: "Permite liberar permissões individuais para outros usuários.",
  },
  {
    module: "audit",
    action: "view",
    label: "Ver auditoria",
    description: "Permite consultar logs e rastreabilidade da clínica.",
  },
  {
    module: "audit",
    action: "export",
    label: "Exportar auditoria",
    description: "Prepara acesso para exportações futuras de logs.",
  },
  {
    module: "billing",
    action: "view",
    label: "Ver assinatura",
    description: "Permite consultar plano, status e pagamentos.",
  },
  {
    module: "billing",
    action: "manage",
    label: "Gerenciar assinatura",
    description: "Permite acessar fluxos de alteração de plano.",
  },
  {
    module: "schedule",
    action: "view",
    label: "Visualizar agenda",
    description: "Permite consultar compromissos, bloqueios e status da agenda.",
  },
  {
    module: "schedule",
    action: "manage",
    label: "Gerenciar agenda",
    description: "Permite criar consultas, bloquear horários e alterar etapas do fluxo.",
  },
  {
    module: "schedule",
    action: "create",
    label: "Criar cadastros da agenda",
    description: "Permite cadastrar serviços, consultórios e disponibilidade.",
  },
  {
    module: "schedule",
    action: "edit",
    label: "Editar agenda e cadastros",
    description: "Permite editar serviços, consultórios, disponibilidade e consultas próprias.",
  },
  {
    module: "schedule",
    action: "delete",
    label: "Excluir cadastros da agenda",
    description: "Permite excluir serviços, consultórios e disponibilidade por soft delete.",
  },
  {
    module: "schedule",
    action: "export",
    label: "Exportar cadastros operacionais",
    description: "Permite exportar serviços e consultórios em CSV.",
  },
  {
    module: "patients",
    action: "view",
    label: "Visualizar pacientes",
    description: "Permite consultar dados básicos necessários para a rotina de agenda.",
  },
  {
    module: "patients",
    action: "create",
    label: "Cadastrar pacientes",
    description: "Prepara acesso para criação de pacientes.",
  },
  {
    module: "patients",
    action: "edit",
    label: "Editar pacientes",
    description: "Permite alterar dados administrativos de pacientes.",
  },
  {
    module: "patients",
    action: "delete",
    label: "Excluir pacientes",
    description: "Permite remover pacientes por soft delete com auditoria.",
  },
  {
    module: "patients",
    action: "export",
    label: "Exportar pacientes",
    description: "Permite exportar os pacientes visíveis ao usuário em CSV.",
  },
  {
    module: "medical_records",
    action: "access_medical_record",
    label: "Acessar prontuário",
    description: "Permissão sensível para dados clínicos protegidos.",
  },
  {
    module: "financial",
    action: "manage",
    label: "Gerenciar financeiro",
    description: "Prepara acesso para contas, recebimentos e fluxo de caixa.",
  },
];
