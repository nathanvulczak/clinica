import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ClinicBrandingSettings } from "@/types/domain";

export type ClinicDocumentBranding = {
  clinic_id: string;
  trade_name: string;
  legal_name: string | null;
  document: string | null;
  contact: string | null;
  location: string | null;
  primary_color: string;
  header_text: string | null;
  footer_text: string | null;
  logo_url: string | null;
  show_legal_name: boolean;
  show_document: boolean;
  show_contact: boolean;
};

export function escapeDocumentHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function getClinicDocumentBranding(
  clinicId: string,
  options: { embedLogo?: boolean } = {},
): Promise<ClinicDocumentBranding> {
  const admin = createSupabaseAdminClient();
  const [{ data: clinic }, { data: settings }] = await Promise.all([
    admin.from("clinics").select("id, trade_name, legal_name, document, phone, email, city, state").eq("id", clinicId).maybeSingle(),
    admin.from("clinic_branding_settings").select("*").eq("clinic_id", clinicId).is("deleted_at", null).maybeSingle<ClinicBrandingSettings>(),
  ]);
  const logoPath = settings?.horizontal_logo_path ?? settings?.compact_logo_path ?? null;
  let logoUrl: string | null = null;
  if (logoPath && options.embedLogo) {
    const { data } = await admin.storage.from("clinic-branding").download(logoPath);
    if (data) logoUrl = `data:${data.type || "image/webp"};base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}`;
  } else if (logoPath) {
    const { data } = await admin.storage.from("clinic-branding").createSignedUrl(logoPath, 60 * 30);
    logoUrl = data?.signedUrl ?? null;
  }

  return {
    clinic_id: clinicId,
    trade_name: clinic?.trade_name ?? "Clínica",
    legal_name: clinic?.legal_name ?? null,
    document: clinic?.document ?? null,
    contact: [clinic?.phone, clinic?.email].filter(Boolean).join(" | ") || null,
    location: [clinic?.city, clinic?.state].filter(Boolean).join(" / ") || null,
    primary_color: settings?.primary_color ?? "#0f766e",
    header_text: settings?.document_header ?? null,
    footer_text: settings?.document_footer ?? null,
    logo_url: logoUrl,
    show_legal_name: settings?.show_legal_name ?? true,
    show_document: settings?.show_document ?? true,
    show_contact: settings?.show_contact ?? true,
  };
}

export function renderClinicDocumentHeader(branding: ClinicDocumentBranding, title: string) {
  const details = [
    branding.show_legal_name ? branding.legal_name : null,
    branding.show_document && branding.document ? `CNPJ/CPF: ${branding.document}` : null,
    branding.show_contact ? branding.contact : null,
    branding.location,
  ].filter(Boolean);
  return `<header class="clinic-document-header" style="--brand:${escapeDocumentHtml(branding.primary_color)}">
    <div class="clinic-brand-block">
      ${branding.logo_url ? `<img src="${escapeDocumentHtml(branding.logo_url)}" alt="" />` : `<div class="clinic-brand-name">${escapeDocumentHtml(branding.trade_name)}</div>`}
      <div class="clinic-brand-meta"><strong>${escapeDocumentHtml(branding.trade_name)}</strong>${branding.header_text ? `<span>${escapeDocumentHtml(branding.header_text)}</span>` : ""}${details.map((item) => `<span>${escapeDocumentHtml(item)}</span>`).join("")}</div>
    </div>
    <div class="clinic-document-title">${escapeDocumentHtml(title)}</div>
  </header>`;
}

export function renderClinicDocumentFooter(branding: ClinicDocumentBranding, traceText: string) {
  return `<footer class="clinic-document-footer"><span>${escapeDocumentHtml(branding.footer_text ?? traceText)}</span><span>CliniCore | documento rastreável</span></footer>`;
}

export const clinicDocumentCss = `
  .clinic-document-header { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; padding-bottom:12px; border-bottom:2px solid var(--brand); }
  .clinic-brand-block { display:flex; align-items:center; gap:12px; min-width:0; }
  .clinic-brand-block img { display:block; width:auto; max-width:170px; height:48px; object-fit:contain; object-position:left center; }
  .clinic-brand-name { color:var(--brand); font-size:18px; font-weight:700; }
  .clinic-brand-meta { display:grid; gap:1px; min-width:0; font-size:9px; color:#64748b; }
  .clinic-brand-meta strong { color:#0f172a; font-size:11px; }
  .clinic-document-title { color:#0f172a; font-size:15px; font-weight:700; text-align:right; }
  .clinic-document-footer { display:flex; justify-content:space-between; gap:12px; margin-top:22px; padding-top:9px; border-top:1px solid #cbd5e1; color:#64748b; font-size:8.5px; }
`;
