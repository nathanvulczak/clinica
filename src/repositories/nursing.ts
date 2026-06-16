import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
