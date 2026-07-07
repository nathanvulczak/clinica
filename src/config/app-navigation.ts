import { financialSections } from "@/features/financial/navigation";
import type { NavigationKey } from "@/services/authorization/clinic-access";

export type AppNavigationItem = {
  label: string;
  href?: string;
  navigationKey?: NavigationKey;
  children?: AppNavigationItem[];
  separatorBefore?: boolean;
};

export type AppNavigationModule = {
  id: string;
  label: string;
  href?: string;
  navigationKey?: NavigationKey;
  pathPrefix: string;
  items?: AppNavigationItem[];
};

const financialItems: AppNavigationItem[] = financialSections.map((section) => ({
  label: section.label,
  children: section.children.map((item) => ({
    label: item.label,
    href: `/financeiro?section=${section.key}&view=${item.key}`,
  })),
}));

export const APP_NAVIGATION_MODULES: AppNavigationModule[] = [
  {
    id: "dashboard",
    label: "Painel",
    href: "/dashboard",
    navigationKey: "dashboard",
    pathPrefix: "/dashboard",
  },
  {
    id: "schedule",
    label: "Agenda",
    navigationKey: "schedule",
    pathPrefix: "/agenda",
    items: [
      {
        label: "Calendário",
        children: [
          { label: "Visualização diária", href: "/agenda?view=day" },
          { label: "Visualização semanal", href: "/agenda?view=week" },
          { label: "Visualização mensal", href: "/agenda?view=month" },
        ],
      },
    ],
  },
  {
    id: "encounters",
    label: "Atendimentos",
    href: "/atendimentos",
    navigationKey: "encounters",
    pathPrefix: "/atendimentos",
  },
  {
    id: "nursing",
    label: "Enfermagem",
    navigationKey: "nursing",
    pathPrefix: "/enfermagem",
    items: [
      { label: "Fila de pré-consulta", href: "/enfermagem?section=queue" },
      { label: "Registros", href: "/enfermagem?section=records" },
      { label: "Preferências", href: "/enfermagem?section=preferences", separatorBefore: true },
    ],
  },
  {
    id: "medical-records",
    label: "Prontuários",
    navigationKey: "medicalRecords",
    pathPrefix: "/prontuarios",
    items: [
      { label: "Fila clínica", href: "/prontuarios?section=queue" },
      { label: "Registros", href: "/prontuarios?section=records" },
      { label: "Pacientes", href: "/prontuarios?section=patients" },
      { label: "Relatórios", href: "/prontuarios?section=reports", separatorBefore: true },
      { label: "Preferências", href: "/prontuarios?section=preferences" },
    ],
  },
  {
    id: "registrations",
    label: "Cadastros",
    navigationKey: "registrations",
    pathPrefix: "/cadastros",
    items: [
      { label: "Pacientes", href: "/cadastros?section=patients" },
      { label: "Profissionais", href: "/cadastros?section=professionals" },
      { label: "Serviços", href: "/cadastros?section=services" },
      { label: "Consultórios", href: "/cadastros?section=rooms" },
      { label: "Itens", href: "/cadastros?section=items", navigationKey: "inventory" },
      { label: "Preferências", href: "/cadastros?section=preferences", separatorBefore: true },
    ],
  },
  {
    id: "financial",
    label: "Financeiro",
    navigationKey: "financial",
    pathPrefix: "/financeiro",
    items: financialItems,
  },
  {
    id: "diagnostics",
    label: "Exames",
    navigationKey: "diagnostics",
    pathPrefix: "/exames",
    items: [
      { label: "Central diagnóstica", href: "/exames?section=overview" },
      { label: "Pedidos e coleta", href: "/exames?section=orders" },
      { label: "Resultados", href: "/exames?section=results" },
      { label: "Alertas críticos", href: "/exames?section=alerts", separatorBefore: true },
      { label: "Relatórios", href: "/exames?section=reports" },
      { label: "Preferências", href: "/exames?section=preferences" },
    ],
  },
  {
    id: "insurance",
    label: "Convênios",
    navigationKey: "insurance",
    pathPrefix: "/convenios",
    items: [
      { label: "Painel TISS", href: "/convenios?section=overview" },
      { label: "Coberturas", href: "/convenios?section=coverages" },
      { label: "Guias", href: "/convenios?section=guides" },
      { label: "Lotes e transmissão", href: "/convenios?section=batches", separatorBefore: true },
      { label: "Glosas e recursos", href: "/convenios?section=glosses" },
      { label: "Relatórios", href: "/convenios?section=reports" },
      { label: "Preferências", href: "/convenios?section=preferences" },
    ],
  },
  {
    id: "documents",
    label: "Documentos",
    navigationKey: "documents",
    pathPrefix: "/documentos",
    items: [
      { label: "Modelos", href: "/documentos?section=templates" },
      { label: "Contratos", href: "/documentos?section=contracts" },
      { label: "Consentimentos", href: "/documentos?section=consents" },
      { label: "Histórico", href: "/documentos?section=history", separatorBefore: true },
      { label: "Preferências", href: "/documentos?section=preferences" },
    ],
  },
  {
    id: "inventory",
    label: "Estoque",
    navigationKey: "inventory",
    pathPrefix: "/estoque",
    items: [
      { label: "Visão geral", href: "/estoque?section=overview" },
      { label: "Itens e materiais", href: "/estoque?section=items" },
      { label: "Lotes e validade", href: "/estoque?section=batches" },
      { label: "Movimentos", href: "/estoque?section=movements" },
      { label: "Consumo por atendimento", href: "/estoque?section=care" },
      { label: "Preferências", href: "/estoque?section=settings", separatorBefore: true },
    ],
  },
  {
    id: "administration",
    label: "Administração",
    pathPrefix: "/administracao",
    items: [
      { label: "Clínicas", href: "/clinicas", navigationKey: "clinics" },
      { label: "Identidade e documentos", href: "/clinicas/identidade", navigationKey: "clinics" },
      { label: "Usuários e permissões", href: "/usuarios", navigationKey: "members" },
      { label: "Backup", href: "/administracao/backup", navigationKey: "backup" },
      { label: "Assinatura", href: "/assinatura", navigationKey: "billing", separatorBefore: true },
      { label: "Auditoria", href: "/auditoria", navigationKey: "audit" },
    ],
  },
];
