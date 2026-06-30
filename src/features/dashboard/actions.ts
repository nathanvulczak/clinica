"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveClinicContext } from "@/features/clinics/context";
import { DASHBOARD_WIDGET_IDS } from "@/features/dashboard/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/services/audit/audit-service";

const widgetSchema = z.enum(DASHBOARD_WIDGET_IDS);
const layoutItemSchema = z.object({
  i: widgetSchema,
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(500),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(2).max(24),
  minW: z.number().int().min(1).max(12).optional(),
  minH: z.number().int().min(1).max(24).optional(),
  maxW: z.number().int().min(1).max(12).optional(),
  maxH: z.number().int().min(1).max(24).optional(),
});

const dashboardPreferencesSchema = z.object({
  visibleWidgets: z.array(widgetSchema).max(DASHBOARD_WIDGET_IDS.length),
  layout: z.array(layoutItemSchema).max(DASHBOARD_WIDGET_IDS.length),
});

export type DashboardActionState = { success?: string; error?: string };

export async function saveDashboardPreferencesAction(input: unknown): Promise<DashboardActionState> {
  const parsed = dashboardPreferencesSchema.safeParse(input);
  if (!parsed.success) return { error: "A organização do painel é inválida." };

  const [{ activeClinic }, supabase] = await Promise.all([
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Sua sessão expirou. Entre novamente." };
  if (!activeClinic) return { error: "Selecione uma clínica antes de personalizar o painel." };

  const payload = {
    clinic_id: activeClinic.id,
    user_id: user.id,
    visible_widgets: [...new Set(parsed.data.visibleWidgets)],
    layout: parsed.data.layout,
    deleted_at: null,
    updated_by: user.id,
  };
  const { data: previous } = await supabase
    .from("dashboard_preferences")
    .select("visible_widgets, layout")
    .eq("clinic_id", activeClinic.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const { error } = await supabase.from("dashboard_preferences").upsert(
    {
      ...payload,
      created_by: user.id,
    },
    { onConflict: "clinic_id,user_id" },
  );

  if (error) return { error: "Não foi possível salvar a organização do painel." };

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "dashboard_preferences_updated",
    module: "clinics",
    recordTable: "dashboard_preferences",
    oldValues: previous,
    newValues: payload,
    notes: "Organização e visibilidade dos cards do painel atualizadas.",
  });

  revalidatePath("/dashboard");
  return { success: "Painel personalizado e salvo." };
}
