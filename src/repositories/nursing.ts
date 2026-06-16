import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_REQUIRED_NURSING_FIELDS,
  isNursingFieldKey,
  type NursingFieldKey,
} from "@/features/nursing/config";
import { getClinicalWorkflowAccess } from "@/repositories/clinical-workflow";
import type { ClinicalEncounterStatus } from "@/types/domain";

export type NursingAssessmentStatus = "draft" | "completed" | "corrected";
export type NursingRiskLevel = "routine" | "attention" | "urgent";

export type NursingAssessment = {
  id: string;
  clinic_id: string;
  encounter_id: string;
  patient_id: string;
  professional_member_id: string;
  performed_by: string | null;
  status: NursingAssessmentStatus;
  chief_complaint: string | null;
  current_medications: string | null;
  allergies: string | null;
  comorbidities: string | null;
  pain_score: number | null;
  pain_location: string | null;
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
  risk_level: NursingRiskLevel;
  nursing_notes: string | null;
  recommendations: string | null;
  correction_reason: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NursingPreferences = {
  clinic_id: string;
  required_fields: NursingFieldKey[];
  allow_completed_corrections: boolean;
  require_correction_reason: boolean;
  show_required_field_alerts: boolean;
};

export const defaultNursingPreferences = (clinicId = ""): NursingPreferences => ({
  clinic_id: clinicId,
  required_fields: DEFAULT_REQUIRED_NURSING_FIELDS,
  allow_completed_corrections: true,
  require_correction_reason: true,
  show_required_field_alerts: true,
});

type NursingEncounterRow = {
  id: string;
  clinic_id: string;
  appointment_id: string;
  patient_id: string;
  professional_member_id: string;
  status: ClinicalEncounterStatus;
  preconsultation_required: boolean | null;
  arrived_at: string | null;
  triage_started_at: string | null;
  triage_completed_at: string | null;
};

export type NursingEncounterDetail = NursingEncounterRow & {
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
  assessment: NursingAssessment | null;
};

export type NursingAssessmentListItem = NursingAssessment & {
  patient: {
    id: string;
    full_name: string;
    social_name: string | null;
  } | null;
  encounter: {
    id: string;
    status: ClinicalEncounterStatus;
    appointment_id: string;
  } | null;
  professional: {
    id: string;
    profile: {
      full_name: string;
    } | null;
  } | null;
};

type ProfessionalRow = {
  id: string;
  profile: { full_name: string } | { full_name: string }[] | null;
};

function normalizeProfessional(row?: ProfessionalRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    profile: Array.isArray(row.profile) ? row.profile[0] ?? null : row.profile,
  };
}

export async function getNursingPreferences(
  clinicId: string | null | undefined,
): Promise<NursingPreferences> {
  if (!clinicId) return defaultNursingPreferences();

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("nursing_preferences")
    .select(
      "clinic_id, required_fields, allow_completed_corrections, require_correction_reason, show_required_field_alerts",
    )
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle<{
      clinic_id: string;
      required_fields: string[] | null;
      allow_completed_corrections: boolean | null;
      require_correction_reason: boolean | null;
      show_required_field_alerts: boolean | null;
    }>();

  if (!data) return defaultNursingPreferences(clinicId);

  return {
    clinic_id: data.clinic_id,
    required_fields: (data.required_fields ?? []).filter(isNursingFieldKey),
    allow_completed_corrections: data.allow_completed_corrections ?? true,
    require_correction_reason: data.require_correction_reason ?? true,
    show_required_field_alerts: data.show_required_field_alerts ?? true,
  };
}

export async function listNursingAssessments(
  clinicId: string | null | undefined,
): Promise<NursingAssessmentListItem[]> {
  if (!clinicId) return [];

  const access = await getClinicalWorkflowAccess(clinicId);
  if (!access.canViewAll && !access.canViewNursing) return [];

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("nursing_assessments")
    .select("*")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error || !data?.length) return [];

  const rows = data as NursingAssessment[];
  const patientIds = [...new Set(rows.map((row) => row.patient_id))];
  const encounterIds = [...new Set(rows.map((row) => row.encounter_id))];
  const professionalIds = [...new Set(rows.map((row) => row.professional_member_id))];

  const [{ data: patients }, { data: encounters }, { data: professionals }] = await Promise.all([
    admin.from("patients").select("id, full_name, social_name").in("id", patientIds),
    admin
      .from("clinical_encounters")
      .select("id, status, appointment_id")
      .in("id", encounterIds),
    admin
      .from("clinic_members")
      .select("id, profile:profiles!clinic_members_user_id_fkey(full_name)")
      .in("id", professionalIds),
  ]);

  const patientMap = new Map((patients ?? []).map((item) => [item.id, item]));
  const encounterMap = new Map((encounters ?? []).map((item) => [item.id, item]));
  const professionalMap = new Map(
    ((professionals ?? []) as ProfessionalRow[]).map((item) => [item.id, normalizeProfessional(item)]),
  );

  return rows.map((row) => ({
    ...row,
    patient: patientMap.get(row.patient_id) ?? null,
    encounter:
      (encounterMap.get(row.encounter_id) as NursingAssessmentListItem["encounter"]) ?? null,
    professional: professionalMap.get(row.professional_member_id) ?? null,
  }));
}

export async function getNursingEncounterDetail(
  clinicId: string | null | undefined,
  encounterId: string,
): Promise<NursingEncounterDetail | null> {
  if (!clinicId) return null;

  const access = await getClinicalWorkflowAccess(clinicId);
  if (!access.canViewAll && !access.canViewNursing) return null;

  const admin = createSupabaseAdminClient();
  const { data: encounter } = await admin
    .from("clinical_encounters")
    .select(
      "id, clinic_id, appointment_id, patient_id, professional_member_id, status, preconsultation_required, arrived_at, triage_started_at, triage_completed_at",
    )
    .eq("id", encounterId)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle<NursingEncounterRow>();

  if (!encounter) return null;

  const [{ data: appointment }, { data: patient }, { data: professional }, { data: assessment }] =
    await Promise.all([
      admin
        .from("appointments")
        .select("id, starts_at, ends_at, appointment_type, status")
        .eq("id", encounter.appointment_id)
        .maybeSingle<NursingEncounterDetail["appointment"]>(),
      admin
        .from("patients")
        .select("id, full_name, social_name, birth_date, phone, clinical_alerts")
        .eq("id", encounter.patient_id)
        .maybeSingle<NursingEncounterDetail["patient"]>(),
      admin
        .from("clinic_members")
        .select("id, role, profile:profiles!clinic_members_user_id_fkey(full_name, avatar_url)")
        .eq("id", encounter.professional_member_id)
        .maybeSingle<NursingEncounterDetail["professional"]>(),
      admin
        .from("nursing_assessments")
        .select("*")
        .eq("encounter_id", encounter.id)
        .is("deleted_at", null)
        .maybeSingle<NursingAssessment>(),
    ]);

  return {
    ...encounter,
    appointment: appointment ?? null,
    patient: patient ?? null,
    professional: professional ?? null,
    assessment: assessment ?? null,
  };
}
