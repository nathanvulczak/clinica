import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";

export type ClinicalProtocolStep = {
  key: string;
  title: string;
  kind: "check_in" | "nursing" | "clinical_form" | "checklist" | "billing" | "document";
  position: number;
  required_fields?: string[];
  required_documents?: string[];
  responsible_roles?: string[];
  terminal?: boolean;
};

export type ClinicalProtocolDefinition = { steps: ClinicalProtocolStep[] };

export type ClinicalProtocol = {
  id: string;
  clinic_id: string;
  name: string;
  description: string | null;
  specialty_slug: string | null;
  service_id: string | null;
  professional_member_id: string | null;
  active: boolean;
  updated_at: string;
  latest_version: {
    id: string;
    version_number: number;
    status: "draft" | "published" | "archived";
    definition: ClinicalProtocolDefinition;
    change_summary: string | null;
    published_at: string | null;
  } | null;
};

function normalizeDefinition(value: unknown): ClinicalProtocolDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { steps: [] };
  const root = value as { steps?: unknown };
  const steps = Array.isArray(root.steps)
    ? root.steps.flatMap((item, index): ClinicalProtocolStep[] => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const step = item as Record<string, unknown>;
        if (typeof step.key !== "string" || typeof step.title !== "string") return [];
        const kind = ["check_in", "nursing", "clinical_form", "checklist", "billing", "document"].includes(String(step.kind))
          ? (step.kind as ClinicalProtocolStep["kind"])
          : "checklist";
        return [{
          key: step.key,
          title: step.title,
          kind,
          position: typeof step.position === "number" ? step.position : (index + 1) * 10,
          required_fields: Array.isArray(step.required_fields) ? step.required_fields.filter((field): field is string => typeof field === "string") : [],
          required_documents: Array.isArray(step.required_documents) ? step.required_documents.filter((document): document is string => typeof document === "string") : [],
          responsible_roles: Array.isArray(step.responsible_roles) ? step.responsible_roles.filter((role): role is string => typeof role === "string") : [],
          terminal: step.terminal === true,
        }];
      })
    : [];
  return { steps: steps.sort((a, b) => a.position - b.position) };
}

export async function listClinicalProtocols(clinicId: string | null | undefined): Promise<ClinicalProtocol[]> {
  if (!clinicId) return [];
  const authorization = await getClinicAuthorization(clinicId);
  if (!authorization.can("medical_records", "view")) return [];

  const admin = createSupabaseAdminClient();
  const [{ data: protocols }, { data: versions }] = await Promise.all([
    admin
      .from("clinical_protocols")
      .select("id, clinic_id, name, description, specialty_slug, service_id, professional_member_id, active, updated_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("active", { ascending: false })
      .order("name"),
    admin
      .from("clinical_protocol_versions")
      .select("id, protocol_id, version_number, status, definition, change_summary, published_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("version_number", { ascending: false }),
  ]);

  const versionMap = new Map<string, ClinicalProtocol["latest_version"]>();
  for (const row of versions ?? []) {
    if (!versionMap.has(row.protocol_id)) {
      versionMap.set(row.protocol_id, {
        id: row.id,
        version_number: row.version_number,
        status: row.status,
        definition: normalizeDefinition(row.definition),
        change_summary: row.change_summary,
        published_at: row.published_at,
      });
    }
  }

  return (protocols ?? []).map((protocol) => ({ ...protocol, latest_version: versionMap.get(protocol.id) ?? null })) as ClinicalProtocol[];
}
