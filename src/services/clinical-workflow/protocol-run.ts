import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProtocolStep = {
  key?: unknown;
  kind?: unknown;
  position?: unknown;
};

function stepsFromSnapshot(value: unknown): ProtocolStep[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const steps = (value as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return [];
  return steps.filter((step): step is ProtocolStep => Boolean(step && typeof step === "object" && !Array.isArray(step) && typeof (step as ProtocolStep).key === "string"));
}

export async function advanceProtocolForEncounter({
  clinicId,
  encounterId,
  preferredKind,
}: {
  clinicId: string;
  encounterId: string;
  preferredKind: string;
}) {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const { data: run } = await admin
    .from("clinical_protocol_runs")
    .select("id, current_step_key, version_snapshot")
    .eq("clinic_id", clinicId)
    .eq("encounter_id", encounterId)
    .eq("status", "in_progress")
    .is("deleted_at", null)
    .maybeSingle();

  if (!run) return { ok: true, changed: false };

  const steps = stepsFromSnapshot(run.version_snapshot)
    .map((step, index) => ({
      ...step,
      key: String(step.key),
      kind: String(step.kind ?? "checklist"),
      position: typeof step.position === "number" ? step.position : (index + 1) * 10,
    }))
    .sort((a, b) => a.position - b.position);
  const currentPosition = steps.find((step) => step.key === run.current_step_key)?.position ?? 0;
  const nextSteps = steps.filter((step) => step.position > currentPosition);
  const target = nextSteps.find((step) => step.kind === preferredKind) ?? nextSteps[0];
  if (!target || target.key === run.current_step_key) return { ok: true, changed: false };

  const { error } = await supabase.rpc("advance_clinical_protocol_run", {
    run_uuid: run.id,
    target_step_key: target.key,
    transition_reason: null,
  });

  return error ? { ok: false, changed: false, error: error.message } : { ok: true, changed: true };
}
