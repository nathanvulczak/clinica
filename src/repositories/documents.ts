import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import type {
  DocumentTemplate,
  DocumentTemplateType,
  GeneratedDocumentEvent,
  GeneratedDocumentStatus,
} from "@/types/domain";

export type DocumentsAccess = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canManage: boolean;
  canExport: boolean;
  canUsePatients: boolean;
  canUseSchedule: boolean;
  canUseFinancial: boolean;
};

export type DocumentPatientOption = {
  id: string;
  full_name: string;
  social_name: string | null;
  cpf: string | null;
  email: string | null;
  phone: string | null;
};

export type DocumentProfessionalOption = {
  id: string;
  role: string;
  full_name: string;
  council_type: string | null;
  council_number: string | null;
  council_state: string | null;
};

export type DocumentAppointmentOption = {
  id: string;
  patient_id: string;
  professional_member_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  service_name: string;
  encounter_id: string | null;
};

export type DocumentFinancialOption = {
  id: string;
  patient_id: string | null;
  appointment_id: string | null;
  description: string;
  amount_cents: number;
  paid_cents: number;
  due_date: string;
  status: string;
};

export type GeneratedDocumentSummary = {
  id: string;
  title: string;
  content: string;
  status: GeneratedDocumentStatus;
  document_number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  printed_at: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  template: { id: string; name: string; template_type: DocumentTemplateType } | null;
  patient: DocumentPatientOption | null;
  appointment: { id: string; starts_at: string; appointment_type: string } | null;
  professional: { id: string; profile: { full_name: string } | null } | null;
  financial_entry: { id: string; description: string; amount_cents: number } | null;
  events: GeneratedDocumentEvent[];
};

export type DocumentsWorkspace = {
  access: DocumentsAccess;
  clinic: {
    id: string;
    trade_name: string;
    legal_name: string;
    document: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    state: string | null;
  } | null;
  templates: DocumentTemplate[];
  generatedDocuments: GeneratedDocumentSummary[];
  patients: DocumentPatientOption[];
  professionals: DocumentProfessionalOption[];
  appointments: DocumentAppointmentOption[];
  financialEntries: DocumentFinancialOption[];
};

export async function getDocumentsAccess(clinicId?: string | null): Promise<DocumentsAccess> {
  const authorization = await getClinicAuthorization(clinicId ?? undefined);

  return {
    canView: authorization.can("documents", "view"),
    canCreate: authorization.can("documents", "create"),
    canEdit: authorization.can("documents", "edit"),
    canManage: authorization.can("documents", "manage"),
    canExport: authorization.can("documents", "export"),
    canUsePatients: authorization.can("patients", "view"),
    canUseSchedule: authorization.can("schedule", "view"),
    canUseFinancial: authorization.can("financial", "view"),
  };
}

