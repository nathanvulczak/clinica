import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ignoredFields = new Set(["id", "created_at", "updated_at", "deleted_at", "created_by", "updated_by", "metadata"]);

const fieldLabels: Record<string, string> = {
  full_name: "nome completo",
  phone: "telefone",
  cpf: "CPF",
  email: "e-mail",
  avatar_url: "imagem de perfil",
  app_preferences: "preferências",
  platform_role: "tipo de perfil",
  legal_name: "razão social/responsável",
  trade_name: "nome da clínica",
  document: "CPF/CNPJ",
  city: "cidade",
  state: "UF",
  role: "perfil de acesso",
  status: "status",
  joined_at: "entrada na clínica",
  plan_slug: "plano",
  current_period_end: "fim do ciclo",
  cancel_at_period_end: "cancelamento no fim do ciclo",
  patient_id: "paciente",
  professional_member_id: "profissional",
  starts_at: "início",
  ends_at: "fim",
  appointment_type: "tipo de consulta",
  channel: "canal",
  cancellation_reason: "motivo de cancelamento",
  notes: "observações",
  block_type: "tipo de bloqueio",
  reason: "motivo",
  slot_minutes: "janela padrão",
  buffer_minutes: "intervalo",
  online_booking_enabled: "confirmação por link",
  working_hours: "horários de atendimento",
};

function getChangedFields(log: {
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
}) {
  const keys = new Set([...Object.keys(log.old_values ?? {}), ...Object.keys(log.new_values ?? {})]);

  return [...keys]
    .filter((key) => !ignoredFields.has(key))
    .filter((key) => JSON.stringify(log.old_values?.[key] ?? null) !== JSON.stringify(log.new_values?.[key] ?? null))
    .map((key) => fieldLabels[key] ?? key)
    .slice(0, 6);
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ logs: [] }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const actionType = params.get("action_type");
  const dateFrom = params.get("from");
  const dateTo = params.get("to");
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("audit_logs")
    .select("id, action_type, created_at, notes, level, module, record_table, old_values, new_values")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (actionType && actionType !== "all") {
    query = query.eq("action_type", actionType);
  }

  if (dateFrom) {
    query = query.gte("created_at", new Date(`${dateFrom}T00:00:00-03:00`).toISOString());
  }

  if (dateTo) {
    query = query.lte("created_at", new Date(`${dateTo}T23:59:59-03:00`).toISOString());
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ logs: [] }, { status: 200 });
  }

  return NextResponse.json({
    logs: (data ?? []).map((log) => ({
      id: log.id,
      action_type: log.action_type,
      created_at: log.created_at,
      notes: log.notes,
      level: log.level,
      module: log.module,
      record_table: log.record_table,
      changed_fields: getChangedFields({
        old_values: log.old_values as Record<string, unknown> | null,
        new_values: log.new_values as Record<string, unknown> | null,
      }),
    })),
  });
}
