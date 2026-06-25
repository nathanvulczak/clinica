import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import type { DocumentTemplate, DocumentTemplateType } from "@/types/domain";

export type DocumentsAccess = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canManage: boolean;
  canExport: boolean;
};

export type GeneratedDocumentSummary = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  template: { name: string; template_type: DocumentTemplateType } | null;
  patient: { full_name: string; social_name: string | null } | null;
};

export type DocumentsWorkspace = {
  access: DocumentsAccess;
  templates: DocumentTemplate[];
  generatedDocuments: GeneratedDocumentSummary[];
};

export async function getDocumentsAccess(clinicId?: string | null): Promise<DocumentsAccess> {
  const authorization = await getClinicAuthorization(clinicId ?? undefined);

  return {
    canView: authorization.can("documents", "view"),
    canCreate: authorization.can("documents", "create"),
    canEdit: authorization.can("documents", "edit"),
    canManage: authorization.can("documents", "manage"),
    canExport: authorization.can("documents", "export"),
  };
}

export async function getDocumentsWorkspace(clinicId?: string | null): Promise<DocumentsWorkspace> {
  const access = await getDocumentsAccess(clinicId);
  const empty: DocumentsWorkspace = { access, templates: [], generatedDocuments: [] };
  if (!clinicId || !access.canView) return empty;

  const admin = createSupabaseAdminClient();
  const [{ data: templates }, { data: generatedDocuments }] = await Promise.all([
    admin
      .from("document_templates")
      .select("id, clinic_id, template_type, name, description, legal_basis, content, accepted_file_url, accepted_file_name, active, version_number, created_at, updated_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("template_type")
      .order("name"),
    admin
      .from("generated_documents")
      .select("id, title, status, created_at, template:document_templates(name, template_type), patient:patients(full_name, social_name)")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  return {
    access,
    templates: (templates ?? []) as DocumentTemplate[],
    generatedDocuments: (generatedDocuments ?? []) as unknown as GeneratedDocumentSummary[],
  };
}
