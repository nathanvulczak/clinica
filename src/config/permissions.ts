import type { AppRole, PermissionAction, PermissionModule } from "@/types/domain";

export type PermissionKey = `${PermissionModule}:${PermissionAction}`;

export const PERMISSION_MODULES: PermissionModule[] = [
  "clinics",
  "members",
  "permissions",
  "billing",
  "audit",
  "patients",
  "medical_records",
  "nursing",
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
  nursing: "Enfermagem",
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

export const ROLE_PERMISSION_PRESETS: Record<AppRole, PermissionKey[]> = {
  platform_admin: [],
  clinic_owner: [],
  clinic_admin: [
    "clinics:view",
    "clinics:edit",
    "members:view",
    "members:create",
    "members:edit",
    "members:manage",
    "permissions:view",
    "permissions:manage",
    "audit:view",
    "audit:export",
    "patients:view",
    "patients:create",
    "patients:edit",
    "patients:delete",
    "patients:export",
    "schedule:view",
    "schedule:create",
    "schedule:edit",
    "schedule:delete",
    "schedule:manage",
    "schedule:export",
    "nursing:view",
    "financial:view",
    "financial:manage",
    "financial:approve",
    "reports:view",
    "reports:export",
  ],
  doctor: [
    "patients:view",
    "medical_records:view",
    "medical_records:create",
    "medical_records:edit",
    "medical_records:access_medical_record",
    "nursing:view",
    "nursing:create",
    "nursing:edit",
    "schedule:view",
    "schedule:edit",
  ],
  nurse: [
    "patients:view",
    "patients:edit",
    "medical_records:view",
    "medical_records:create",
    "medical_records:edit",
    "medical_records:access_medical_record",
    "schedule:view",
    "schedule:edit",
  ],
  receptionist: [
    "patients:view",
    "patients:create",
    "patients:edit",
    "patients:export",
    "schedule:view",
    "schedule:create",
    "schedule:edit",
    "schedule:manage",
    "schedule:export",
    "financial:create",
  ],
  financial: [
    "billing:view",
    "financial:view",
    "financial:create",
    "financial:edit",
    "financial:manage",
    "financial:approve",
    "financial:export",
    "reports:view",
    "reports:export",
  ],
  professional: [
    "patients:view",
    "medical_records:view",
    "medical_records:create",
    "medical_records:edit",
    "medical_records:access_medical_record",
    "schedule:view",
    "schedule:edit",
  ],
};

export function permissionKey(module: PermissionModule, action: PermissionAction): PermissionKey {
  return `${module}:${action}`;
}

export function roleHasDefaultPermission(
  role: AppRole,
  module: PermissionModule,
  action: PermissionAction,
) {
  return (
    role === "platform_admin" ||
    role === "clinic_owner" ||
    ROLE_PERMISSION_PRESETS[role].includes(permissionKey(module, action))
  );
}

export const CRITICAL_PERMISSION_OPTIONS: Array<{
  module: PermissionModule;
  action: PermissionAction;
  label: string;
  description: string;
}> = [
  {
    module: "clinics",
    action: "view",
    label: "Visualizar clínicas",
    description: "Permite consultar os dados administrativos das clínicas vinculadas.",
  },
  {
    module: "clinics",
    action: "edit",
    label: "Editar clínica",
    description: "Permite alterar os dados administrativos da clínica.",
  },
  {
    module: "members",
    action: "view",
    label: "Visualizar usuários",
    description: "Permite consultar os membros e seus perfis de acesso.",
  },
  {
    module: "members",
    action: "manage",
    label: "Gerenciar usuários",
    description: "Permite cadastrar, suspender e alterar perfis de membros.",
  },
  {
    module: "permissions",
    action: "view",
    label: "Visualizar permissões",
    description: "Permite consultar a matriz de acesso dos usuários.",
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
    label: "Excluir agenda e cadastros",
    description:
      "Permite excluir agendamentos ainda não iniciados e cadastros operacionais por soft delete.",
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
    module: "nursing",
    action: "view",
    label: "Visualizar fila de enfermagem",
    description: "Permite consultar pacientes encaminhados para pré-consulta.",
  },
  {
    module: "nursing",
    action: "create",
    label: "Iniciar pré-consulta",
    description: "Permite assumir um atendimento encaminhado para enfermagem.",
  },
  {
    module: "nursing",
    action: "edit",
    label: "Concluir pré-consulta",
    description: "Permite finalizar a etapa e liberar o paciente para o profissional.",
  },
  {
    module: "medical_records",
    action: "view",
    label: "Visualizar prontuários",
    description: "Prepara a visualização do módulo clínico quando ele for habilitado.",
  },
  {
    module: "medical_records",
    action: "create",
    label: "Criar registros clínicos",
    description: "Prepara a criação de evoluções e registros em prontuário.",
  },
  {
    module: "medical_records",
    action: "edit",
    label: "Editar registros clínicos",
    description: "Prepara a edição controlada de registros clínicos permitidos.",
  },
  {
    module: "medical_records",
    action: "access_medical_record",
    label: "Acessar prontuário",
    description: "Permissão sensível para dados clínicos protegidos.",
  },
  {
    module: "financial",
    action: "view",
    label: "Visualizar financeiro",
    description: "Permite consultar o módulo financeiro da clínica.",
  },
  {
    module: "financial",
    action: "create",
    label: "Criar lançamentos financeiros",
    description: "Prepara a criação de cobranças, recebimentos e despesas.",
  },
  {
    module: "financial",
    action: "edit",
    label: "Editar lançamentos financeiros",
    description: "Prepara a alteração de lançamentos autorizados.",
  },
  {
    module: "financial",
    action: "manage",
    label: "Gerenciar financeiro",
    description: "Prepara acesso para contas, recebimentos e fluxo de caixa.",
  },
  {
    module: "financial",
    action: "export",
    label: "Exportar financeiro",
    description: "Prepara exportações financeiras conforme filtros autorizados.",
  },
  {
    module: "reports",
    action: "view",
    label: "Visualizar relatórios",
    description: "Prepara o acesso aos relatórios operacionais e administrativos.",
  },
  {
    module: "reports",
    action: "export",
    label: "Exportar relatórios",
    description: "Prepara a exportação dos relatórios liberados para o usuário.",
  },
];
