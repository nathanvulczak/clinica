import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_REQUIRED_MEDICAL_RECORD_FIELDS,
  isMedicalRecordFieldKey,
  type MedicalRecordFieldKey,
} from "@/features/medical-records/config";
import { getClinicalWorkflowAccess } from "@/repositories/clinical-workflow";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import type { ClinicalEncounterStatus } from "@/types/domain";

export type MedicalRecordStatus = "draft" | "completed" | "corrected";
export type MedicalPrescriptionStatus = "draft" | "issued" | "cancelled" | "corrected" | "deleted";

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
  professional_registry: string | null;
  deleted_reason: string | null;
  deleted_by: string | null;
  issued_at: string | null;
  printed_at: string | null;
  exported_at: string | null;
  correction_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type MedicalDocumentEvent = {
  id: string;
  medical_document_id: string;
  event_type: "created" | "updated" | "printed" | "exported_pdf" | "deleted" | "restored";
  reason: string | null;
  created_at: string;
  created_by: string | null;
};

export type PatientClinicalComment = {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  medical_record_id: string | null;
  professional_member_id: string | null;
  comment: string;
  visibility: "clinical" | "private";
  created_at: string;
  created_by: string | null;
  author: { full_name: string } | null;
};

export type MedicalRecordAttachment = {
  id: string;
  clinic_id: string;
  medical_record_id: string;
  encounter_id: string;
  patient_id: string;
  professional_member_id: string;
  category: "exam" | "report" | "image" | "attachment" | "other";
  title: string;
  description: string | null;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  status: "active" | "deleted";
  deleted_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  signed_url?: string | null;
};

export type MedicalCorrectionRequest = {
  id: string;
  medical_record_id: string;
  encounter_id: string;
  reason: string;
  status: "opened" | "applied" | "cancelled";
  applied_at: string | null;
  created_at: string;
  created_by: string | null;
};

export type MedicalTimelineEvent = {
  id: string;
  occurred_at: string;
  type: string;
  title: string;
  description: string;
  tone: "info" | "success" | "warning" | "critical";
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
    profile: { full_name: string; avatar_url?: string | null } | null;
  } | null;
  professional_profile: {
    specialty: string | null;
    council_type: string | null;
    council_number: string | null;
    council_state: string | null;
    rqe: string | null;
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
  document_events: MedicalDocumentEvent[];
  patient_comments: PatientClinicalComment[];
  attachments: MedicalRecordAttachment[];
  correction_requests: MedicalCorrectionRequest[];
  timeline: MedicalTimelineEvent[];
};

export type MedicalRecordListItem = MedicalRecord & {
  patient: { id: string; full_name: string; social_name: string | null } | null;
  professional: { id: string; profile: { full_name: string } | null } | null;
};

export type MedicalRecordReports = {
  totalRecords: number;
  completedRecords: number;
  draftRecords: number;
  issuedDocuments: number;
  deletedDocuments: number;
  recordsByStatus: Array<{ status: string; count: number }>;
  recordsByProfessional: Array<{ professional: string; count: number }>;
};

