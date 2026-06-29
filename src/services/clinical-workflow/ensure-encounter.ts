import { reportServerError } from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type EnsureEncounterInput = {
  appointmentId: string;
  clinicId: string;
  actorId: string;
};

export type EnsureEncounterResult =
  | { ok: true; encounterId: string; created: boolean }
  | { ok: false; error: string };

export async function ensureClinicalEncounterForAppointment({
  appointmentId,
  clinicId,
  actorId,
}: EnsureEncounterInput): Promise<EnsureEncounterResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("ensure_clinical_encounter_for_appointment", {
    appointment_uuid: appointmentId,
    clinic_uuid: clinicId,
    actor_uuid: actorId,
  });

  const result = data as { encounter_id?: unknown; created?: unknown } | null;
  if (error || typeof result?.encounter_id !== "string") {
    reportServerError("clinical_workflow.ensure_encounter", error, {
      appointmentId,
      clinicId,
      actorId,
    });

    const message = error?.message ?? "";
    if (message.includes("PATIENT_ARRIVAL_REQUIRED")) {
      return { ok: false, error: "Registre a chegada do paciente antes de iniciar o fluxo assistencial." };
    }
    if (message.includes("CLINICAL_ROUTE_PERMISSION_REQUIRED")) {
      return { ok: false, error: "Seu perfil não possui permissão para iniciar este fluxo assistencial." };
    }
    if (message.includes("APPOINTMENT_NOT_FOUND")) {
      return { ok: false, error: "Agendamento não encontrado na clínica ativa." };
    }
    return { ok: false, error: "Não foi possível preparar o atendimento assistencial." };
  }

  return {
    ok: true,
    encounterId: result.encounter_id,
    created: result.created === true,
  };
}
