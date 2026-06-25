import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import type {
  AppRole,
  FinancialAccount,
  FinancialBankImport,
  FinancialBankImportItem,
  FinancialCardMachine,
  FinancialCategory,
  FinancialCommission,
  FinancialCommissionRule,
  FinancialCommissionSettlement,
  FinancialCostCenter,
  FinancialEntry,
  FinancialEntryEvent,
  FinancialEntryItem,
  FinancialHealthPlan,
  FinancialLedgerEntry,
  FinancialMonthlyClosing,
  FinancialPayment,
  FinancialPaymentMethod,
  FinancialPreferences,
  FinancialReconciliation,
  FinancialReceipt,
  FinancialRecurringEntry,
  FinancialVendor,
  InventoryItem,
  InventoryLocation,
  PatientSummary,
} from "@/types/domain";

export type FinancialAccess = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canManage: boolean;
  canApprove: boolean;
  canExport: boolean;
  canChargeEncounter: boolean;
  currentMemberId: string | null;
  currentRole: AppRole | null;
  userId: string | null;
};

export type FinancialEntryWithRelations = FinancialEntry & {
  patient: Pick<PatientSummary, "id" | "full_name" | "social_name" | "phone"> | null;
  vendor: Pick<FinancialVendor, "id" | "name"> | null;
  category: Pick<FinancialCategory, "id" | "name" | "direction"> | null;
  costCenter: Pick<FinancialCostCenter, "id" | "name" | "code"> | null;
  healthPlan: Pick<FinancialHealthPlan, "id" | "name"> | null;
  professional: { id: string; profile: { full_name: string } | null } | null;
  payments: FinancialPayment[];
  receipts: FinancialReceipt[];
  items: FinancialEntryItem[];
  events: FinancialEntryEvent[];
  ledgerEntries: FinancialLedgerEntry[];
};

export type FinancialRecurringEntryWithRelations = FinancialRecurringEntry & {
  vendor: Pick<FinancialVendor, "id" | "name"> | null;
  category: Pick<FinancialCategory, "id" | "name" | "direction"> | null;
  costCenter: Pick<FinancialCostCenter, "id" | "name" | "code"> | null;
};

export type FinancialReconciliationWithRelations = FinancialReconciliation & {
  account: Pick<FinancialAccount, "id" | "name"> | null;
  closed_by_profile: { full_name: string } | null;
  reversed_by_profile: { full_name: string } | null;
};

export type FinancialCommissionRuleWithRelations = FinancialCommissionRule & {
  professional: { id: string; profile: { full_name: string } | null } | null;
  service: { id: string; name: string } | null;
};

export type FinancialCommissionWithRelations = FinancialCommission & {
  professional: { id: string; profile: { full_name: string } | null } | null;
  entry: { id: string; description: string; due_date: string } | null;
};

export type FinancialCommissionSettlementWithRelations = FinancialCommissionSettlement & {
  professional: { id: string; profile: { full_name: string } | null } | null;
  payable_entry: { id: string; description: string; status: string; paid_cents: number } | null;
};

export type FinancialBankImportWithItems = FinancialBankImport & {
  account: Pick<FinancialAccount, "id" | "name"> | null;
  items: FinancialBankImportItem[];
};

export type FinancialMonthlyClosingWithRelations = FinancialMonthlyClosing & {
  closed_by_profile: { full_name: string } | null;
  reopened_by_profile: { full_name: string } | null;
};

export type FinancialProfessionalOption = { id: string; profile: { full_name: string } | null };
export type FinancialServiceOption = { id: string; name: string };

export type FinancialWorkspace = {
  access: FinancialAccess;
  preferences: FinancialPreferences | null;
  accounts: FinancialAccount[];
  paymentMethods: FinancialPaymentMethod[];
  cardMachines: FinancialCardMachine[];
  categories: FinancialCategory[];
  costCenters: FinancialCostCenter[];
  healthPlans: FinancialHealthPlan[];
  vendors: FinancialVendor[];
  entries: FinancialEntryWithRelations[];
  payments: FinancialPayment[];
  recurringEntries: FinancialRecurringEntryWithRelations[];
  reconciliations: FinancialReconciliationWithRelations[];
  commissionRules: FinancialCommissionRuleWithRelations[];
  commissions: FinancialCommissionWithRelations[];
  commissionSettlements: FinancialCommissionSettlementWithRelations[];
  bankImports: FinancialBankImportWithItems[];
  monthlyClosings: FinancialMonthlyClosingWithRelations[];
  professionals: FinancialProfessionalOption[];
  services: FinancialServiceOption[];
  inventoryItems: InventoryItem[];
  inventoryLocations: InventoryLocation[];
  pendingEncounterCharges: PendingEncounterCharge[];
  metrics: FinancialMetrics;
};

