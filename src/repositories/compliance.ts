import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";

export type ComplianceSettings = {
  id: string;
  clinic_id: string;
  retention_days: number;
  support_email: string | null;
  incident_email: string | null;
  responsible_name: string | null;
  privacy_notice_version: string;
};

export type DataSubjectRequest = {
  id: string;
  request_type: "access" | "export" | "rectification" | "deletion" | "restriction";
  status: "open" | "in_review" | "completed" | "rejected";
  requester_name: string;
  requester_contact: string;
  description: string | null;
  resolution_notes: string | null;
  created_at: string;
  handled_at: string | null;
};

export async function getComplianceWorkspace(clinicId: string | null | undefined) {
  if (!clinicId) return { settings: null, requests: [] as DataSubjectRequest[] };
  const authorization = await getClinicAuthorization(clinicId);
  if (!authorization.can("clinics", "view") && !authorization.can("audit", "view")) return { settings: null, requests: [] as DataSubjectRequest[] };
  const admin = createSupabaseAdminClient();
  const [{ data: settings }, { data: requests }] = await Promise.all([
    admin.from("clinic_compliance_settings").select("id, clinic_id, retention_days, support_email, incident_email, responsible_name, privacy_notice_version").eq("clinic_id", clinicId).is("deleted_at", null).maybeSingle(),
    admin.from("data_subject_requests").select("id, request_type, status, requester_name, requester_contact, description, resolution_notes, created_at, handled_at").eq("clinic_id", clinicId).is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
  ]);
  return { settings: settings as ComplianceSettings | null, requests: (requests ?? []) as DataSubjectRequest[] };
}
