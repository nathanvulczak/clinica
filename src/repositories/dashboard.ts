import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DASHBOARD_WIDGET_IDS,
  DEFAULT_DASHBOARD_LAYOUT,
  DEFAULT_DASHBOARD_WIDGETS,
  type DashboardLayoutItem,
  type DashboardPreferences,
  type DashboardWidgetId,
} from "@/features/dashboard/types";

type DashboardPreferencesRow = {
  visible_widgets: string[];
  layout: unknown;
};

function isWidgetId(value: string): value is DashboardWidgetId {
  return (DASHBOARD_WIDGET_IDS as readonly string[]).includes(value);
}

function normalizeLayout(value: unknown): DashboardLayoutItem[] {
  if (!Array.isArray(value)) return DEFAULT_DASHBOARD_LAYOUT;

  const items = value.filter((item): item is DashboardLayoutItem => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<DashboardLayoutItem>;
    return Boolean(
      candidate.i &&
        isWidgetId(candidate.i) &&
        Number.isFinite(candidate.x) &&
        Number.isFinite(candidate.y) &&
        Number.isFinite(candidate.w) &&
        Number.isFinite(candidate.h),
    );
  });

  return items.length ? items : DEFAULT_DASHBOARD_LAYOUT;
}

export async function getDashboardPreferences(clinicId?: string | null): Promise<DashboardPreferences> {
  if (!clinicId) {
    return { visibleWidgets: DEFAULT_DASHBOARD_WIDGETS, layout: DEFAULT_DASHBOARD_LAYOUT };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("dashboard_preferences")
    .select("visible_widgets, layout")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle<DashboardPreferencesRow>();

  if (error || !data) {
    return { visibleWidgets: DEFAULT_DASHBOARD_WIDGETS, layout: DEFAULT_DASHBOARD_LAYOUT };
  }

  const visibleWidgets = data.visible_widgets.filter(isWidgetId);
  return {
    visibleWidgets: visibleWidgets.length ? visibleWidgets : DEFAULT_DASHBOARD_WIDGETS,
    layout: normalizeLayout(data.layout),
  };
}