export type FinancialWorkspaceScope =
  | "full"
  | "overview"
  | "receivables"
  | "payables"
  | "accounts"
  | "reconciliation"
  | "commissions"
  | "settings"
  | "encounter-charge";

export type PendingEncounterCharge = {
  encounter_id: string;
  appointment_id: string;
  patient_id: string;
  professional_member_id: string;
  consultation_completed_at: string | null;
  patient_name: string;
  professional_name: string;
  service_name: string;
  suggested_amount_cents: number;
};

export type FinancialMetrics = {
  receivableOpenCents: number;
  receivablePaidCents: number;
  payableOpenCents: number;
  payablePaidCents: number;
  overdueCents: number;
  netCashCents: number;
};

export type FinancialReceiptDetail = {
  receipt: FinancialReceipt;
  entry: FinancialEntryWithRelations;
  clinic: { trade_name: string; legal_name: string; document: string | null; phone: string | null; email: string | null } | null;
};

const defaultPreferences = (clinicId: string): FinancialPreferences => ({
  clinic_id: clinicId,
  allow_reception_checkout: true,
  allow_professional_checkout: false,
  require_payment_method_on_checkout: true,
  default_receivable_due_days: 0,
  default_late_fee_cents: 0,
  default_monthly_interest_bps: 0,
  receipt_footer: null,
});

export async function getFinancialAccess(clinicId?: string | null): Promise<FinancialAccess> {
  const authorization = await getClinicAuthorization(clinicId ?? undefined);
  const canCreate = authorization.can("financial", "create");

  return {
    canView: authorization.can("financial", "view"),
    canCreate,
    canEdit: authorization.can("financial", "edit"),
    canManage: authorization.can("financial", "manage"),
    canApprove: authorization.can("financial", "approve") || authorization.can("financial", "manage"),
    canExport: authorization.can("financial", "export"),
    canChargeEncounter: canCreate || authorization.can("schedule", "manage"),
    currentMemberId: authorization.memberId,
    currentRole: authorization.role,
    userId: authorization.userId,
  };
}

export async function getFinancialPreferences(clinicId?: string | null) {
  if (!clinicId) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("financial_preferences")
    .select(
      "clinic_id, allow_reception_checkout, allow_professional_checkout, require_payment_method_on_checkout, default_receivable_due_days, default_late_fee_cents, default_monthly_interest_bps, receipt_footer",
    )
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle<FinancialPreferences>();

  return data ?? defaultPreferences(clinicId);
}

