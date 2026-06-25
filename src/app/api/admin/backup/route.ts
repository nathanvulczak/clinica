import { NextRequest, NextResponse } from "next/server";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import { logAuditEvent } from "@/services/audit/audit-service";

type BackupScope = "administrative" | "clinical" | "financial" | "complete";

const administrativeTables = [
  "clinics",
  "clinic_members",
  "role_permissions",
  "member_permissions",
  "clinic_branding_settings",
  "registration_preferences",
  "nursing_preferences",
  "medical_record_preferences",
  "audit_logs",
];

const clinicalTables = [
  "patients",
  "clinic_services",
  "clinic_rooms",
  "clinic_professional_profiles",
  "professional_availability_rules",
  "schedule_professional_settings",
  "schedule_blocks",
  "appointments",
  "appointment_workflow_events",
  "appointment_notifications",
  "clinical_encounters",
  "clinical_encounter_events",
  "nursing_assessments",
  "medical_records",
  "medical_prescriptions",
  "medical_document_events",
  "patient_clinical_comments",
  "medical_record_attachments",
  "medical_record_correction_requests",
];

const financialTables = [
  "financial_accounts",
  "financial_payment_methods",
  "financial_card_machines",
  "financial_categories",
  "financial_cost_centers",
  "financial_health_plans",
  "financial_vendors",
  "financial_entries",
  "financial_entry_items",
  "financial_payments",
  "financial_receipts",
  "financial_entry_events",
  "financial_reconciliations",
  "financial_recurring_entries",
  "financial_commission_rules",
  "financial_commissions",
  "financial_commission_settlements",
  "financial_bank_imports",
  "financial_bank_import_items",
  "financial_monthly_closings",
  "financial_ledger_entries",
];

function normalizeScope(value: string | null): BackupScope {
  return value === "administrative" || value === "clinical" || value === "financial" ? value : "complete";
}

function tablesForScope(scope: BackupScope) {
  if (scope === "administrative") return administrativeTables;
  if (scope === "clinical") return clinicalTables;
  if (scope === "financial") return financialTables;
  return [...administrativeTables, ...clinicalTables, ...financialTables];
}

function backupFileName(clinicName: string, scope: BackupScope) {
  const safeClinic = clinicName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return `clinicore-backup-${safeClinic || "clinica"}-${scope}-${date}.json`;
}

async function readTable(table: string, clinicId: string) {
  const admin = createSupabaseAdminClient();
  const query =
    table === "clinics"
      ? admin.from(table).select("*").eq("id", clinicId).limit(1)
      : admin.from(table).select("*").eq("clinic_id", clinicId).limit(10000);
  const { data, error } = await query;

  return {
    data: data ?? [],
    error: error ? { message: error.message, code: error.code } : null,
  };
}

export async function GET(request: NextRequest) {
  const scope = normalizeScope(request.nextUrl.searchParams.get("scope"));
  const [{ activeClinic }, supabase] = await Promise.all([
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!activeClinic || !user) {
    return NextResponse.json({ error: "Selecione uma clínica e autentique-se novamente." }, { status: 401 });
  }

  const authorization = await getClinicAuthorization(activeClinic.id);
  const canExport = authorization.can("audit", "export") || authorization.can("clinics", "edit");

  if (!canExport) {
    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "backup_access_denied",
      module: "audit",
      recordTable: "clinic_backup",
      level: "security",
      notes: "Tentativa de exportar backup sem permissão.",
    });
    return NextResponse.json({ error: "Sem permissão para exportar backup." }, { status: 403 });
  }

  const tables = tablesForScope(scope);
  const entries = await Promise.all(tables.map(async (table) => [table, await readTable(table, activeClinic.id)]));
  const payload = {
    meta: {
      product: "CliniCore",
      kind: "clinic_backup",
      scope,
      generated_at: new Date().toISOString(),
      clinic_id: activeClinic.id,
      clinic_name: activeClinic.trade_name,
      generated_by: user.id,
      format_version: 1,
      note: "Este arquivo pode conter dados pessoais, financeiros e dados sensíveis de saúde. Armazene com controle de acesso.",
    },
    tables: Object.fromEntries(entries),
  };
  const body = JSON.stringify(payload, null, 2);
  const fileName = backupFileName(activeClinic.trade_name, scope);

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "clinic_backup_exported",
    module: "audit",
    recordTable: "clinic_backup",
    newValues: {
      scope,
      tables,
      bytes: Buffer.byteLength(body, "utf8"),
    },
    level: "security",
    notes: "Backup da clínica exportado pelo usuário autorizado.",
  });

  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}
