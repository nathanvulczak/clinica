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

  const [{ activeClinic }, supabase] = await Promise.all([getActiveClinicContext(), createSupabaseServerClient()]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !activeClinic) return { error: "Sessão ou clínica ativa não identificada." };
  const authorization = await getClinicAuthorization(activeClinic.id);
  if (!authorization.can("clinics", "edit")) return { error: "Você não possui permissão para alterar a identidade da clínica." };

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("clinic_branding_settings")
    .select("*")
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<ClinicBrandingSettings>();
  const logoPaths: Record<string, string | null> = {
    horizontal_logo_path: previous?.horizontal_logo_path ?? null,
    compact_logo_path: previous?.compact_logo_path ?? null,
    vertical_logo_path: previous?.vertical_logo_path ?? null,
  };
  const oldPaths: string[] = [];

  try {
    for (const [variant, config] of Object.entries(VARIANTS) as Array<[keyof typeof VARIANTS, (typeof VARIANTS)[keyof typeof VARIANTS]]>) {
      const file = formData.get(config.field);
      if (!(file instanceof File) || file.size === 0) continue;
      const optimized = await prepareLogo(file, variant);
      const path = `${activeClinic.id}/${variant}-${crypto.randomUUID()}.webp`;
      const { error } = await admin.storage.from(BUCKET).upload(path, optimized, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (error) throw new Error("Não foi possível armazenar uma das imagens. Tente novamente.");
      const oldPath = logoPaths[config.column];
      if (oldPath) oldPaths.push(oldPath);
      logoPaths[config.column] = path;
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível processar as imagens." };
  }

  const payload = {
    clinic_id: activeClinic.id,
    ...parsed.data,
    document_header: parsed.data.document_header || null,
    document_footer: parsed.data.document_footer || null,
    ...logoPaths,
    deleted_at: null,
    updated_by: user.id,
    ...(previous ? {} : { created_by: user.id }),
  };
  const { error } = await admin.from("clinic_branding_settings").upsert(payload, { onConflict: "clinic_id" });
  if (error) return { error: "Não foi possível salvar a identidade documental da clínica." };
  if (oldPaths.length) await admin.storage.from(BUCKET).remove(oldPaths);

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