export type PatientMedicalOverview = {
  patient: { id: string; full_name: string; social_name: string | null; phone: string | null } | null;
  records: MedicalRecordListItem[];
  comments: PatientClinicalComment[];
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
  profile:
    | { full_name: string; avatar_url?: string | null }
    | { full_name: string; avatar_url?: string | null }[]
    | null;
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
    { data: professionalProfile },
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
      .from("clinic_professional_profiles")
      .select("specialty, council_type, council_number, council_state, rqe")
      .eq("clinic_id", clinicId)
      .eq("professional_member_id", encounter.professional_member_id)
      .is("deleted_at", null)
      .maybeSingle<MedicalRecordEncounterDetail["professional_profile"]>(),
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

  const [
    { data: prescriptions },
    { data: comments },
    { data: encounterEvents },
    { data: attachments },
    { data: correctionRequests },
  ] = await Promise.all([
    medicalRecord?.id
      ? admin
          .from("medical_prescriptions")
          .select("*")
          .eq("medical_record_id", medicalRecord.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    admin
      .from("patient_clinical_comments")
      .select(
        "id, patient_id, encounter_id, medical_record_id, professional_member_id, comment, visibility, created_at, created_by",
      )
      .eq("clinic_id", clinicId)
      .eq("patient_id", encounter.patient_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("clinical_encounter_events")
      .select("id, from_status, to_status, reason, created_at")
      .eq("encounter_id", encounter.id)
      .order("created_at", { ascending: false })
      .limit(50),
    medicalRecord?.id
      ? admin
          .from("medical_record_attachments")
          .select("*")
          .eq("medical_record_id", medicalRecord.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    medicalRecord?.id
      ? admin
          .from("medical_record_correction_requests")
          .select("id, medical_record_id, encounter_id, reason, status, applied_at, created_at, created_by")
          .eq("medical_record_id", medicalRecord.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const documentIds = ((prescriptions ?? []) as MedicalPrescription[]).map((item) => item.id);
  const { data: documentEvents } = documentIds.length
    ? await admin
        .from("medical_document_events")
        .select("id, medical_document_id, event_type, reason, created_at, created_by")
        .in("medical_document_id", documentIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const authorIds = [...new Set((comments ?? []).map((item) => item.created_by).filter(Boolean))];
  const { data: authors } = authorIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [] };
  const authorMap = new Map((authors ?? []).map((item) => [item.id, item]));
  const attachmentsWithUrls = await Promise.all(
    ((attachments ?? []) as MedicalRecordAttachment[]).map(async (attachment) => {
      if (attachment.status === "deleted") return { ...attachment, signed_url: null };
      const { data } = await admin.storage
        .from("clinical-attachments")
        .createSignedUrl(attachment.file_path, 60 * 15);
      return { ...attachment, signed_url: data?.signedUrl ?? null };
    }),
  );
  const timeline = buildTimeline({
    encounter,
    encounterEvents: (encounterEvents ?? []) as Array<{
      id: string;
      from_status: string | null;
      to_status: string;
      reason: string | null;
      created_at: string;
    }>,
    nursingAssessment,
    medicalRecord,
    prescriptions: (prescriptions ?? []) as MedicalPrescription[],
    documentEvents: (documentEvents ?? []) as MedicalDocumentEvent[],
    comments: (comments ?? []) as PatientClinicalComment[],
    attachments: attachmentsWithUrls,
    correctionRequests: (correctionRequests ?? []) as MedicalCorrectionRequest[],
  });

  return {
    ...encounter,
    appointment: appointment ?? null,
    patient: patient ?? null,
    professional: normalizeProfessional(professional) as MedicalRecordEncounterDetail["professional"],
    professional_profile: professionalProfile ?? null,
    nursing_assessment: nursingAssessment ?? null,
    medical_record: medicalRecord ?? null,
    prescriptions: (prescriptions ?? []) as MedicalPrescription[],
    document_events: (documentEvents ?? []) as MedicalDocumentEvent[],
    patient_comments: ((comments ?? []) as PatientClinicalComment[]).map((comment) => ({
      ...comment,
      author: comment.created_by ? authorMap.get(comment.created_by) ?? null : null,
    })),
    attachments: attachmentsWithUrls,
    correction_requests: (correctionRequests ?? []) as MedicalCorrectionRequest[],
    timeline,
  };
}

function buildTimeline({
  encounter,
  encounterEvents,
  nursingAssessment,
  medicalRecord,
  prescriptions,
  documentEvents,
  comments,
  attachments,
  correctionRequests,
}: {
  encounter: { id: string; arrived_at: string | null; consultation_started_at: string | null; consultation_completed_at: string | null };
  encounterEvents: Array<{ id: string; from_status: string | null; to_status: string; reason: string | null; created_at: string }>;
  nursingAssessment: MedicalRecordEncounterDetail["nursing_assessment"];
  medicalRecord: MedicalRecord | null;
  prescriptions: MedicalPrescription[];
  documentEvents: MedicalDocumentEvent[];
  comments: PatientClinicalComment[];
  attachments: MedicalRecordAttachment[];
  correctionRequests: MedicalCorrectionRequest[];
}): MedicalTimelineEvent[] {
  const events: MedicalTimelineEvent[] = [];

  if (encounter.arrived_at) {
    events.push({
      id: `${encounter.id}-arrival`,
      occurred_at: encounter.arrived_at,
      type: "arrival",
      title: "Paciente chegou",
      description: "Chegada registrada na agenda.",
      tone: "info",
    });
  }

  for (const event of encounterEvents) {
    events.push({
      id: event.id,
      occurred_at: event.created_at,
      type: "workflow",
      title: "Etapa assistencial atualizada",
      description: `${event.from_status ?? "inicio"} -> ${event.to_status}${event.reason ? ` | ${event.reason}` : ""}`,
      tone: "info",
    });
  }

  if (nursingAssessment?.completed_at) {
    events.push({
      id: nursingAssessment.id,
      occurred_at: nursingAssessment.completed_at,
      type: "nursing",
      title: "Pre-consulta encerrada",
      description: nursingAssessment.chief_complaint ?? "Ficha de enfermagem concluida.",
      tone: "success",
    });
  }

  if (medicalRecord) {
    events.push({
      id: medicalRecord.id,
      occurred_at: medicalRecord.updated_at,
      type: "medical_record",
      title: medicalRecord.status === "completed" ? "Prontuario concluido" : "Prontuario atualizado",
      description: medicalRecord.assessment ?? medicalRecord.plan ?? "Evolucao clinica registrada.",
      tone: medicalRecord.status === "completed" ? "success" : "info",
    });
  }

  for (const document of prescriptions) {
    events.push({
      id: document.id,
      occurred_at: document.updated_at,
      type: "document",
      title: document.status === "deleted" ? "Documento excluido" : "Documento clinico",
      description: `${document.title}${document.deleted_reason ? ` | Motivo: ${document.deleted_reason}` : ""}`,
      tone: document.status === "deleted" ? "warning" : "info",
    });
  }

  for (const event of documentEvents) {
    events.push({
      id: event.id,
      occurred_at: event.created_at,
      type: "document_event",
      title: "Evento de documento",
      description: `${event.event_type}${event.reason ? ` | ${event.reason}` : ""}`,
      tone: event.event_type === "deleted" ? "warning" : "info",
    });
  }

  for (const comment of comments) {
    events.push({
      id: comment.id,
      occurred_at: comment.created_at,
      type: "comment",
      title: "Comentario clinico",
      description: comment.comment,
      tone: "info",
    });
  }

  for (const attachment of attachments) {
    events.push({
      id: attachment.id,
      occurred_at: attachment.created_at,
      type: "attachment",
      title: attachment.category === "exam" ? "Exame anexado" : "Anexo clinico",
      description: `${attachment.title} (${attachment.file_name})`,
      tone: attachment.status === "deleted" ? "warning" : "info",
    });
  }

  for (const request of correctionRequests) {
    events.push({
      id: request.id,
      occurred_at: request.created_at,
      type: "correction",
      title: "Correcao formal solicitada",
      description: request.reason,
      tone: request.status === "applied" ? "success" : "warning",
    });
  }

  return events.sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
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

export async function getMedicalRecordReports(
  clinicId: string | null | undefined,
): Promise<MedicalRecordReports> {
  const records = await listMedicalRecords(clinicId);
  if (!clinicId) {
    return emptyReports();
  }

  const access = await getClinicalWorkflowAccess(clinicId);
  if (!access.canViewAll && !access.canViewOwn) return emptyReports();

  const admin = createSupabaseAdminClient();
  let documentQuery = admin
    .from("medical_prescriptions")
    .select("id, status")
    .eq("clinic_id", clinicId);

  if (!access.canViewAll && access.currentMemberId) {
    documentQuery = documentQuery.eq("professional_member_id", access.currentMemberId);
  }

  const { data: documents } = await documentQuery;
  const statusMap = new Map<string, number>();
  const professionalMap = new Map<string, number>();

  for (const record of records) {
    statusMap.set(record.status, (statusMap.get(record.status) ?? 0) + 1);
    const professional = record.professional?.profile?.full_name ?? "Profissional";
    professionalMap.set(professional, (professionalMap.get(professional) ?? 0) + 1);
  }

  return {
    totalRecords: records.length,
    completedRecords: records.filter((record) => record.status === "completed").length,
    draftRecords: records.filter((record) => record.status === "draft").length,
    issuedDocuments: (documents ?? []).filter((doc) => doc.status === "issued").length,
    deletedDocuments: (documents ?? []).filter((doc) => doc.status === "deleted").length,
    recordsByStatus: [...statusMap.entries()].map(([status, count]) => ({ status, count })),
    recordsByProfessional: [...professionalMap.entries()].map(([professional, count]) => ({
      professional,
      count,
    })),
  };
}

function emptyReports(): MedicalRecordReports {
  return {
    totalRecords: 0,
    completedRecords: 0,
    draftRecords: 0,
    issuedDocuments: 0,
    deletedDocuments: 0,
    recordsByStatus: [],
    recordsByProfessional: [],
  };
}

export async function listPatientMedicalOverviews(
  clinicId: string | null | undefined,
): Promise<PatientMedicalOverview[]> {
  const records = await listMedicalRecords(clinicId);
  if (!clinicId || !records.length) return [];

  const patientIds = [...new Set(records.map((record) => record.patient_id))];
  const admin = createSupabaseAdminClient();
  const { data: comments } = await admin
    .from("patient_clinical_comments")
    .select(
      "id, patient_id, encounter_id, medical_record_id, professional_member_id, comment, visibility, created_at, created_by",
    )
    .eq("clinic_id", clinicId)
    .in("patient_id", patientIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const authorIds = [...new Set((comments ?? []).map((comment) => comment.created_by).filter(Boolean))];
  const { data: authors } = authorIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", authorIds)
    : { data: [] };
  const authorMap = new Map((authors ?? []).map((item) => [item.id, item]));
  const byPatient = new Map<string, PatientMedicalOverview>();

  for (const record of records) {
    const existing = byPatient.get(record.patient_id);
    if (existing) {
      existing.records.push(record);
      continue;
    }
    byPatient.set(record.patient_id, {
      patient: record.patient
        ? { ...record.patient, phone: null }
        : { id: record.patient_id, full_name: "Paciente", social_name: null, phone: null },
      records: [record],
      comments: [],
    });
  }

  for (const comment of (comments ?? []) as PatientClinicalComment[]) {
    const overview = byPatient.get(comment.patient_id);
    if (!overview) continue;
    overview.comments.push({
      ...comment,
      author: comment.created_by ? authorMap.get(comment.created_by) ?? null : null,
    });
  }

  return [...byPatient.values()];
}

export async function getMedicalLgpdAcknowledgement(clinicId: string | null | undefined) {
  if (!clinicId) return null;
  const access = await getClinicAuthorization(clinicId);
  if (!access.userId) return null;

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("medical_lgpd_acknowledgements")
    .select("id, version, accepted_at")
    .eq("clinic_id", clinicId)
    .eq("user_id", access.userId)
    .eq("version", "2026-06-clinical-data-v1")
    .maybeSingle<{ id: string; version: string; accepted_at: string }>();

  return data ?? null;
}