export async function getFinancialWorkspace(
  clinicId?: string | null,
  options: { scope?: FinancialWorkspaceScope } = {},
): Promise<FinancialWorkspace> {
  const access = await getFinancialAccess(clinicId);
  const scope = options.scope ?? "full";
  const empty: FinancialWorkspace = {
    access,
    preferences: clinicId ? defaultPreferences(clinicId) : null,
    accounts: [],
    paymentMethods: [],
    cardMachines: [],
    categories: [],
    costCenters: [],
    healthPlans: [],
    vendors: [],
    entries: [],
    payments: [],
    recurringEntries: [],
    reconciliations: [],
    commissionRules: [],
    commissions: [],
    commissionSettlements: [],
    bankImports: [],
    monthlyClosings: [],
    professionals: [],
    services: [],
    inventoryItems: [],
    inventoryLocations: [],
    pendingEncounterCharges: [],
    metrics: emptyMetrics(),
  };

  if (!clinicId || (!access.canView && !access.canChargeEncounter)) {
    return empty;
  }

  const admin = createSupabaseAdminClient();
  const isScope = (...scopes: FinancialWorkspaceScope[]) => scope === "full" || scopes.includes(scope);
  const needsPreferences = isScope("settings");
  const needsAccounts = isScope("overview", "receivables", "payables", "accounts", "reconciliation", "commissions", "encounter-charge");
  const needsPaymentMethods = isScope("receivables", "payables", "accounts", "commissions", "encounter-charge");
  const needsCardMachines = isScope("overview", "receivables", "payables", "accounts", "encounter-charge");
  const needsCategories = isScope("receivables", "payables", "accounts", "reconciliation");
  const needsCostCenters = isScope("receivables", "payables", "accounts");
  const needsHealthPlans = isScope("receivables", "accounts");
  const needsVendors = isScope("payables", "accounts");
  const needsEntries = isScope("overview", "receivables", "payables", "reconciliation", "commissions");
  const needsRecurring = isScope("payables");
  const needsReconciliations = isScope("reconciliation");
  const needsCommissions = isScope("commissions");
  const needsBankImports = isScope("reconciliation");
  const needsMonthlyClosings = isScope("reconciliation");
  const needsPendingCharges = isScope("overview", "receivables", "encounter-charge");
  const needsInventoryOptions = isScope("payables");
  const [
    preferences,
    { data: accounts },
    { data: paymentMethods },
    { data: cardMachines },
    { data: categories },
    { data: costCenters },
    { data: healthPlans },
    { data: vendors },
    entries,
    recurringEntries,
    reconciliations,
    commissionData,
    bankImports,
    monthlyClosings,
    professionals,
    services,
    { data: inventoryItems },
    { data: inventoryLocations },
    pendingEncounterCharges,
  ] = await Promise.all([
    needsPreferences ? getFinancialPreferences(clinicId) : Promise.resolve(defaultPreferences(clinicId)),
    needsAccounts ? admin
      .from("financial_accounts")
      .select("id, clinic_id, name, account_type, bank_name, agency, account_number, pix_key, opening_balance_cents, current_balance_cents, active, notes")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("name") : Promise.resolve({ data: [] }),
    needsPaymentMethods ? admin
      .from("financial_payment_methods")
      .select("id, clinic_id, name, method_type, requires_card_machine, settlement_days, active")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("name") : Promise.resolve({ data: [] }),
    needsCardMachines ? admin
      .from("financial_card_machines")
      .select("id, clinic_id, account_id, name, provider, debit_fee_bps, credit_fee_bps, credit_installment_fee_bps, debit_settlement_days, credit_settlement_days, active, notes")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("name") : Promise.resolve({ data: [] }),
    needsCategories ? admin
      .from("financial_categories")
      .select("id, clinic_id, name, direction, parent_id, active")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("name") : Promise.resolve({ data: [] }),
    needsCostCenters ? admin
      .from("financial_cost_centers")
      .select("id, clinic_id, name, code, active, notes")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("name") : Promise.resolve({ data: [] }),
    needsHealthPlans ? admin
      .from("financial_health_plans")
      .select("id, clinic_id, name, document, email, phone, active, notes")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("name") : Promise.resolve({ data: [] }),
    needsVendors ? admin
      .from("financial_vendors")
      .select("id, clinic_id, name, document, email, phone, vendor_type, active, notes")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("name") : Promise.resolve({ data: [] }),
    access.canView && needsEntries ? listFinancialEntries(clinicId) : Promise.resolve([]),
    access.canView && needsRecurring ? listFinancialRecurringEntries(clinicId) : Promise.resolve([]),
    access.canView && needsReconciliations ? listFinancialReconciliations(clinicId) : Promise.resolve([]),
    access.canView && needsCommissions
      ? listFinancialCommissions(clinicId)
      : Promise.resolve({ rules: [], commissions: [], settlements: [] }),
    access.canView && needsBankImports ? listFinancialBankImports(clinicId) : Promise.resolve([]),
    access.canView && needsMonthlyClosings ? listFinancialMonthlyClosings(clinicId) : Promise.resolve([]),
    access.canView && needsCommissions ? listFinancialProfessionals(clinicId) : Promise.resolve([]),
    access.canView && needsCommissions ? listFinancialServices(clinicId) : Promise.resolve([]),
    needsInventoryOptions ? admin
      .from("inventory_items")
      .select("id, clinic_id, name, sku, category, unit, generate_stock, minimum_quantity, active, notes, created_at, updated_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .eq("active", true)
      .order("name") : Promise.resolve({ data: [] }),
    needsInventoryOptions ? admin
      .from("inventory_locations")
      .select("id, clinic_id, name, description, active, created_at, updated_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .eq("active", true)
      .order("name") : Promise.resolve({ data: [] }),
    needsPendingCharges ? listPendingEncounterCharges(clinicId, access) : Promise.resolve([]),
  ]);

  const payments = entries.flatMap((entry) => entry.payments);

  return {
    access,
    preferences,
    accounts: (accounts ?? []) as FinancialAccount[],
    paymentMethods: (paymentMethods ?? []) as FinancialPaymentMethod[],
    cardMachines: (cardMachines ?? []) as FinancialCardMachine[],
    categories: (categories ?? []) as FinancialCategory[],
    costCenters: (costCenters ?? []) as FinancialCostCenter[],
    healthPlans: (healthPlans ?? []) as FinancialHealthPlan[],
    vendors: (vendors ?? []) as FinancialVendor[],
    entries,
    payments,
    recurringEntries,
    reconciliations,
    commissionRules: commissionData.rules,
    commissions: commissionData.commissions,
    commissionSettlements: commissionData.settlements,
    bankImports,
    monthlyClosings,
    professionals,
    services,
    inventoryItems: (inventoryItems ?? []) as InventoryItem[],
    inventoryLocations: (inventoryLocations ?? []) as InventoryLocation[],
    pendingEncounterCharges,
    metrics: calculateMetrics(entries),
  };
}

export async function listFinancialEntries(clinicId: string): Promise<FinancialEntryWithRelations[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("financial_entries")
    .select("*")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("due_date", { ascending: true })
    .limit(250);

  if (error || !data?.length) return [];

  const entries = data as FinancialEntry[];
  const patientIds = [...new Set(entries.map((entry) => entry.patient_id).filter(Boolean))] as string[];
  const vendorIds = [...new Set(entries.map((entry) => entry.vendor_id).filter(Boolean))] as string[];
  const categoryIds = [...new Set(entries.map((entry) => entry.category_id).filter(Boolean))] as string[];
  const costCenterIds = [...new Set(entries.map((entry) => entry.cost_center_id).filter(Boolean))] as string[];
  const healthPlanIds = [...new Set(entries.map((entry) => entry.health_plan_id).filter(Boolean))] as string[];
  const professionalIds = [...new Set(entries.map((entry) => entry.professional_member_id).filter(Boolean))] as string[];
  const entryIds = entries.map((entry) => entry.id);

  const [
    { data: patients },
    { data: vendors },
    { data: categories },
    { data: costCenters },
    { data: healthPlans },
    { data: professionals },
    { data: payments },
    { data: receipts },
    { data: items },
    { data: events },
    { data: ledgerEntries },
  ] =
    await Promise.all([
      patientIds.length
        ? admin.from("patients").select("id, full_name, social_name, phone").in("id", patientIds)
        : Promise.resolve({ data: [] }),
      vendorIds.length
        ? admin.from("financial_vendors").select("id, name").in("id", vendorIds)
        : Promise.resolve({ data: [] }),
      categoryIds.length
        ? admin.from("financial_categories").select("id, name, direction").in("id", categoryIds)
        : Promise.resolve({ data: [] }),
      costCenterIds.length
        ? admin.from("financial_cost_centers").select("id, name, code").in("id", costCenterIds)
        : Promise.resolve({ data: [] }),
      healthPlanIds.length
        ? admin.from("financial_health_plans").select("id, name").in("id", healthPlanIds)
        : Promise.resolve({ data: [] }),
      professionalIds.length
        ? admin
            .from("clinic_members")
            .select("id, profile:profiles!clinic_members_user_id_fkey(full_name)")
            .in("id", professionalIds)
        : Promise.resolve({ data: [] }),
      admin
        .from("financial_payments")
        .select("*")
        .in("entry_id", entryIds)
        .is("deleted_at", null)
        .order("paid_at", { ascending: false }),
      admin
        .from("financial_receipts")
        .select("id, clinic_id, entry_id, patient_id, receipt_type, title, content, issued_at, printed_at, exported_at")
        .in("entry_id", entryIds)
        .is("deleted_at", null)
        .order("issued_at", { ascending: false }),
      admin
        .from("financial_entry_items")
        .select("id, clinic_id, entry_id, description, quantity, unit_amount_cents, total_amount_cents, sort_order, generate_stock, inventory_item_id, inventory_location_id, inventory_batch_id, batch_number, expires_at, created_at, updated_at")
        .in("entry_id", entryIds)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true }),
      admin
        .from("financial_entry_events")
        .select("id, clinic_id, entry_id, event_type, old_values, new_values, notes, created_at, created_by")
        .in("entry_id", entryIds)
        .order("created_at", { ascending: false }),
      admin
        .from("financial_ledger_entries")
        .select("id, clinic_id, account_id, entry_id, payment_id, reconciliation_id, direction, amount_cents, fee_cents, net_amount_cents, occurred_at, description, source_type, source_id, metadata, created_at, created_by")
        .in("entry_id", entryIds)
        .order("occurred_at", { ascending: false }),
    ]);

  const patientMap = new Map((patients ?? []).map((item) => [item.id, item]));
  const vendorMap = new Map((vendors ?? []).map((item) => [item.id, item]));
  const categoryMap = new Map((categories ?? []).map((item) => [item.id, item]));
  const costCenterMap = new Map((costCenters ?? []).map((item) => [item.id, item]));
  const healthPlanMap = new Map((healthPlans ?? []).map((item) => [item.id, item]));
  const professionalMap = new Map((professionals ?? []).map((item) => [item.id, item]));
  const paymentsByEntry = groupBy((payments ?? []) as FinancialPayment[], "entry_id");
  const receiptsByEntry = groupBy((receipts ?? []) as FinancialReceipt[], "entry_id");
  const itemsByEntry = groupBy((items ?? []) as FinancialEntryItem[], "entry_id");
  const eventsByEntry = groupBy((events ?? []) as FinancialEntryEvent[], "entry_id");
  const ledgerByEntry = groupBy((ledgerEntries ?? []) as FinancialLedgerEntry[], "entry_id");

  return entries.map((entry) => ({
    ...entry,
    patient: entry.patient_id ? patientMap.get(entry.patient_id) ?? null : null,
    vendor: entry.vendor_id ? vendorMap.get(entry.vendor_id) ?? null : null,
    category: entry.category_id ? categoryMap.get(entry.category_id) ?? null : null,
    costCenter: entry.cost_center_id ? costCenterMap.get(entry.cost_center_id) ?? null : null,
    healthPlan: entry.health_plan_id ? healthPlanMap.get(entry.health_plan_id) ?? null : null,
    professional: entry.professional_member_id
      ? normalizeProfessional(professionalMap.get(entry.professional_member_id))
      : null,
    payments: paymentsByEntry.get(entry.id) ?? [],
    receipts: receiptsByEntry.get(entry.id) ?? [],
    items: itemsByEntry.get(entry.id) ?? [],
    events: eventsByEntry.get(entry.id) ?? [],
    ledgerEntries: ledgerByEntry.get(entry.id) ?? [],
  }));
}

