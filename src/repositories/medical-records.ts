import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_REQUIRED_MEDICAL_RECORD_FIELDS,
  isMedicalRecordFieldKey,
  type MedicalRecordFieldKey,
} from "@/features/medical-records/config";
import { getClinicalWorkflowAccess } from "@/repositories/clinical-workflow";
import type { ClinicalEncounterStatus } from "@/types/domain";

export type MedicalRecordStatus = "draft" | "completed" | "corrected";
export type MedicalPrescriptionStatus = "draft" | "issued" | "cancelled" | "corrected";

export type MedicalRecordPreferences = {
  clinic_id: string;
  required_fields: MedicalRecordFieldKey[];
  allow_completed_corrections: boolean;
  require_correction_reason: boolean;
  show_nursing_summary: boolean;
};

export type MedicalRecord = {
  id: string;
  clinic_id: string;
  encounter_id: string;
  appointment_id: string;
  patient_id: string;
  professional_member_id: string;
  performed_by: string | null;
  status: MedicalRecordStatus;
  chief_complaint: string | null;
  history: string | null;
  physical_exam: string | null;
  assessment: string | null;
  diagnosis: string | null;
  cid10: string | null;
  plan: string | null;
  patient_guidance: string | null;
  follow_up_required: boolean;
  follow_up_notes: string | null;
  correction_reason: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MedicalPrescription = {
  id: string;
  clinic_id: string;
  medical_record_id: string;
  encounter_id: string;
  patient_id: string;
  professional_member_id: string;
  template_key: string | null;
  title: string;
  content: string;
  status: MedicalPrescriptionStatus;
  issued_at: string | null;
  correction_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type MedicalRecordEncounterDetail = {
  id: string;
  clinic_id: string;
  appointment_id: string;
  patient_id: string;
  professional_member_id: string;
  status: ClinicalEncounterStatus;
  arrived_at: string | null;
  triage_started_at: string | null;
  triage_completed_at: string | null;
  consultation_started_at: string | null;
  consultation_completed_at: string | null;
  appointment: {
    id: string;
    starts_at: string;
    ends_at: string;
    appointment_type: string;
    status: string;
  } | null;
  patient: {
    id: string;
    full_name: string;
    social_name: string | null;
    birth_date: string | null;
    phone: string | null;
    email: string | null;
    clinical_alerts: string | null;
  } | null;
  professional: {
    id: string;
    role: string;
    profile: {
      full_name: string;
      avatar_url?: string | null;
    } | null;
  } | null;
  nursing_assessment: {
    id: string;
    status: string;
    chief_complaint: string | null;
    current_medications: string | null;
    allergies: string | null;
    comorbidities: string | null;
    pain_score: number | null;
    systolic_bp: number | null;
    diastolic_bp: number | null;
    heart_rate: number | null;
    respiratory_rate: number | null;
    temperature_c: number | null;
    oxygen_saturation: number | null;
    capillary_glucose: number | null;
    weight_kg: number | null;
    height_cm: number | null;
    bmi: number | null;
    risk_level: string;
    nursing_notes: string | null;
    recommendations: string | null;
    completed_at: string | null;
  } | null;
  medical_record: MedicalRecord | null;
  prescriptions: MedicalPrescription[];
};

export type MedicalRecordListItem = MedicalRecord & {
  patient: { id: string; full_name: string; social_name: string | null } | null;
  professional: { id: string; profile: { full_name: string } | null } | null;
};

export const defaultMedicalRecordPreferences = (clinicId = ""): MedicalRecordPreferences => ({
  clinic_id: clinicId,
  required_fields: DEFAULT_REQUIRED_MEDICAL_RECORD_FIELDS,
  allow_completed_corrections: true,
  require_correction_reason: true,
  show_nursing_summary: true,
});

type ProfessionalRow = {
  id: string;
  role?: string;
  profile: { full_name: string; avatar_url?: string | null } | { full_name: string; avatar_url?: string | null }[] | null;
};

function normalizeProfessional(row?: ProfessionalRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role ?? "professional",
    profile: Array.isArray(row.profile) ? row.profile[0] ?? null : row.profile,
  };
}

async function canAccessEncounter(clinicId: string, professionalMemberId: string) {
  const access = await getClinicalWorkflowAccess(clinicId);
  if (access.canViewAll) return { allowed: true, access };
  const allowed =
    access.canViewOwn &&
    access.currentMemberId === professionalMemberId &&
    access.currentMemberId !== null;
  return { allowed, access };
}

export async function getMedicalRecordPreferences(
  clinicId: string | null | undefined,
): Promise<MedicalRecordPreferences> {
  if (!clinicId) return defaultMedicalRecordPreferences();

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("medical_record_preferences")
    .select(
      "clinic_id, required_fields, allow_completed_corrections, require_correction_reason, show_nursing_summary",
    )
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle<{
      clinic_id: string;
      required_fields: string[] | null;
      allow_completed_corrections: boolean | null;
      require_correction_reason: boolean | null;
      show_nursing_summary: boolean | null;
    }>();

  if (!data) return defaultMedicalRecordPreferences(clinicId);
  const requiredFields = (data.required_fields ?? []).filter(isMedicalRecordFieldKey);

  return {
    clinic_id: data.clinic_id,
    required_fields: requiredFields.length
      ? requiredFields
      : DEFAULT_REQUIRED_MEDICAL_RECORD_FIELDS,
    allow_completed_corrections: data.allow_completed_corrections ?? true,
    require_correction_reason: data.require_correction_reason ?? true,
    show_nursing_summary: data.show_nursing_summary ?? true,
  };
}

export async function getMedicalRecordEncounterDetail(
  clinicId: string | null | undefined,
  encounterId: string,
): Promise<MedicalRecordEncounterDetail | null> {
  if (!clinicId) return null;

  const admin = createSupabaseAdminClient();
  const { data: encounter } = await admin
    .from("clinical_encounters")
    .select(
      "id, clinic_id, appointment_id, patient_id, professional_member_id, status, arrived_at, triage_started_at, triage_completed_at, consultation_started_at, consultation_completed_at",
    )
    .eq("id", encounterId)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      clinic_id: string;
      appointment_id: string;
      patient_id: string;
      professional_member_id: string;
      status: ClinicalEncounterStatus;
      arrived_at: string | null;
      triage_started_at: string | null;
      triage_completed_at: string | null;
      consultation_started_at: string | null;
      consultation_completed_at: string | null;
    }>();

  if (!encounter) return null;
  const access = await canAccessEncounter(clinicId, encounter.professional_member_id);
  if (!access.allowed) return null;

  const [
    { data: appointment },
    { data: patient },
    { data: professional },
    { data: nursingAssessment },
    { data: medicalRecord },
  ] = await Promise.all([
    admin
      .from("appointments")
      .select("id, starts_at, ends_at, appointment_type, status")
      .eq("id", encounter.appointment_id)
      .maybeSingle<MedicalRecordEncounterDetail["appointment"]>(),
    admin
      .from("patients")
      .select("id, full_name, social_name, birth_date, phone, email, clinical_alerts")
      .eq("id", encounter.patient_id)
      .maybeSingle<MedicalRecordEncounterDetail["patient"]>(),
    admin
      .from("clinic_members")
      .select("id, role, profile:profiles!clinic_members_user_id_fkey(full_name, avatar_url)")
      .eq("id", encounter.professional_member_id)
      .maybeSingle<ProfessionalRow>(),
    admin
      .from("nursing_assessments")
      .select(
        "id, status, chief_complaint, current_medications, allergies, comorbidities, pain_score, systolic_bp, diastolic_bp, heart_rate, respiratory_rate, temperature_c, oxygen_saturation, capillary_glucose, weight_kg, height_cm, bmi, risk_level, nursing_notes, recommendations, completed_at",
      )
      .eq("encounter_id", encounter.id)
      .is("deleted_at", null)
      .maybeSingle<MedicalRecordEncounterDetail["nursing_assessment"]>(),
    admin
      .from("medical_records")
      .select("*")
      .eq("encounter_id", encounter.id)
      .is("deleted_at", null)
      .maybeSingle<MedicalRecord>(),
  ]);

  const { data: prescriptions } = medicalRecord?.id
    ? await admin
        .from("medical_prescriptions")
        .select("*")
        .eq("medical_record_id", medicalRecord.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };

  return {
    ...encounter,
    appointment: appointment ?? null,
    patient: patient ?? null,
    professional: normalizeProfessional(professional) as MedicalRecordEncounterDetail["professional"],
    nursing_assessment: nursingAssessment ?? null,
    medical_record: medicalRecord ?? null,
    prescriptions: (prescriptions ?? []) as MedicalPrescription[],
  };
}

