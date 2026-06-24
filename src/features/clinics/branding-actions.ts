"use server";

import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { getActiveClinicContext } from "@/features/clinics/context";
import { clinicBrandingSchema } from "@/features/clinics/branding-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import { logAuditEvent } from "@/services/audit/audit-service";
import type { ClinicBrandingSettings } from "@/types/domain";

export type ClinicBrandingActionState = { error?: string; success?: string };

const BUCKET = "clinic-branding";
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VARIANTS = {
  horizontal: { field: "horizontal_logo_file", column: "horizontal_logo_path", minWidth: 400, minHeight: 100, minRatio: 1.8, maxRatio: 6, width: 1200, height: 360 },
  compact: { field: "compact_logo_file", column: "compact_logo_path", minWidth: 200, minHeight: 200, minRatio: 0.75, maxRatio: 1.33, width: 512, height: 512 },
  vertical: { field: "vertical_logo_file", column: "vertical_logo_path", minWidth: 220, minHeight: 360, minRatio: 0.45, maxRatio: 1.3, width: 640, height: 900 },
} as const;

async function prepareLogo(file: File, variant: keyof typeof VARIANTS) {
  if (file.size > MAX_FILE_SIZE) throw new Error("Cada imagem deve ter no máximo 2 MB.");
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Use somente imagens JPG, PNG ou WEBP.");
  const input = Buffer.from(await file.arrayBuffer());
  const image = sharp(input, { failOn: "error" });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Não foi possível validar as dimensões da imagem.");
  const config = VARIANTS[variant];
  const ratio = metadata.width / metadata.height;
  if (metadata.width < config.minWidth || metadata.height < config.minHeight || ratio < config.minRatio || ratio > config.maxRatio) {
    const guidance = variant === "horizontal" ? "uma imagem horizontal" : variant === "compact" ? "uma imagem quadrada" : "uma imagem vertical";
    throw new Error(`A marca ${variant === "compact" ? "compacta" : variant} precisa ser ${guidance}, com boa resolução e sem recortes.`);
  }
  return image.rotate().resize(config.width, config.height, { fit: "inside", withoutEnlargement: true }).webp({ quality: 88, effort: 4 }).toBuffer();
}

async function getBrandingContext() {
  const [{ activeClinic }, supabase] = await Promise.all([getActiveClinicContext(), createSupabaseServerClient()]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !activeClinic) return { error: "Sessão ou clínica ativa não identificada." } as const;
  const authorization = await getClinicAuthorization(activeClinic.id);
  if (!authorization.can("clinics", "edit")) return { error: "Você não possui permissão para alterar a identidade da clínica." } as const;
  return { activeClinic, user, admin: createSupabaseAdminClient() };
}

export async function uploadClinicBrandingLogoAction(formData: FormData): Promise<ClinicBrandingActionState> {
  const variantValue = String(formData.get("variant") ?? "");
  if (!(variantValue in VARIANTS)) return { error: "Tipo de marca não identificado." };
  const variant = variantValue as keyof typeof VARIANTS;
  const file = formData.get("logo_file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione uma imagem para enviar." };

  const context = await getBrandingContext();
  if ("error" in context) return { error: context.error };
  const { activeClinic, user, admin } = context;
  const config = VARIANTS[variant];
  const { data: previous } = await admin
    .from("clinic_branding_settings")
    .select("*")
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<ClinicBrandingSettings>();

  let optimized: Buffer;
  try {
    optimized = await prepareLogo(file, variant);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível processar a imagem." };
  }

  const path = `${activeClinic.id}/${variant}-${crypto.randomUUID()}.webp`;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, optimized, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) return { error: "Não foi possível armazenar a imagem. Tente novamente." };

  const payload = {
    clinic_id: activeClinic.id,
    [config.column]: path,
    deleted_at: null,
    updated_by: user.id,
    ...(previous ? {} : { created_by: user.id }),
  };
  const { error } = await admin.from("clinic_branding_settings").upsert(payload, { onConflict: "clinic_id" });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "A imagem foi processada, mas não foi possível vinculá-la à clínica." };
  }

  const oldPath = previous?.[config.column];
  if (oldPath) await admin.storage.from(BUCKET).remove([oldPath]);
  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "clinic_branding_logo_uploaded",
    module: "clinics",
    recordTable: "clinic_branding_settings",
    recordId: previous?.id,
    oldValues: oldPath ? { [config.column]: oldPath } : null,
    newValues: { variant, [config.column]: path },
    level: "security",
    notes: `Marca ${variant} atualizada e otimizada.`,
  });
  revalidatePath("/clinicas/identidade");
  return { success: `Marca ${variant === "compact" ? "compacta" : variant} enviada.` };
}

export async function saveClinicBrandingAction(
  _state: ClinicBrandingActionState,
  formData: FormData,
): Promise<ClinicBrandingActionState> {
  const parsed = clinicBrandingSchema.safeParse({
    primary_color: formData.get("primary_color"),
    document_header: String(formData.get("document_header") ?? "") || undefined,
    document_footer: String(formData.get("document_footer") ?? "") || undefined,
    show_legal_name: formData.get("show_legal_name") === "on",
    show_document: formData.get("show_document") === "on",
    show_contact: formData.get("show_contact") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados de identidade inválidos." };

  const context = await getBrandingContext();
  if ("error" in context) return { error: context.error };
  const { activeClinic, user, admin } = context;
  const { data: previous } = await admin
    .from("clinic_branding_settings")
    .select("*")
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<ClinicBrandingSettings>();
  const payload = {
    clinic_id: activeClinic.id,
    ...parsed.data,
    document_header: parsed.data.document_header || null,
    document_footer: parsed.data.document_footer || null,
    deleted_at: null,
    updated_by: user.id,
    ...(previous ? {} : { created_by: user.id }),
  };
  const { error } = await admin.from("clinic_branding_settings").upsert(payload, { onConflict: "clinic_id" });
  if (error) return { error: "Não foi possível salvar a identidade documental da clínica." };

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "clinic_branding_updated",
    module: "clinics",
    recordTable: "clinic_branding_settings",
    recordId: previous?.id,
    oldValues: previous,
    newValues: payload,
    level: "security",
    notes: "Identidade visual e padrão de documentos atualizados.",
  });
  revalidatePath("/clinicas/identidade");
  revalidatePath("/prontuarios", "layout");
  return { success: "Identidade da clínica salva e pronta para os documentos." };
}