export async function listFinancialReconciliations(
  clinicId: string,
): Promise<FinancialReconciliationWithRelations[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("financial_reconciliations")
    .select("*")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("period_end", { ascending: false })
    .limit(100);

  if (error || !data?.length) return [];

  const reconciliations = data as FinancialReconciliation[];
  const accountIds = [...new Set(reconciliations.map((item) => item.account_id))];
  const profileIds = [
    ...new Set(
      reconciliations.flatMap((item) => [item.closed_by, item.reversed_by]).filter(Boolean),
    ),
  ] as string[];

  const [{ data: accounts }, { data: profiles }] = await Promise.all([
    accountIds.length
      ? admin.from("financial_accounts").select("id, name").in("id", accountIds)
      : Promise.resolve({ data: [] }),
    profileIds.length
      ? admin.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] }),
  ]);

  const accountMap = new Map((accounts ?? []).map((item) => [item.id, item]));
  const profileMap = new Map((profiles ?? []).map((item) => [item.id, item]));

  return reconciliations.map((item) => ({
    ...item,
    account: accountMap.get(item.account_id) ?? null,
    closed_by_profile: item.closed_by ? profileMap.get(item.closed_by) ?? null : null,
    reversed_by_profile: item.reversed_by ? profileMap.get(item.reversed_by) ?? null : null,
  }));
}