export async function listMedicalRecords(
  clinicId: string | null | undefined,
): Promise<MedicalRecordListItem[]> {
  if (!clinicId) return [];

  const access = await getClinicalWorkflowAccess(clinicId);
  if (!access.canViewAll && !access.canViewOwn) return [];

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("medical_records")
    .select("*")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (!access.canViewAll && access.currentMemberId) {
    query = query.eq("professional_member_id", access.currentMemberId);
  }

  const { data, error } = await query;
  if (error || !data?.length) return [];

  const rows = data as MedicalRecord[];
  const patientIds = [...new Set(rows.map((row) => row.patient_id))];
  const professionalIds = [...new Set(rows.map((row) => row.professional_member_id))];
  const [{ data: patients }, { data: professionals }] = await Promise.all([
    admin.from("patients").select("id, full_name, social_name").in("id", patientIds),
    admin
      .from("clinic_members")
      .select("id, profile:profiles!clinic_members_user_id_fkey(full_name)")
      .in("id", professionalIds),
  ]);

  const patientMap = new Map((patients ?? []).map((item) => [item.id, item]));
  const professionalMap = new Map(
    ((professionals ?? []) as ProfessionalRow[]).map((item) => [item.id, normalizeProfessional(item)]),
  );

  return rows.map((row) => ({
    ...row,
    patient: patientMap.get(row.patient_id) ?? null,
    professional: professionalMap.get(row.professional_member_id) ?? null,
  }));
}
