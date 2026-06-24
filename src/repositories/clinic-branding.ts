import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ClinicBrandingSettings } from "@/types/domain";

export type ClinicBrandingView = ClinicBrandingSettings & {
  horizontal_logo_url: string | null;
  compact_logo_url: string | null;
  vertical_logo_url: string | null;
};

const defaultBranding = (clinicId: string): ClinicBrandingSettings => ({
  id: "",
  clinic_id: clinicId,
  primary_color: "#0f766e",
  document_header: null,
  document_footer: null,
  horizontal_logo_path: null,
  compact_logo_path: null,
  vertical_logo_path: null,
  show_legal_name: true,
  show_document: true,
  show_contact: true,
  created_at: "",
  updated_at: "",
});

async function signedUrl(path: string | null) {
  if (!path) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from("clinic-branding").createSignedUrl(path, 60 * 30);
  return error ? null : data.signedUrl;
}

export async function getClinicBrandingSettings(clinicId: string): Promise<ClinicBrandingView> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("clinic_branding_settings")
    .select("*")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle<ClinicBrandingSettings>();
  const branding = data ?? defaultBranding(clinicId);
  const [horizontal, compact, vertical] = await Promise.all([
    signedUrl(branding.horizontal_logo_path),
    signedUrl(branding.compact_logo_path),
    signedUrl(branding.vertical_logo_path),
  ]);

  return {
    ...branding,
    horizontal_logo_url: horizontal,
    compact_logo_url: compact,
    vertical_logo_url: vertical,
  };
}