export async function listFinancialRecurringEntries(clinicId: string): Promise<FinancialRecurringEntryWithRelations[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("financial_recurring_entries")
    .select("*")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("next_due_date", { ascending: true })
    .limit(100);

  if (error || !data?.length) return [];

  const recurringEntries = data as FinancialRecurringEntry[];
  const vendorIds = [...new Set(recurringEntries.map((item) => item.vendor_id).filter(Boolean))] as string[];
  const categoryIds = [...new Set(recurringEntries.map((item) => item.category_id).filter(Boolean))] as string[];
  const costCenterIds = [...new Set(recurringEntries.map((item) => item.cost_center_id).filter(Boolean))] as string[];

  const [{ data: vendors }, { data: categories }, { data: costCenters }] = await Promise.all([
    vendorIds.length
      ? admin.from("financial_vendors").select("id, name").in("id", vendorIds)
      : Promise.resolve({ data: [] }),
    categoryIds.length
      ? admin.from("financial_categories").select("id, name, direction").in("id", categoryIds)
      : Promise.resolve({ data: [] }),
    costCenterIds.length
      ? admin.from("financial_cost_centers").select("id, name, code").in("id", costCenterIds)
      : Promise.resolve({ data: [] }),
  ]);

  const vendorMap = new Map((vendors ?? []).map((item) => [item.id, item]));
  const categoryMap = new Map((categories ?? []).map((item) => [item.id, item]));
  const costCenterMap = new Map((costCenters ?? []).map((item) => [item.id, item]));

  return recurringEntries.map((item) => ({
    ...item,
    vendor: item.vendor_id ? vendorMap.get(item.vendor_id) ?? null : null,
    category: item.category_id ? categoryMap.get(item.category_id) ?? null : null,
    costCenter: item.cost_center_id ? costCenterMap.get(item.cost_center_id) ?? null : null,
  }));
}

