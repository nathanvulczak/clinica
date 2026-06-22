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
    id: "administration",
    label: "Administração",
    pathPrefix: "/administracao",
    items: [
      { label: "Clínicas", href: "/clinicas", navigationKey: "clinics" },
      { label: "Usuários e permissões", href: "/usuarios", navigationKey: "members" },
      { label: "Assinatura", href: "/assinatura", navigationKey: "billing", separatorBefore: true },
      { label: "Auditoria", href: "/auditoria", navigationKey: "audit" },
    ],
  },
];
