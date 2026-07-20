import "server-only";

import {
  normalizeSpecialtySlug,
  parseClinicalFormDefinition,
  type ClinicalFormDefinition,
  type ClinicalFormResponseMetadata,
  type ClinicalFormResponses,
} from "@/features/medical-records/clinical-form-schema";
import type { ClinicalWorkspaceMode } from "@/config/clinical-workspaces";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClinicalWorkflowAccess } from "@/repositories/clinical-workflow";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";

export type ClinicalFormTemplate = {
  id: string;
  clinic_id: string;
  specialty_slug: string;
  name: string;
  description: string | null;
  icon_key: string;
  version_number: number;
  definition: ClinicalFormDefinition;
  is_system: boolean;
  active: boolean;
  sort_order: number;
};

export type ClinicalFormInstance = {
  id: string;
  template_id: string;
  template_version: number;
  template_snapshot: ClinicalFormDefinition;
  responses: ClinicalFormResponses;
  status: "draft" | "completed" | "corrected";
  revision_number: number;
  correction_reason: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type ClinicalFormWorkspace = {
  templates: ClinicalFormTemplate[];
  selectedTemplateId: string | null;
  selectionSource: "existing" | "assignment" | "professional" | "clinic_default" | "fallback";
  professionalSpecialty: string | null;
  allowTemplateChoice: boolean;
  preferences: {
    mode: ClinicalWorkspaceMode;
    showVisualMap: boolean;
  };
  prefillResponses: ClinicalFormResponses;
  instance: ClinicalFormInstance | null;
};

type TemplateRow = Omit<ClinicalFormTemplate, "definition"> & { definition: unknown };
type InstanceRow = Omit<ClinicalFormInstance, "template_snapshot" | "responses"> & {
  template_snapshot: unknown;
  responses: unknown;
};

function normalizeTemplate(row: TemplateRow): ClinicalFormTemplate {
  return { ...row, definition: parseClinicalFormDefinition(row.definition) };
}

export async function getClinicalFormTemplates(clinicId: string | null | undefined) {
  if (!clinicId) return [];
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("clinical_form_templates")
    .select("id, clinic_id, specialty_slug, name, description, icon_key, version_number, definition, is_system, active, sort_order")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("name");
  return ((data ?? []) as TemplateRow[]).map(normalizeTemplate);
}

export async function getEncounterClinicalFormWorkspace(
  clinicId: string | null | undefined,
  encounterId: string,
): Promise<ClinicalFormWorkspace | null> {
  if (!clinicId) return null;
  const access = await getClinicalWorkflowAccess(clinicId);
  if (!access.canViewAll && !access.canViewOwn) return null;

  const admin = createSupabaseAdminClient();
  const authorization = await getClinicAuthorization(clinicId);
  const { data: encounter } = await admin
    .from("clinical_encounters")
    .select("id, appointment_id, professional_member_id")
    .eq("id", encounterId)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; appointment_id: string; professional_member_id: string }>();
  if (!encounter) return null;
  if (!access.canViewAll && encounter.professional_member_id !== access.currentMemberId) return null;

  const [
    templates,
    { data: instance },
    { data: appointment },
    { data: professionalProfile },
    { data: preferences },
    { data: assignments },
    { data: userPreferences },
    { data: nursingAssessment },
    { data: fieldMappings },
  ] = await Promise.all([
    getClinicalFormTemplates(clinicId),
    admin
      .from("clinical_form_instances")
      .select("id, template_id, template_version, template_snapshot, responses, status, revision_number, correction_reason, completed_at, updated_at")
      .eq("encounter_id", encounterId)
      .eq("is_current", true)
      .is("deleted_at", null)
      .maybeSingle<InstanceRow>(),
    admin
      .from("appointments")
      .select("service_id")
      .eq("id", encounter.appointment_id)
      .maybeSingle<{ service_id: string | null }>(),
    admin
      .from("clinic_professional_profiles")
      .select("specialty")
      .eq("clinic_id", clinicId)
      .eq("professional_member_id", encounter.professional_member_id)
      .is("deleted_at", null)
      .maybeSingle<{ specialty: string | null }>(),
    admin
      .from("medical_record_preferences")
      .select("default_specialty_slug, allow_professional_template_choice")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .maybeSingle<{ default_specialty_slug: string | null; allow_professional_template_choice: boolean | null }>(),
    admin
      .from("clinical_form_assignments")
      .select("template_id, professional_member_id, service_id, priority")
      .eq("clinic_id", clinicId)
      .eq("active", true)
      .is("deleted_at", null)
      .order("priority"),
    authorization.userId
      ? admin
          .from("module_user_preferences")
          .select("preferences")
          .eq("clinic_id", clinicId)
          .eq("user_id", authorization.userId)
          .eq("module_key", "medical_records")
          .is("deleted_at", null)
          .maybeSingle<{ preferences: Record<string, unknown> }>()
      : Promise.resolve({ data: null }),
    admin
      .from("nursing_assessments")
      .select("id, chief_complaint, allergies, current_medications, comorbidities, systolic_bp, diastolic_bp, heart_rate, respiratory_rate, temperature_c, oxygen_saturation, capillary_glucose, weight_kg, height_cm, bmi, completed_at, created_at, performed_by")
      .eq("encounter_id", encounterId)
      .is("deleted_at", null)
      .maybeSingle(),
    admin
      .from("clinical_field_mappings")
      .select("source_field, target_field, strategy")
      .eq("clinic_id", clinicId)
      .eq("source_module", "nursing_assessments")
      .eq("target_module", "clinical_form")
      .eq("active", true)
      .is("deleted_at", null),
  ]);

  const activeTemplates = templates.filter((template) => template.active);
  const availableTemplates = templates.filter(
    (template) => template.active || template.id === instance?.template_id,
  );
  let selectedTemplateId = instance?.template_id ?? null;
  let selectionSource: ClinicalFormWorkspace["selectionSource"] = "existing";

  if (!selectedTemplateId) {
    const assignment = (assignments ?? []).find((item) => {
      const professionalMatches = !item.professional_member_id || item.professional_member_id === encounter.professional_member_id;
      const serviceMatches = !item.service_id || item.service_id === appointment?.service_id;
      return professionalMatches && serviceMatches && (item.professional_member_id || item.service_id);
    });
    if (assignment && activeTemplates.some((template) => template.id === assignment.template_id)) {
      selectedTemplateId = assignment.template_id;
      selectionSource = "assignment";
    }
  }

  if (!selectedTemplateId && professionalProfile?.specialty) {
    const specialtySlug = normalizeSpecialtySlug(professionalProfile.specialty);
    selectedTemplateId = activeTemplates.find((template) => template.specialty_slug === specialtySlug)?.id ?? null;
    if (selectedTemplateId) selectionSource = "professional";
  }

  if (!selectedTemplateId) {
    selectedTemplateId = activeTemplates.find(
      (template) => template.specialty_slug === (preferences?.default_specialty_slug || "general_medicine"),
    )?.id ?? null;
    if (selectedTemplateId) selectionSource = "clinic_default";
  }

  if (!selectedTemplateId) {
    selectedTemplateId = activeTemplates[0]?.id ?? null;
    selectionSource = "fallback";
  }

  const selectedTemplate = availableTemplates.find((template) => template.id === selectedTemplateId) ?? null;
  const selectedFieldKeys = new Set(
    selectedTemplate?.definition.sections.flatMap((section) => section.fields.map((field) => field.key)) ?? [],
  );
  const nursingValues = (nursingAssessment ?? {}) as Record<string, unknown>;
  const prefillResponses: ClinicalFormResponses = {};
  const provenance: Record<string, ClinicalFormResponseMetadata> = {};
  const existingResponses = instance?.responses && typeof instance.responses === "object" && !Array.isArray(instance.responses)
    ? (instance.responses as ClinicalFormResponses)
    : {};
  const mergedResponses: ClinicalFormResponses = { ...existingResponses };

  for (const mapping of fieldMappings ?? []) {
    if (!selectedFieldKeys.has(mapping.target_field)) continue;
    const sourceValue = nursingValues[mapping.source_field];
    if (sourceValue === null || sourceValue === undefined || sourceValue === "") continue;
    const targetHasValue = mergedResponses[mapping.target_field] !== undefined
      && mergedResponses[mapping.target_field] !== null
      && mergedResponses[mapping.target_field] !== "";
    if (targetHasValue && mapping.strategy === "fill_empty") continue;
    if (typeof sourceValue !== "string" && typeof sourceValue !== "number" && typeof sourceValue !== "boolean") continue;
    if (!targetHasValue) {
      mergedResponses[mapping.target_field] = sourceValue;
      prefillResponses[mapping.target_field] = sourceValue;
      provenance[mapping.target_field] = {
        source: "nursing_assessment",
        source_record_id: String(nursingValues.id ?? ""),
        captured_at: String(nursingValues.completed_at ?? nursingValues.created_at ?? ""),
        label: "Pré-consulta de enfermagem",
      };
    }
  }

  if (Object.keys(provenance).length) {
    const currentProvenance = mergedResponses._provenance && typeof mergedResponses._provenance === "object" && !Array.isArray(mergedResponses._provenance)
      ? (mergedResponses._provenance as Record<string, ClinicalFormResponseMetadata>)
      : {};
    mergedResponses._provenance = { ...currentProvenance, ...provenance };
    prefillResponses._provenance = { ...provenance };
  }

  const normalizedInstance = instance
    ? {
        ...instance,
        template_snapshot: parseClinicalFormDefinition(instance.template_snapshot),
        responses: mergedResponses,
      }
    : null;

  const storedPreferences = userPreferences?.preferences ?? {};
  const workspaceMode: ClinicalWorkspaceMode = storedPreferences.mode === "compact" ? "compact" : "guided";
  const showVisualMap = storedPreferences.showVisualMap !== false;

  return {
    templates: availableTemplates,
    selectedTemplateId,
    selectionSource,
    professionalSpecialty: professionalProfile?.specialty ?? null,
    allowTemplateChoice: preferences?.allow_professional_template_choice ?? true,
    preferences: { mode: workspaceMode, showVisualMap },
    prefillResponses,
    instance: normalizedInstance,
  };
}