export async function listFinancialProfessionals(clinicId: string): Promise<FinancialProfessionalOption[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("clinic_members")
    .select("id, profile:profiles!clinic_members_user_id_fkey(full_name)")
    .eq("clinic_id", clinicId)
    .eq("status", "active")
    .in("role", ["doctor", "nurse", "professional"])
    .is("deleted_at", null)
    .order("created_at");

  return (data ?? []).map((row) => normalizeProfessional(row)).filter(Boolean) as FinancialProfessionalOption[];
}

export async function listFinancialServices(clinicId: string): Promise<FinancialServiceOption[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("clinic_services")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .is("deleted_at", null)
    .order("name");
  return (data ?? []) as FinancialServiceOption[];
}

export async function listFinancialCommissions(clinicId: string): Promise<{
  rules: FinancialCommissionRuleWithRelations[];
  commissions: FinancialCommissionWithRelations[];
  settlements: FinancialCommissionSettlementWithRelations[];
}> {
  const admin = createSupabaseAdminClient();
  const [{ data: ruleRows }, { data: commissionRows }, { data: settlementRows }] = await Promise.all([
    admin
      .from("financial_commission_rules")
      .select("*")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    admin
      .from("financial_commissions")
      .select("*")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(250),
    admin
      .from("financial_commission_settlements")
      .select("*")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("due_date", { ascending: false })
      .limit(120),
  ]);

  const rules = (ruleRows ?? []) as FinancialCommissionRule[];
  const commissions = (commissionRows ?? []) as FinancialCommission[];
  const settlements = (settlementRows ?? []) as FinancialCommissionSettlement[];
  const professionalIds = [...new Set([...rules, ...commissions, ...settlements].map((item) => item.professional_member_id).filter(Boolean))] as string[];
  const serviceIds = [...new Set(rules.map((item) => item.service_id).filter(Boolean))] as string[];
  const entryIds = [...new Set(commissions.map((item) => item.entry_id).filter(Boolean))] as string[];
  const payableEntryIds = [...new Set(settlements.map((item) => item.payable_entry_id).filter(Boolean))] as string[];
  const [{ data: professionals }, { data: services }, { data: entries }, { data: payableEntries }] = await Promise.all([
    professionalIds.length
      ? admin.from("clinic_members").select("id, profile:profiles!clinic_members_user_id_fkey(full_name)").in("id", professionalIds)
      : Promise.resolve({ data: [] }),
    serviceIds.length
      ? admin.from("clinic_services").select("id, name").in("id", serviceIds)
      : Promise.resolve({ data: [] }),
    entryIds.length
      ? admin.from("financial_entries").select("id, description, due_date").in("id", entryIds)
      : Promise.resolve({ data: [] }),
    payableEntryIds.length
      ? admin.from("financial_entries").select("id, description, status, paid_cents").in("id", payableEntryIds)
      : Promise.resolve({ data: [] }),
  ]);
  const professionalMap = new Map((professionals ?? []).map((item) => [item.id, normalizeProfessional(item)]));
  const serviceMap = new Map((services ?? []).map((item) => [item.id, item]));
  const entryMap = new Map((entries ?? []).map((item) => [item.id, item]));
  const payableEntryMap = new Map((payableEntries ?? []).map((item) => [item.id, item]));

  return {
    rules: rules.map((rule) => ({
      ...rule,
      professional: rule.professional_member_id ? professionalMap.get(rule.professional_member_id) ?? null : null,
      service: rule.service_id ? serviceMap.get(rule.service_id) ?? null : null,
    })),
    commissions: commissions.map((commission) => ({
      ...commission,
      professional: professionalMap.get(commission.professional_member_id) ?? null,
      entry: commission.entry_id ? entryMap.get(commission.entry_id) ?? null : null,
    })),
    settlements: settlements.map((settlement) => ({
      ...settlement,
      professional: professionalMap.get(settlement.professional_member_id) ?? null,
      payable_entry: settlement.payable_entry_id
        ? payableEntryMap.get(settlement.payable_entry_id) ?? null
        : null,
    })),
  };
}

