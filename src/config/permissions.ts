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