export async function getDocumentsWorkspace(clinicId?: string | null): Promise<DocumentsWorkspace> {
  const access = await getDocumentsAccess(clinicId);
  const empty: DocumentsWorkspace = {
    access,
    clinic: null,
    templates: [],
    generatedDocuments: [],
    patients: [],
    professionals: [],
    appointments: [],
    financialEntries: [],
  };
  if (!clinicId || !access.canView) return empty;

  const admin = createSupabaseAdminClient();
  const [
    { data: clinic },
    { data: templates },
    { data: generatedDocuments },
    { data: patients },
    { data: members },
    { data: professionalProfiles },
    { data: appointments },
    { data: encounters },
    { data: financialEntries },
  ] = await Promise.all([
    admin
      .from("clinics")
      .select("id, trade_name, legal_name, document, phone, email, city, state")
      .eq("id", clinicId)
      .maybeSingle(),
    admin
      .from("document_templates")
      .select("id, clinic_id, template_type, name, description, legal_basis, content, accepted_file_url, accepted_file_name, active, version_number, created_at, updated_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("template_type")
      .order("name"),
    admin
      .from("generated_documents")
      .select("id, title, content, status, document_number, issued_at, expires_at, printed_at, cancellation_reason, cancelled_at, created_at, template:document_templates(id, name, template_type), patient:patients(id, full_name, social_name, cpf, email, phone), appointment:appointments(id, starts_at, appointment_type), professional:clinic_members(id, profile:profiles!clinic_members_user_id_fkey(full_name)), financial_entry:financial_entries(id, description, amount_cents)")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    access.canUsePatients
      ? admin
          .from("patients")
          .select("id, full_name, social_name, cpf, email, phone")
          .eq("clinic_id", clinicId)
          .eq("active", true)
          .is("deleted_at", null)
          .order("full_name")
          .limit(300)
      : Promise.resolve({ data: [] }),
    admin
      .from("clinic_members")
      .select("id, role, profile:profiles!clinic_members_user_id_fkey(full_name)")
      .eq("clinic_id", clinicId)
      .eq("status", "active")
      .is("deleted_at", null)
      .in("role", ["clinic_owner", "doctor", "nurse", "professional"])
      .order("created_at"),
    admin
      .from("clinic_professional_profiles")
      .select("professional_member_id, council_type, council_number, council_state")
      .eq("clinic_id", clinicId)
      .eq("active", true)
      .is("deleted_at", null),
    access.canUseSchedule
      ? admin
          .from("appointments")
          .select("id, patient_id, professional_member_id, starts_at, ends_at, status, appointment_type, service:clinic_services(name)")
          .eq("clinic_id", clinicId)
          .is("deleted_at", null)
          .order("starts_at", { ascending: false })
          .limit(250)
      : Promise.resolve({ data: [] }),
    access.canUseSchedule
      ? admin
          .from("clinical_encounters")
          .select("id, appointment_id")
          .eq("clinic_id", clinicId)
          .is("deleted_at", null)
          .limit(250)
      : Promise.resolve({ data: [] }),
    access.canUseFinancial
      ? admin
          .from("financial_entries")
          .select("id, patient_id, appointment_id, description, amount_cents, paid_cents, due_date, status")
          .eq("clinic_id", clinicId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(250)
      : Promise.resolve({ data: [] }),
  ]);

  const documentRows = (generatedDocuments ?? []) as unknown as Omit<GeneratedDocumentSummary, "events">[];
  const documentIds = documentRows.map((document) => document.id);
  const { data: events } = documentIds.length
    ? await admin
        .from("generated_document_events")
        .select("id, clinic_id, document_id, event_type, details, created_at, created_by")
        .eq("clinic_id", clinicId)
        .in("document_id", documentIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };
  const eventsByDocument = new Map<string, GeneratedDocumentEvent[]>();
  for (const event of (events ?? []) as GeneratedDocumentEvent[]) {
    const current = eventsByDocument.get(event.document_id) ?? [];
    current.push(event);
    eventsByDocument.set(event.document_id, current);
  }

  const profileByMember = new Map(
    (professionalProfiles ?? []).map((profile) => [profile.professional_member_id, profile]),
  );
  const encounterByAppointment = new Map(
    (encounters ?? []).map((encounter) => [encounter.appointment_id, encounter.id]),
  );

  return {
    access,
    clinic: clinic as DocumentsWorkspace["clinic"],
    templates: (templates ?? []) as DocumentTemplate[],
    generatedDocuments: documentRows.map((document) => ({
      ...document,
      events: eventsByDocument.get(document.id) ?? [],
    })),
    patients: (patients ?? []) as DocumentPatientOption[],
    professionals: (members ?? []).map((member) => {
      const profile = profileByMember.get(member.id);
      const nestedProfile = member.profile as unknown as { full_name?: string } | null;
      return {
        id: member.id,
        role: member.role,
        full_name: nestedProfile?.full_name ?? "Profissional",
        council_type: profile?.council_type ?? null,
        council_number: profile?.council_number ?? null,
        council_state: profile?.council_state ?? null,
      };
    }),
    appointments: (appointments ?? []).map((appointment) => {
      const service = appointment.service as unknown as { name?: string } | null;
      return {
        id: appointment.id,
        patient_id: appointment.patient_id,
        professional_member_id: appointment.professional_member_id,
        starts_at: appointment.starts_at,
        ends_at: appointment.ends_at,
        status: appointment.status,
        service_name: service?.name ?? appointment.appointment_type,
        encounter_id: encounterByAppointment.get(appointment.id) ?? null,
      };
    }),
    financialEntries: (financialEntries ?? []) as DocumentFinancialOption[],
  };
}