export async function listFinancialBankImports(clinicId: string): Promise<FinancialBankImportWithItems[]> {
  const admin = createSupabaseAdminClient();
  const { data: importRows, error } = await admin
    .from("financial_bank_imports")
    .select("*")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error || !importRows?.length) return [];

  const imports = importRows as FinancialBankImport[];
  const importIds = imports.map((item) => item.id);
  const accountIds = [...new Set(imports.map((item) => item.account_id))];
  const [{ data: itemRows }, { data: accounts }] = await Promise.all([
    admin
      .from("financial_bank_import_items")
      .select("*")
      .in("import_id", importIds)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false })
      .limit(1200),
    admin.from("financial_accounts").select("id, name").in("id", accountIds),
  ]);
  const itemsByImport = groupBy((itemRows ?? []) as FinancialBankImportItem[], "import_id");
  const accountMap = new Map((accounts ?? []).map((item) => [item.id, item]));
  return imports.map((item) => ({
    ...item,
    account: accountMap.get(item.account_id) ?? null,
    items: itemsByImport.get(item.id) ?? [],
  }));
}

export async function listFinancialMonthlyClosings(clinicId: string): Promise<FinancialMonthlyClosingWithRelations[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("financial_monthly_closings")
    .select("*")
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .order("period_month", { ascending: false })
    .limit(36);
  if (error || !data?.length) return [];

  const closings = data as FinancialMonthlyClosing[];
  const profileIds = [...new Set(closings.flatMap((item) => [item.closed_by, item.reopened_by]).filter(Boolean))] as string[];
  const { data: profiles } = profileIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((item) => [item.id, item]));
  return closings.map((item) => ({
    ...item,
    closed_by_profile: item.closed_by ? profileMap.get(item.closed_by) ?? null : null,
    reopened_by_profile: item.reopened_by ? profileMap.get(item.reopened_by) ?? null : null,
  }));
}

function normalizeProfessional(
  row:
    | { id: string; profile?: { full_name: string } | { full_name: string }[] | null }
    | undefined,
): FinancialEntryWithRelations["professional"] {
  if (!row) return null;
  return {
    id: row.id,
    profile: Array.isArray(row.profile) ? row.profile[0] ?? null : row.profile ?? null,
  };
}

export async function listPendingEncounterCharges(
  clinicId: string,
  access: FinancialAccess,
): Promise<PendingEncounterCharge[]> {
  if (!access.canChargeEncounter && !access.canView) return [];

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("clinical_encounters")
    .select("id, appointment_id, patient_id, professional_member_id, consultation_completed_at")
    .eq("clinic_id", clinicId)
    .in("status", ["consultation_completed", "billing_pending"])
    .is("deleted_at", null)
    .order("consultation_completed_at", { ascending: false })
    .limit(100);

  if (!access.canView && access.currentMemberId) {
    query = query.eq("professional_member_id", access.currentMemberId);
  }

  const { data: encounters } = await query;
  if (!encounters?.length) return [];

  const encounterIds = encounters.map((item) => item.id);
  const { data: existingEntries } = await admin
    .from("financial_entries")
    .select("encounter_id")
    .eq("clinic_id", clinicId)
    .in("encounter_id", encounterIds)
    .is("deleted_at", null);
  const chargedEncounters = new Set((existingEntries ?? []).map((item) => item.encounter_id));
  const visible = encounters.filter((encounter) => !chargedEncounters.has(encounter.id));
  if (!visible.length) return [];

  const appointmentIds = [...new Set(visible.map((item) => item.appointment_id))];
  const patientIds = [...new Set(visible.map((item) => item.patient_id))];
  const professionalIds = [...new Set(visible.map((item) => item.professional_member_id))];
  const [{ data: appointments }, { data: patients }, { data: professionals }] = await Promise.all([
    admin.from("appointments").select("id, service_id, appointment_type").in("id", appointmentIds),
    admin.from("patients").select("id, full_name, social_name").in("id", patientIds),
    admin
      .from("clinic_members")
      .select("id, profile:profiles!clinic_members_user_id_fkey(full_name)")
      .in("id", professionalIds),
  ]);

  const serviceIds = [...new Set((appointments ?? []).map((item) => item.service_id).filter(Boolean))] as string[];
  const { data: services } = serviceIds.length
    ? await admin.from("clinic_services").select("id, name, price_cents").in("id", serviceIds)
    : { data: [] };
  const appointmentMap = new Map((appointments ?? []).map((item) => [item.id, item]));
  const patientMap = new Map((patients ?? []).map((item) => [item.id, item]));
  const professionalMap = new Map((professionals ?? []).map((item) => [item.id, item]));
  const serviceMap = new Map((services ?? []).map((item) => [item.id, item]));

  return visible.map((encounter) => {
    const appointment = appointmentMap.get(encounter.appointment_id);
    const service = appointment?.service_id ? serviceMap.get(appointment.service_id) : null;
    const patient = patientMap.get(encounter.patient_id);
    const professional = professionalMap.get(encounter.professional_member_id) as
      | { profile?: { full_name?: string | null } | null }
      | undefined;

    return {
      encounter_id: encounter.id,
      appointment_id: encounter.appointment_id,
      patient_id: encounter.patient_id,
      professional_member_id: encounter.professional_member_id,
      consultation_completed_at: encounter.consultation_completed_at,
      patient_name: patient?.social_name || patient?.full_name || "Paciente",
      professional_name: professional?.profile?.full_name || "Profissional",
      service_name: service?.name || appointment?.appointment_type || "Consulta",
      suggested_amount_cents: service?.price_cents ?? 0,
    };
  });
}

