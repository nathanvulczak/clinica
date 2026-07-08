import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Clinic } from "@/types/domain";

export type ClinicSetupStep = {
  key: string;
  title: string;
  description: string;
  href: string;
  complete: boolean;
};

export async function getClinicSetupProgress(
  clinic: Clinic | null,
  enabled: boolean,
): Promise<ClinicSetupStep[]> {
  const clinicDetailsComplete = Boolean(
    clinic?.document && clinic.phone && clinic.email && clinic.city && clinic.state,
  );
  if (!clinic || !enabled) {
    return clinic
      ? []
      : [{ key: "clinic", title: "Cadastre a primeira clínica", description: "Defina os dados da unidade que usará o sistema.", href: "/clinicas/nova", complete: false }];
  }

  const admin = createSupabaseAdminClient();
  const [professionals, services, patients, appointments] = await Promise.all([
    admin.from("clinic_professional_profiles").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id).eq("active", true).is("deleted_at", null),
    admin.from("clinic_services").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id).eq("active", true).is("deleted_at", null),
    admin.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id).eq("active", true).is("deleted_at", null),
    admin.from("appointments").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id).is("deleted_at", null),
  ]);

  return [
    { key: "clinic", title: "Complete os dados da clínica", description: "Documento, contato e localização para emissões e relatórios.", href: `/clinicas/${clinic.id}/editar`, complete: clinicDetailsComplete },
    { key: "professional", title: "Configure um profissional", description: "Especialidade, registro e disponibilidade de atendimento.", href: "/cadastros?section=professionals", complete: (professionals.count ?? 0) > 0 },
    { key: "service", title: "Cadastre um serviço", description: "Informe duração e valor para integrar Agenda e Financeiro.", href: "/cadastros?section=services", complete: (services.count ?? 0) > 0 },
    { key: "patient", title: "Cadastre o primeiro paciente", description: "Crie a ficha cadastral que alimentará a jornada clínica.", href: "/cadastros?section=patients", complete: (patients.count ?? 0) > 0 },
    { key: "appointment", title: "Realize o primeiro agendamento", description: "Valide o fluxo Agenda, chegada, Enfermagem e Prontuário.", href: "/agenda", complete: (appointments.count ?? 0) > 0 },
  ];
}