export async function getFinancialReceiptDetail(
  clinicId: string | null | undefined,
  receiptId: string,
): Promise<FinancialReceiptDetail | null> {
  if (!clinicId) return null;
  const access = await getFinancialAccess(clinicId);
  if (!access.canView && !access.canChargeEncounter) return null;

  const admin = createSupabaseAdminClient();
  const { data: receipt } = await admin
    .from("financial_receipts")
    .select("id, clinic_id, entry_id, patient_id, receipt_type, title, content, issued_at, printed_at, exported_at")
    .eq("id", receiptId)
    .eq("clinic_id", clinicId)
    .is("deleted_at", null)
    .maybeSingle<FinancialReceipt>();

  if (!receipt) return null;

  const [entry] = await listFinancialEntries(clinicId).then((entries) =>
    entries.filter((item) => item.id === receipt.entry_id),
  );
  if (!entry) return null;

  const { data: clinic } = await admin
    .from("clinics")
    .select("trade_name, legal_name, document, phone, email")
    .eq("id", clinicId)
    .maybeSingle<FinancialReceiptDetail["clinic"]>();

  return { receipt, entry, clinic: clinic ?? null };
}

function groupBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const id = String(item[key] ?? "");
    const list = map.get(id) ?? [];
    list.push(item);
    map.set(id, list);
  }
  return map;
}

function emptyMetrics(): FinancialMetrics {
  return {
    receivableOpenCents: 0,
    receivablePaidCents: 0,
    payableOpenCents: 0,
    payablePaidCents: 0,
    overdueCents: 0,
    netCashCents: 0,
  };
}

function calculateMetrics(entries: FinancialEntryWithRelations[]): FinancialMetrics {
  const metrics = emptyMetrics();
  const today = new Date().toISOString().slice(0, 10);

  for (const entry of entries) {
    const total = entry.amount_cents - entry.discount_cents + (entry.freight_cents ?? 0) + entry.addition_cents;
    const open = Math.max(total - entry.paid_cents, 0);
    const confirmedPayments = entry.payments.filter((payment) => payment.status === "confirmed");
    const paid = confirmedPayments.reduce((sum, payment) => sum + payment.amount_cents, 0);

    if (entry.entry_type === "receivable") {
      metrics.receivableOpenCents += open;
      metrics.receivablePaidCents += paid;
      metrics.netCashCents += confirmedPayments.reduce((sum, payment) => sum + payment.net_amount_cents, 0);
    } else {
      metrics.payableOpenCents += open;
      metrics.payablePaidCents += paid;
      metrics.netCashCents -= confirmedPayments.reduce((sum, payment) => sum + payment.net_amount_cents, 0);
    }

    if (entry.status !== "paid" && entry.due_date < today) {
      metrics.overdueCents += open;
    }
  }

  return metrics;
}
