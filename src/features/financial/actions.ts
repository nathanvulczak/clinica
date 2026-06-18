"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  cancelFinancialEntrySchema,
  cardMachineSchema,
  costCenterSchema,
  encounterChargeSchema,
  financialAccountSchema,
  financialCategorySchema,
  financialEntrySchema,
  financialEntryItemInputSchema,
  generateRecurringPayableSchema,
  healthPlanSchema,
  paymentMethodSchema,
  preferencesSchema,
  reconciliationSchema,
  recurringEntrySchema,
  reverseReconciliationSchema,
  receiptSchema,
  reversePaymentSchema,
  settleEntrySchema,
  vendorSchema,
} from "@/features/financial/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCurrencyBRL } from "@/lib/utils";
import { getFinancialAccess, getFinancialPreferences } from "@/repositories/financial";
import { logAuditEvent } from "@/services/audit/audit-service";
import type { FinancialEntry, FinancialPayment } from "@/types/domain";

export type FinancialActionState = {
  error?: string;
  success?: string;
  receiptId?: string;
};

function parseCurrencyToCents(value: string) {
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;

  return Math.round(Number(normalized) * 100);
}

function percentToBps(value: number) {
  return Math.round(value * 100);
}

function parseFinancialEntryItems(raw: string | undefined) {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw || "[]");
  } catch {
    return { error: "Itens do documento inválidos." as const };
  }

  const parsed = financialEntryItemInputSchema.array().safeParse(parsedJson);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Itens do documento inválidos." };
  }

  return {
    items: parsed.data.map((item, index) => {
      const unitAmountCents = parseCurrencyToCents(item.unit_amount);
      const totalAmountCents = Math.round(item.quantity * unitAmountCents);
      return {
        description: item.description,
        quantity: item.quantity,
        unit_amount_cents: unitAmountCents,
        total_amount_cents: totalAmountCents,
        sort_order: index,
      };
    }),
  };
}

function financialError(error: { message?: string } | null, fallback: string) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("does not exist") || message.includes("schema cache")) {
    return "A estrutura do Financeiro ainda não está disponível. Execute as migrations financeiras mais recentes no Supabase.";
  }
  if (message.includes("permission") || message.includes("policy")) {
    return "O banco bloqueou a operação por segurança. Revise as permissões e o RLS.";
  }
  if (message.includes("duplicate") || message.includes("unique")) {
    return "Ja existe um registro financeiro com estes dados.";
  }
  if (message.includes("financial_reconciliation_locked")) {
    return "Este lançamento faz parte de uma conciliação bancária fechada. Reabra a conciliação antes de alterar.";
  }
  return fallback;
}

async function getFinancialContext() {
  const [{ activeClinic }, supabase] = await Promise.all([
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!activeClinic) return { error: "Selecione uma clínica antes de acessar o Financeiro." as const };

  const access = await getFinancialAccess(activeClinic.id);
  return { activeClinic, user, access };
}

function revalidateFinancial() {
  revalidatePath("/financeiro");
  revalidatePath("/atendimentos");
  revalidatePath("/prontuarios");
  revalidatePath("/auditoria");
}

async function entryHasClosedReconciliation(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  entryId: string,
) {
  const { data: payments } = await admin
    .from("financial_payments")
    .select("reconciliation_id")
    .eq("entry_id", entryId)
    .is("deleted_at", null)
    .not("reconciliation_id", "is", null);

  const reconciliationIds = [...new Set((payments ?? []).map((payment) => payment.reconciliation_id).filter(Boolean))];
  if (!reconciliationIds.length) return false;

  const { data } = await admin
    .from("financial_reconciliations")
    .select("id")
    .in("id", reconciliationIds)
    .eq("status", "closed")
    .is("deleted_at", null)
    .limit(1);

  return Boolean(data?.length);
}

async function recordEntryEvent({
  admin,
  clinicId,
  userId,
  entryId,
  eventType,
  oldValues,
  newValues,
  notes,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  clinicId: string;
  userId: string;
  entryId: string;
  eventType:
    | "created"
    | "updated"
    | "settled"
    | "payment_reversed"
    | "cancelled"
    | "receipt_issued"
    | "reconciliation_closed"
    | "reconciliation_reopened"
    | "ledger_posted";
  oldValues?: unknown;
  newValues?: unknown;
  notes?: string | null;
}) {
  const { error } = await admin.from("financial_entry_events").insert({
    clinic_id: clinicId,
    entry_id: entryId,
    event_type: eventType,
    old_values: oldValues ?? null,
    new_values: newValues ?? null,
    notes: notes ?? null,
    created_by: userId,
  });

  if (error) {
    console.warn("financial_entry_events unavailable", error.message);
  }
}

async function postLedgerEntry({
  admin,
  clinicId,
  userId,
  accountId,
  entryId,
  paymentId,
  reconciliationId,
  direction,
  amountCents,
  feeCents,
  netAmountCents,
  occurredAt,
  description,
  sourceType,
  sourceId,
  metadata,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  clinicId: string;
  userId: string;
  accountId: string | null;
  entryId: string | null;
  paymentId: string | null;
  reconciliationId?: string | null;
  direction: "in" | "out";
  amountCents: number;
  feeCents: number;
  netAmountCents: number;
  occurredAt: string;
  description: string;
  sourceType: "payment" | "reversal" | "adjustment" | "reconciliation";
  sourceId: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await admin.from("financial_ledger_entries").insert({
    clinic_id: clinicId,
    account_id: accountId,
    entry_id: entryId,
    payment_id: paymentId,
    reconciliation_id: reconciliationId ?? null,
    direction,
    amount_cents: amountCents,
    fee_cents: feeCents,
    net_amount_cents: netAmountCents,
    occurred_at: occurredAt,
    description,
    source_type: sourceType,
    source_id: sourceId,
    metadata: metadata ?? {},
    created_by: userId,
  });

  if (error) {
    console.warn("financial_ledger_entries unavailable", error.message);
    return;
  }

  if (entryId) {
    await recordEntryEvent({
      admin,
      clinicId,
      userId,
      entryId,
      eventType: "ledger_posted",
      newValues: { amount_cents: amountCents, net_amount_cents: netAmountCents, direction, source_type: sourceType },
      notes: description,
    });
  }
}

export async function saveFinancialAccountAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = financialAccountSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    account_type: formData.get("account_type"),
    bank_name: formData.get("bank_name"),
    agency: formData.get("agency"),
    account_number: formData.get("account_number"),
    pix_key: formData.get("pix_key"),
    opening_balance: formData.get("opening_balance"),
    notes: formData.get("notes"),
    active: formData.get("active") ?? "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para gerenciar contas financeiras." };

  const admin = createSupabaseAdminClient();
  const openingBalance = parseCurrencyToCents(parsed.data.opening_balance);
  const payload = {
    name: parsed.data.name,
    account_type: parsed.data.account_type,
    bank_name: parsed.data.bank_name,
    agency: parsed.data.agency,
    account_number: parsed.data.account_number,
    pix_key: parsed.data.pix_key,
    opening_balance_cents: openingBalance,
    active: parsed.data.active,
    notes: parsed.data.notes,
    updated_by: context.user.id,
  };

  if (parsed.data.id) {
    const { data: previous } = await admin
      .from("financial_accounts")
      .select("*")
      .eq("id", parsed.data.id)
      .eq("clinic_id", context.activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!previous) return { error: "Conta financeira não encontrada." };

    const { error } = await admin.from("financial_accounts").update(payload).eq("id", parsed.data.id);
    if (error) return { error: financialError(error, "Não foi possível atualizar a conta.") };

    await logAuditEvent({
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      actionType: "financial_account_updated",
      module: "financial",
      recordTable: "financial_accounts",
      recordId: parsed.data.id,
      oldValues: previous,
      newValues: payload,
    });
  } else {
    const { data, error } = await admin
      .from("financial_accounts")
      .insert({ clinic_id: context.activeClinic.id, ...payload, current_balance_cents: openingBalance, created_by: context.user.id })
      .select("id")
      .single();
    if (error || !data) return { error: financialError(error, "Não foi possível criar a conta.") };

    await logAuditEvent({
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      actionType: "financial_account_created",
      module: "financial",
      recordTable: "financial_accounts",
      recordId: data.id,
      newValues: payload,
    });
  }

  revalidateFinancial();
  return { success: parsed.data.id ? "Conta atualizada." : "Conta criada." };
}

export async function savePaymentMethodAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = paymentMethodSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    method_type: formData.get("method_type"),
    requires_card_machine: formData.get("requires_card_machine") ?? "off",
    settlement_days: formData.get("settlement_days"),
    active: formData.get("active") ?? "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para gerenciar formas de pagamento." };

  const admin = createSupabaseAdminClient();
  const { data: previous } = parsed.data.id
    ? await admin
        .from("financial_payment_methods")
        .select("*")
        .eq("id", parsed.data.id)
        .eq("clinic_id", context.activeClinic.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  if (parsed.data.id && !previous) return { error: "Forma de pagamento não encontrada." };
  const payload = { ...parsed.data, id: undefined, updated_by: context.user.id };
  const result = parsed.data.id
    ? await admin.from("financial_payment_methods").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("financial_payment_methods")
        .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { error: financialError(result.error, "Não foi possível salvar a forma de pagamento.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "payment_method_updated" : "payment_method_created",
    module: "financial",
    recordTable: "financial_payment_methods",
    recordId: result.data.id,
    oldValues: previous,
    newValues: payload,
  });

  revalidateFinancial();
  return { success: parsed.data.id ? "Forma de pagamento atualizada." : "Forma de pagamento criada." };
}

export async function saveCardMachineAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = cardMachineSchema.safeParse({
    id: formData.get("id") || undefined,
    account_id: formData.get("account_id") || undefined,
    name: formData.get("name"),
    provider: formData.get("provider"),
    debit_fee: formData.get("debit_fee"),
    credit_fee: formData.get("credit_fee"),
    credit_installment_fee: formData.get("credit_installment_fee"),
    debit_settlement_days: formData.get("debit_settlement_days"),
    credit_settlement_days: formData.get("credit_settlement_days"),
    notes: formData.get("notes"),
    active: formData.get("active") ?? "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para gerenciar máquinas." };

  const admin = createSupabaseAdminClient();
  const { data: previous } = parsed.data.id
    ? await admin
        .from("financial_card_machines")
        .select("*")
        .eq("id", parsed.data.id)
        .eq("clinic_id", context.activeClinic.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  if (parsed.data.id && !previous) return { error: "Máquina de cartão não encontrada." };
  const payload = {
    account_id: parsed.data.account_id,
    name: parsed.data.name,
    provider: parsed.data.provider,
    debit_fee_bps: percentToBps(parsed.data.debit_fee),
    credit_fee_bps: percentToBps(parsed.data.credit_fee),
    credit_installment_fee_bps: percentToBps(parsed.data.credit_installment_fee),
    debit_settlement_days: parsed.data.debit_settlement_days,
    credit_settlement_days: parsed.data.credit_settlement_days,
    notes: parsed.data.notes,
    active: parsed.data.active,
    updated_by: context.user.id,
  };
  const result = parsed.data.id
    ? await admin.from("financial_card_machines").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("financial_card_machines")
        .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { error: financialError(result.error, "Não foi possível salvar a máquina de cartão.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "card_machine_updated" : "card_machine_created",
    module: "financial",
    recordTable: "financial_card_machines",
    recordId: result.data.id,
    oldValues: previous,
    newValues: payload,
  });

  revalidateFinancial();
  return { success: parsed.data.id ? "Máquina atualizada." : "Máquina cadastrada." };
}

export async function saveVendorAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = vendorSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    document: formData.get("document"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    vendor_type: formData.get("vendor_type"),
    notes: formData.get("notes"),
    active: formData.get("active") ?? "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para gerenciar fornecedores." };

  const admin = createSupabaseAdminClient();
  const { data: previous } = parsed.data.id
    ? await admin
        .from("financial_vendors")
        .select("*")
        .eq("id", parsed.data.id)
        .eq("clinic_id", context.activeClinic.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  if (parsed.data.id && !previous) return { error: "Fornecedor não encontrado." };
  const payload = { ...parsed.data, id: undefined, updated_by: context.user.id };
  const result = parsed.data.id
    ? await admin.from("financial_vendors").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("financial_vendors")
        .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { error: financialError(result.error, "Não foi possível salvar o fornecedor.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "vendor_updated" : "vendor_created",
    module: "financial",
    recordTable: "financial_vendors",
    recordId: result.data.id,
    oldValues: previous,
    newValues: payload,
  });

  revalidateFinancial();
  return { success: parsed.data.id ? "Fornecedor atualizado." : "Fornecedor cadastrado." };
}

export async function saveFinancialCategoryAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = financialCategorySchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    direction: formData.get("direction"),
    parent_id: formData.get("parent_id") || undefined,
    active: formData.get("active") ?? "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para gerenciar categorias financeiras." };

  const admin = createSupabaseAdminClient();
  const { data: previous } = parsed.data.id
    ? await admin
        .from("financial_categories")
        .select("*")
        .eq("id", parsed.data.id)
        .eq("clinic_id", context.activeClinic.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  if (parsed.data.id && !previous) return { error: "Categoria não encontrada." };

  const payload = {
    name: parsed.data.name,
    direction: parsed.data.direction,
    parent_id: parsed.data.parent_id,
    active: parsed.data.active,
    updated_by: context.user.id,
  };
  const result = parsed.data.id
    ? await admin.from("financial_categories").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("financial_categories")
        .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { error: financialError(result.error, "Não foi possível salvar a categoria.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "financial_category_updated" : "financial_category_created",
    module: "financial",
    recordTable: "financial_categories",
    recordId: result.data.id,
    oldValues: previous,
    newValues: payload,
  });

  revalidateFinancial();
  return { success: parsed.data.id ? "Categoria atualizada." : "Categoria criada." };
}

export async function saveCostCenterAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = costCenterSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    code: formData.get("code"),
    notes: formData.get("notes"),
    active: formData.get("active") ?? "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para gerenciar centros de custo." };

  const admin = createSupabaseAdminClient();
  const { data: previous } = parsed.data.id
    ? await admin
        .from("financial_cost_centers")
        .select("*")
        .eq("id", parsed.data.id)
        .eq("clinic_id", context.activeClinic.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  if (parsed.data.id && !previous) return { error: "Centro de custo não encontrado." };

  const payload = {
    name: parsed.data.name,
    code: parsed.data.code,
    notes: parsed.data.notes,
    active: parsed.data.active,
    updated_by: context.user.id,
  };
  const result = parsed.data.id
    ? await admin.from("financial_cost_centers").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("financial_cost_centers")
        .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { error: financialError(result.error, "Não foi possível salvar o centro de custo.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "financial_cost_center_updated" : "financial_cost_center_created",
    module: "financial",
    recordTable: "financial_cost_centers",
    recordId: result.data.id,
    oldValues: previous,
    newValues: payload,
  });

  revalidateFinancial();
  return { success: parsed.data.id ? "Centro de custo atualizado." : "Centro de custo criado." };
}

export async function saveHealthPlanAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = healthPlanSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    document: formData.get("document"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    notes: formData.get("notes"),
    active: formData.get("active") ?? "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para gerenciar convênios." };

  const admin = createSupabaseAdminClient();
  const { data: previous } = parsed.data.id
    ? await admin
        .from("financial_health_plans")
        .select("*")
        .eq("id", parsed.data.id)
        .eq("clinic_id", context.activeClinic.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  if (parsed.data.id && !previous) return { error: "Convênio não encontrado." };

  const payload = {
    name: parsed.data.name,
    document: parsed.data.document,
    email: parsed.data.email,
    phone: parsed.data.phone,
    notes: parsed.data.notes,
    active: parsed.data.active,
    updated_by: context.user.id,
  };
  const result = parsed.data.id
    ? await admin.from("financial_health_plans").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("financial_health_plans")
        .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { error: financialError(result.error, "Não foi possível salvar o convênio.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "financial_health_plan_updated" : "financial_health_plan_created",
    module: "financial",
    recordTable: "financial_health_plans",
    recordId: result.data.id,
    oldValues: previous,
    newValues: payload,
  });

  revalidateFinancial();
  return { success: parsed.data.id ? "Convênio atualizado." : "Convênio criado." };
}

export async function saveFinancialRecurringEntryAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = recurringEntrySchema.safeParse({
    id: formData.get("id") || undefined,
    vendor_id: formData.get("vendor_id") || undefined,
    category_id: formData.get("category_id") || undefined,
    cost_center_id: formData.get("cost_center_id") || undefined,
    description: formData.get("description"),
    amount: formData.get("amount"),
    frequency: formData.get("frequency"),
    next_due_date: formData.get("next_due_date"),
    notes: formData.get("notes"),
    active: formData.get("active") ?? "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para gerenciar recorrências financeiras." };

  const admin = createSupabaseAdminClient();
  const { data: previous } = parsed.data.id
    ? await admin
        .from("financial_recurring_entries")
        .select("*")
        .eq("id", parsed.data.id)
        .eq("clinic_id", context.activeClinic.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };
  if (parsed.data.id && !previous) return { error: "Recorrência financeira não encontrada." };

  const payload = {
    vendor_id: parsed.data.vendor_id,
    category_id: parsed.data.category_id,
    cost_center_id: parsed.data.cost_center_id,
    description: parsed.data.description,
    amount_cents: parseCurrencyToCents(parsed.data.amount),
    frequency: parsed.data.frequency,
    next_due_date: parsed.data.next_due_date,
    notes: parsed.data.notes,
    active: parsed.data.active,
    updated_by: context.user.id,
  };

  const result = parsed.data.id
    ? await admin.from("financial_recurring_entries").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("financial_recurring_entries")
        .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { error: financialError(result.error, "Não foi possível salvar a recorrência.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "financial_recurring_entry_updated" : "financial_recurring_entry_created",
    module: "financial",
    recordTable: "financial_recurring_entries",
    recordId: result.data.id,
    oldValues: previous,
    newValues: payload,
  });

  revalidateFinancial();
  return { success: parsed.data.id ? "Recorrência atualizada." : "Recorrência cadastrada." };
}

export async function generatePayableFromRecurringAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = generateRecurringPayableSchema.safeParse({
    recurring_id: formData.get("recurring_id"),
    issue_date: formData.get("issue_date"),
    due_date: formData.get("due_date"),
    document_number: formData.get("document_number"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canCreate) return { error: "Você não possui permissão para gerar contas a pagar." };

  const admin = createSupabaseAdminClient();
  const { data: recurring } = await admin
    .from("financial_recurring_entries")
    .select("*")
    .eq("id", parsed.data.recurring_id)
    .eq("clinic_id", context.activeClinic.id)
    .eq("active", true)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      vendor_id: string | null;
      category_id: string | null;
      cost_center_id: string | null;
      description: string;
      amount_cents: number;
      frequency: "weekly" | "monthly" | "quarterly" | "yearly";
      next_due_date: string;
      notes: string | null;
    }>();

  if (!recurring) return { error: "Recorrência ativa não encontrada." };

  const payload = {
    entry_type: "payable",
    origin: "manual",
    status: "pending",
    vendor_id: recurring.vendor_id,
    category_id: recurring.category_id,
    cost_center_id: recurring.cost_center_id,
    document_type: "contract",
    document_number: parsed.data.document_number,
    description: recurring.description,
    issue_date: parsed.data.issue_date,
    due_date: parsed.data.due_date,
    competence_date: parsed.data.due_date,
    amount_cents: recurring.amount_cents,
    discount_cents: 0,
    freight_cents: 0,
    addition_cents: 0,
    notes: parsed.data.notes ?? recurring.notes,
    updated_by: context.user.id,
  };

  const { data: entry, error } = await admin
    .from("financial_entries")
    .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
    .select("id")
    .single<{ id: string }>();

  if (error || !entry) {
    return { error: financialError(error, "Não foi possível gerar a conta a pagar.") };
  }

  const nextDueDate = advanceRecurringDueDate(parsed.data.due_date, recurring.frequency);
  await admin
    .from("financial_recurring_entries")
    .update({ next_due_date: nextDueDate, updated_by: context.user.id })
    .eq("id", recurring.id);

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "financial_recurring_payable_generated",
    module: "financial",
    recordTable: "financial_entries",
    recordId: entry.id,
    oldValues: recurring,
    newValues: { ...payload, recurring_id: recurring.id, next_due_date: nextDueDate },
    level: "security",
    notes: "Conta a pagar gerada a partir de recorrência financeira.",
  });
  await recordEntryEvent({
    admin,
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    entryId: entry.id,
    eventType: "created",
    newValues: { ...payload, recurring_id: recurring.id },
    notes: "Gerada por recorrência financeira.",
  });

  revalidateFinancial();
  return { success: "Conta a pagar gerada a partir da recorrência." };
}

export async function saveFinancialEntryAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = financialEntrySchema.safeParse({
    id: formData.get("id") || undefined,
    entry_type: formData.get("entry_type"),
    patient_id: formData.get("patient_id") || undefined,
    vendor_id: formData.get("vendor_id") || undefined,
    professional_member_id: formData.get("professional_member_id") || undefined,
    category_id: formData.get("category_id") || undefined,
    cost_center_id: formData.get("cost_center_id") || undefined,
    health_plan_id: formData.get("health_plan_id") || undefined,
    document_type: formData.get("document_type") || undefined,
    description: formData.get("description"),
    document_number: formData.get("document_number"),
    issue_date: formData.get("issue_date"),
    due_date: formData.get("due_date"),
    competence_date: formData.get("competence_date"),
    amount: formData.get("amount"),
    discount: formData.get("discount"),
    freight: formData.get("freight"),
    addition: formData.get("addition"),
    line_items_json: formData.get("line_items_json"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };
  const parsedItems = parseFinancialEntryItems(parsed.data.line_items_json);
  if ("error" in parsedItems) return { error: parsedItems.error };
  const lineItems = parsed.data.entry_type === "payable" ? parsedItems.items : [];
  const itemsSubtotal = lineItems.reduce((sum, item) => sum + item.total_amount_cents, 0);
  const manualAmountCents = parseCurrencyToCents(parsed.data.amount);
  if (parsed.data.entry_type === "payable" && !lineItems.length && manualAmountCents <= 0) {
    return { error: "Informe ao menos um item ou um valor para o documento a pagar." };
  }

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (parsed.data.id ? !context.access.canEdit : !context.access.canCreate) {
    return { error: "Você não possui permissão para salvar lançamentos financeiros." };
  }

  const admin = createSupabaseAdminClient();
  if (parsed.data.id && (await entryHasClosedReconciliation(admin, parsed.data.id))) {
    return {
      error:
        "Este lançamento possui pagamento em conciliação bancária fechada. Reabra a conciliação antes de editar.",
    };
  }
  const { data: previous } = parsed.data.id
    ? await admin
        .from("financial_entries")
        .select("*")
        .eq("id", parsed.data.id)
        .eq("clinic_id", context.activeClinic.id)
        .is("deleted_at", null)
        .maybeSingle<FinancialEntry>()
    : { data: null };
  if (parsed.data.id && !previous) return { error: "Lançamento financeiro não encontrado." };
  if (previous && ["cancelled", "refunded"].includes(previous.status)) {
    return { error: "Lançamentos cancelados ou estornados não podem ser editados." };
  }

  const payload = {
    entry_type: parsed.data.entry_type,
    origin: "manual",
    patient_id: parsed.data.patient_id,
    vendor_id: parsed.data.vendor_id,
    professional_member_id: parsed.data.professional_member_id,
    category_id: parsed.data.category_id,
    cost_center_id: parsed.data.cost_center_id,
    health_plan_id: parsed.data.health_plan_id,
    document_type: parsed.data.document_type,
    description: parsed.data.description,
    document_number: parsed.data.document_number,
    issue_date: parsed.data.issue_date,
    due_date: parsed.data.due_date,
    competence_date: parsed.data.competence_date,
    amount_cents: lineItems.length ? itemsSubtotal : manualAmountCents,
    discount_cents: parseCurrencyToCents(parsed.data.discount),
    freight_cents: parseCurrencyToCents(parsed.data.freight),
    addition_cents: parseCurrencyToCents(parsed.data.addition),
    notes: parsed.data.notes,
    updated_by: context.user.id,
  };
  const result = parsed.data.id
    ? await admin.from("financial_entries").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("financial_entries")
        .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { error: financialError(result.error, "Não foi possível salvar o lançamento.") };
  }

  if (parsed.data.entry_type === "payable") {
    await admin
      .from("financial_entry_items")
      .update({ deleted_at: new Date().toISOString(), updated_by: context.user.id })
      .eq("entry_id", result.data.id)
      .eq("clinic_id", context.activeClinic.id)
      .is("deleted_at", null);

    if (lineItems.length) {
      const { error: itemsError } = await admin.from("financial_entry_items").insert(
        lineItems.map((item) => ({
          clinic_id: context.activeClinic.id,
          entry_id: result.data.id,
          ...item,
          created_by: context.user.id,
          updated_by: context.user.id,
        })),
      );
      if (itemsError) {
        return { error: financialError(itemsError, "O lançamento foi salvo, mas os itens do documento não foram registrados.") };
      }
    }
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "financial_entry_updated" : "financial_entry_created",
    module: "financial",
    recordTable: "financial_entries",
    recordId: result.data.id,
    oldValues: previous,
    newValues: payload,
  });
  await recordEntryEvent({
    admin,
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    entryId: result.data.id,
    eventType: parsed.data.id ? "updated" : "created",
    oldValues: previous,
    newValues: { ...payload, items: lineItems },
    notes: parsed.data.id ? "Lançamento financeiro editado." : "Lançamento financeiro criado.",
  });

  revalidateFinancial();
  return { success: parsed.data.id ? "Lançamento atualizado." : "Lançamento criado." };
}

export async function cancelFinancialEntryAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = cancelFinancialEntrySchema.safeParse({
    entry_id: formData.get("entry_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para cancelar lançamentos financeiros." };

  const admin = createSupabaseAdminClient();
  if (await entryHasClosedReconciliation(admin, parsed.data.entry_id)) {
    return { error: "Este lançamento possui movimento conciliado. Reabra a conciliação antes de cancelar." };
  }

  const { data: entry } = await admin
    .from("financial_entries")
    .select("*")
    .eq("id", parsed.data.entry_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<FinancialEntry>();
  if (!entry) return { error: "Lançamento financeiro não encontrado." };
  const { data: payments } = await admin
    .from("financial_payments")
    .select("id")
    .eq("entry_id", entry.id)
    .eq("clinic_id", context.activeClinic.id)
    .eq("status", "confirmed")
    .is("deleted_at", null)
    .limit(1);
  if (entry.paid_cents > 0 || payments?.length) {
    return { error: "Lançamentos com baixa registrada devem ter os pagamentos estornados antes do cancelamento." };
  }
  if (entry.status === "cancelled") return { error: "Este lançamento já está cancelado." };

  const payload = {
    status: "cancelled",
    cancelled_reason: parsed.data.reason,
    cancelled_at: new Date().toISOString(),
    cancelled_by: context.user.id,
    updated_by: context.user.id,
  };
  const { error } = await admin.from("financial_entries").update(payload).eq("id", entry.id);
  if (error) return { error: financialError(error, "Não foi possível cancelar o lançamento.") };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "financial_entry_cancelled",
    module: "financial",
    recordTable: "financial_entries",
    recordId: entry.id,
    oldValues: entry,
    newValues: payload,
    level: "critical",
    notes: "Cancelamento financeiro com motivo obrigatório.",
  });
  await recordEntryEvent({
    admin,
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    entryId: entry.id,
    eventType: "cancelled",
    oldValues: entry,
    newValues: payload,
    notes: parsed.data.reason,
  });

  revalidateFinancial();
  return { success: "Lançamento cancelado com auditoria." };
}

export async function createEncounterChargeAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = encounterChargeSchema.safeParse({
    encounter_id: formData.get("encounter_id"),
    amount: formData.get("amount"),
    discount: formData.get("discount"),
    addition: formData.get("addition"),
    paid_now: formData.get("paid_now") ?? "off",
    account_id: formData.get("account_id") || undefined,
    payment_method_id: formData.get("payment_method_id") || undefined,
    card_machine_id: formData.get("card_machine_id") || undefined,
    paid_at: formData.get("paid_at"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canChargeEncounter) {
    return { error: "Você não possui permissão para cobrar atendimentos." };
  }

  const admin = createSupabaseAdminClient();
  const { data: encounter } = await admin
    .from("clinical_encounters")
    .select("id, clinic_id, appointment_id, patient_id, professional_member_id, status")
    .eq("id", parsed.data.encounter_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      clinic_id: string;
      appointment_id: string;
      patient_id: string;
      professional_member_id: string;
      status: string;
    }>();

  if (!encounter || !["consultation_completed", "billing_pending"].includes(encounter.status)) {
    return { error: "Este atendimento ainda não esta liberado para cobrança." };
  }

  const { data: existing } = await admin
    .from("financial_entries")
    .select("id")
    .eq("clinic_id", context.activeClinic.id)
    .eq("encounter_id", encounter.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return { error: "Este atendimento já possui cobrança financeira." };

  const { data: appointment } = await admin
    .from("appointments")
    .select("service_id, appointment_type")
    .eq("id", encounter.appointment_id)
    .maybeSingle<{ service_id: string | null; appointment_type: string }>();
  const { data: service } = appointment?.service_id
    ? await admin
        .from("clinic_services")
        .select("name")
        .eq("id", appointment.service_id)
        .maybeSingle<{ name: string }>()
    : { data: null };
  const preferences = await getFinancialPreferences(context.activeClinic.id);
  if (preferences?.require_payment_method_on_checkout && parsed.data.paid_now && !parsed.data.payment_method_id) {
    return { error: "Informe a forma de pagamento para baixar a cobrança agora." };
  }

  const amount = parseCurrencyToCents(parsed.data.amount);
  const discount = parseCurrencyToCents(parsed.data.discount);
  const addition = parseCurrencyToCents(parsed.data.addition);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (preferences?.default_receivable_due_days ?? 0));
  const total = Math.max(amount - discount + addition, 0);
  const payload = {
    entry_type: "receivable",
    origin: "appointment",
    status: parsed.data.paid_now ? "paid" : "pending",
    patient_id: encounter.patient_id,
    appointment_id: encounter.appointment_id,
    encounter_id: encounter.id,
    professional_member_id: encounter.professional_member_id,
    description: service?.name ?? appointment?.appointment_type ?? "Consulta",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: dueDate.toISOString().slice(0, 10),
    competence_date: new Date().toISOString().slice(0, 10),
    amount_cents: amount,
    discount_cents: discount,
    addition_cents: addition,
    paid_cents: parsed.data.paid_now ? total : 0,
    notes: parsed.data.notes,
    updated_by: context.user.id,
  };
  const { data: entry, error } = await admin
    .from("financial_entries")
    .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
    .select("id")
    .single<{ id: string }>();
  if (error || !entry) return { error: financialError(error, "Não foi possível criar a cobrança.") };

  let receiptId: string | undefined;
  if (parsed.data.paid_now && total > 0) {
    const payment = await createPayment({
      admin,
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      entryId: entry.id,
      entryType: "receivable",
      amountCents: total,
      accountId: parsed.data.account_id,
      paymentMethodId: parsed.data.payment_method_id,
      cardMachineId: parsed.data.card_machine_id,
      paidAt: parsed.data.paid_at,
      notes: parsed.data.notes,
    });
    if (payment.error) return { error: payment.error };
    receiptId = await createReceipt({
      admin,
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      entryId: entry.id,
      patientId: encounter.patient_id,
      receiptType: "payment",
      notes: parsed.data.notes,
    });
  }

  await admin
    .from("clinical_encounters")
    .update({
      status: parsed.data.paid_now ? "billed" : "billing_pending",
      updated_by: context.user.id,
    })
    .eq("id", encounter.id);

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.paid_now ? "encounter_charged_and_paid" : "encounter_charge_created",
    module: "financial",
    recordTable: "financial_entries",
    recordId: entry.id,
    newValues: payload,
    level: "security",
    notes: "Cobranca vinculada ao atendimento.",
  });

  revalidateFinancial();
  return {
    success: parsed.data.paid_now ? "Atendimento cobrado e recebido." : "Cobranca criada em aberto.",
    receiptId,
  };
}

export async function settleFinancialEntryAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = settleEntrySchema.safeParse({
    entry_id: formData.get("entry_id"),
    account_id: formData.get("account_id") || undefined,
    payment_method_id: formData.get("payment_method_id") || undefined,
    card_machine_id: formData.get("card_machine_id") || undefined,
    amount: formData.get("amount"),
    paid_at: formData.get("paid_at"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage && !context.access.canEdit) {
    return { error: "Você não possui permissão para baixar lançamentos." };
  }

  const admin = createSupabaseAdminClient();
  const { data: entry } = await admin
    .from("financial_entries")
    .select("*")
    .eq("id", parsed.data.entry_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<FinancialEntry>();
  if (!entry) return { error: "Lançamento financeiro não encontrado." };
  if (["paid", "cancelled", "refunded"].includes(entry.status)) {
    return { error: "Este lançamento não pode ser baixado no status atual." };
  }

  const total = entry.amount_cents - entry.discount_cents + (entry.freight_cents ?? 0) + entry.addition_cents;
  const openAmount = Math.max(total - entry.paid_cents, 0);
  const amount = parseCurrencyToCents(parsed.data.amount);
  if (amount > openAmount) return { error: "O valor baixado não pode ultrapassar o saldo em aberto." };

  const payment = await createPayment({
    admin,
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    entryId: entry.id,
    entryType: entry.entry_type,
    amountCents: amount,
    accountId: parsed.data.account_id,
    paymentMethodId: parsed.data.payment_method_id,
    cardMachineId: parsed.data.card_machine_id,
    paidAt: parsed.data.paid_at,
    notes: parsed.data.notes,
  });
  if (payment.error) return { error: payment.error };

  const nextPaid = entry.paid_cents + amount;
  const nextStatus = nextPaid >= total ? "paid" : "partial";
  await admin
    .from("financial_entries")
    .update({ paid_cents: nextPaid, status: nextStatus, updated_by: context.user.id })
    .eq("id", entry.id);

  if (entry.encounter_id && entry.entry_type === "receivable" && nextStatus === "paid") {
    await admin
      .from("clinical_encounters")
      .update({ status: "billed", updated_by: context.user.id })
      .eq("id", entry.encounter_id);
  }

  const receiptId =
    entry.entry_type === "receivable"
      ? await createReceipt({
          admin,
          clinicId: context.activeClinic.id,
          userId: context.user.id,
          entryId: entry.id,
          patientId: entry.patient_id,
          receiptType: "payment",
          notes: parsed.data.notes,
        })
      : undefined;

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: entry.entry_type === "receivable" ? "receivable_settled" : "payable_settled",
    module: "financial",
    recordTable: "financial_payments",
    recordId: payment.paymentId,
    oldValues: entry,
    newValues: { amount_cents: amount, status: nextStatus },
    level: "security",
    notes: "Baixa financeira registrada.",
  });
  await recordEntryEvent({
    admin,
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    entryId: entry.id,
    eventType: "settled",
    oldValues: entry,
    newValues: { payment_id: payment.paymentId, amount_cents: amount, status: nextStatus },
    notes: "Baixa financeira registrada.",
  });

  revalidateFinancial();
  return { success: "Baixa registrada.", receiptId };
}

export async function reverseFinancialPaymentAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = reversePaymentSchema.safeParse({
    payment_id: formData.get("payment_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para estornar pagamentos." };

  const admin = createSupabaseAdminClient();
  const { data: payment } = await admin
    .from("financial_payments")
    .select("*")
    .eq("id", parsed.data.payment_id)
    .eq("clinic_id", context.activeClinic.id)
    .eq("status", "confirmed")
    .is("deleted_at", null)
    .maybeSingle<FinancialPayment>();
  if (!payment) return { error: "Pagamento/recebimento não encontrado ou já estornado." };
  if (payment.reconciliation_id) {
    return {
      error:
        "Este pagamento está em conciliação bancária fechada. Reabra a conciliação antes de estornar.",
    };
  }

  const { data: entry } = await admin
    .from("financial_entries")
    .select("*")
    .eq("id", payment.entry_id)
    .maybeSingle<FinancialEntry>();
  if (!entry) return { error: "Lançamento vinculado não encontrado." };

  await admin
    .from("financial_payments")
    .update({
      status: "reversed",
      reversal_reason: parsed.data.reason,
      reversed_at: new Date().toISOString(),
      updated_by: context.user.id,
    })
    .eq("id", payment.id);

  const nextPaid = Math.max(entry.paid_cents - payment.amount_cents, 0);
  const total = entry.amount_cents - entry.discount_cents + (entry.freight_cents ?? 0) + entry.addition_cents;
  const nextStatus = nextPaid === 0 ? "pending" : nextPaid >= total ? "paid" : "partial";
  await admin
    .from("financial_entries")
    .update({ paid_cents: nextPaid, status: nextStatus, updated_by: context.user.id })
    .eq("id", entry.id);

  if (payment.account_id) {
    await admin.rpc("increment_financial_account_balance", {
      account_uuid: payment.account_id,
      amount_delta: payment.direction === "in" ? -payment.net_amount_cents : payment.net_amount_cents,
    }).then(async ({ error }) => {
      if (!error) return;
      const { data: account } = await admin
        .from("financial_accounts")
        .select("current_balance_cents")
        .eq("id", payment.account_id)
        .maybeSingle<{ current_balance_cents: number }>();
      if (account) {
        await admin
          .from("financial_accounts")
          .update({
            current_balance_cents:
              account.current_balance_cents +
              (payment.direction === "in" ? -payment.net_amount_cents : payment.net_amount_cents),
            updated_by: context.user.id,
          })
          .eq("id", payment.account_id);
      }
    });
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "financial_payment_reversed",
    module: "financial",
    recordTable: "financial_payments",
    recordId: payment.id,
    oldValues: payment,
    newValues: { status: "reversed", reason: parsed.data.reason },
    level: "critical",
    notes: "Estorno financeiro registrado.",
  });
  await postLedgerEntry({
    admin,
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    accountId: payment.account_id,
    entryId: entry.id,
    paymentId: payment.id,
    direction: payment.direction === "in" ? "out" : "in",
    amountCents: payment.amount_cents,
    feeCents: payment.fee_cents,
    netAmountCents: payment.net_amount_cents,
    occurredAt: new Date().toISOString(),
    description: "Estorno financeiro.",
    sourceType: "reversal",
    sourceId: payment.id,
    metadata: { reason: parsed.data.reason },
  });
  await recordEntryEvent({
    admin,
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    entryId: entry.id,
    eventType: "payment_reversed",
    oldValues: payment,
    newValues: { status: "reversed", reason: parsed.data.reason, entry_status: nextStatus },
    notes: parsed.data.reason,
  });

  revalidateFinancial();
  return { success: "Estorno registrado com auditoria." };
}

export async function createFinancialReconciliationAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = reconciliationSchema.safeParse({
    account_id: formData.get("account_id"),
    period_start: formData.get("period_start"),
    period_end: formData.get("period_end"),
    opening_balance: formData.get("opening_balance"),
    bank_balance: formData.get("bank_balance"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para fechar conciliação bancária." };

  const admin = createSupabaseAdminClient();
  const { data: account } = await admin
    .from("financial_accounts")
    .select("id, name")
    .eq("id", parsed.data.account_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; name: string }>();
  if (!account) return { error: "Conta financeira não encontrada." };

  const periodStart = `${parsed.data.period_start}T00:00:00.000`;
  const periodEnd = `${parsed.data.period_end}T23:59:59.999`;
  const { data: payments, error } = await admin
    .from("financial_payments")
    .select("id, entry_id, direction, net_amount_cents, amount_cents, fee_cents, paid_at")
    .eq("clinic_id", context.activeClinic.id)
    .eq("account_id", parsed.data.account_id)
    .eq("status", "confirmed")
    .is("deleted_at", null)
    .is("reconciliation_id", null)
    .gte("paid_at", periodStart)
    .lte("paid_at", periodEnd);

  if (error) return { error: financialError(error, "Não foi possível buscar os movimentos do período.") };
  if (!payments?.length) {
    return { error: "Não existem movimentos confirmados e pendentes de conciliação para esta conta no período." };
  }

  const totalIn = payments
    .filter((payment) => payment.direction === "in")
    .reduce((sum, payment) => sum + Number(payment.net_amount_cents ?? 0), 0);
  const totalOut = payments
    .filter((payment) => payment.direction === "out")
    .reduce((sum, payment) => sum + Number(payment.net_amount_cents ?? 0), 0);
  const openingBalance = parseCurrencyToCents(parsed.data.opening_balance);
  const bankBalance = parseCurrencyToCents(parsed.data.bank_balance);
  const expectedBalance = openingBalance + totalIn - totalOut;
  const difference = bankBalance - expectedBalance;

  if (difference !== 0) {
    return {
      error: `A conciliação não fecha. Diferença encontrada: ${formatCurrencyBRL(difference)}. Revise lançamentos ou saldo bancário antes de fechar.`,
    };
  }

  const { data: reconciliation, error: insertError } = await admin
    .from("financial_reconciliations")
    .insert({
      clinic_id: context.activeClinic.id,
      account_id: parsed.data.account_id,
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      opening_balance_cents: openingBalance,
      total_in_cents: totalIn,
      total_out_cents: totalOut,
      expected_balance_cents: expectedBalance,
      bank_balance_cents: bankBalance,
      difference_cents: difference,
      closed_by: context.user.id,
      notes: parsed.data.notes,
      created_by: context.user.id,
      updated_by: context.user.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !reconciliation) {
    return { error: financialError(insertError, "Não foi possível fechar a conciliação.") };
  }

  const paymentIds = payments.map((payment) => payment.id);
  const { error: updateError } = await admin
    .from("financial_payments")
    .update({
      reconciliation_id: reconciliation.id,
      reconciled_at: new Date().toISOString(),
      reconciled_by: context.user.id,
      updated_by: context.user.id,
    })
    .in("id", paymentIds);

  if (updateError) {
    await admin
      .from("financial_reconciliations")
      .update({
        status: "reversed",
        reversed_at: new Date().toISOString(),
        reversed_by: context.user.id,
        reversal_reason: "Falha automática ao vincular movimentos.",
        updated_by: context.user.id,
      })
      .eq("id", reconciliation.id);
    return { error: financialError(updateError, "A conciliação foi criada, mas os movimentos não foram vinculados.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "financial_reconciliation_closed",
    module: "financial",
    recordTable: "financial_reconciliations",
    recordId: reconciliation.id,
    newValues: {
      account_id: parsed.data.account_id,
      account_name: account.name,
      period_start: parsed.data.period_start,
      period_end: parsed.data.period_end,
      movement_count: paymentIds.length,
      expected_balance_cents: expectedBalance,
      bank_balance_cents: bankBalance,
    },
    level: "critical",
    notes: "Conciliação bancária fechada e movimentos travados.",
  });
  await Promise.all(
    payments.map((payment) =>
      recordEntryEvent({
        admin,
        clinicId: context.activeClinic.id,
        userId: context.user.id,
        entryId: payment.entry_id,
        eventType: "reconciliation_closed",
        newValues: { reconciliation_id: reconciliation.id, payment_id: payment.id },
        notes: "Movimento travado por conciliação bancária.",
      }),
    ),
  );

  revalidateFinancial();
  return { success: "Conciliação bancária fechada. Movimentos do período foram travados." };
}

export async function reverseFinancialReconciliationAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = reverseReconciliationSchema.safeParse({
    reconciliation_id: formData.get("reconciliation_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canApprove) return { error: "Você não possui permissão para reabrir conciliações bancárias." };

  const admin = createSupabaseAdminClient();
  const { data: reconciliation } = await admin
    .from("financial_reconciliations")
    .select("*")
    .eq("id", parsed.data.reconciliation_id)
    .eq("clinic_id", context.activeClinic.id)
    .eq("status", "closed")
    .is("deleted_at", null)
    .maybeSingle();

  if (!reconciliation) return { error: "Conciliação fechada não encontrada." };

  const { data: linkedPayments } = await admin
    .from("financial_payments")
    .select("id, entry_id")
    .eq("reconciliation_id", parsed.data.reconciliation_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null);

  const { error: reverseError } = await admin
    .from("financial_reconciliations")
    .update({
      status: "reversed",
      reversed_at: new Date().toISOString(),
      reversed_by: context.user.id,
      reversal_reason: parsed.data.reason,
      updated_by: context.user.id,
    })
    .eq("id", parsed.data.reconciliation_id);

  if (reverseError) return { error: financialError(reverseError, "Não foi possível reabrir a conciliação.") };

  const { error: paymentsError } = await admin
    .from("financial_payments")
    .update({
      reconciliation_id: null,
      reconciled_at: null,
      reconciled_by: null,
      updated_by: context.user.id,
    })
    .eq("reconciliation_id", parsed.data.reconciliation_id);

  if (paymentsError) {
    return { error: financialError(paymentsError, "A conciliação foi reaberta, mas os movimentos não foram liberados.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "financial_reconciliation_reversed",
    module: "financial",
    recordTable: "financial_reconciliations",
    recordId: parsed.data.reconciliation_id,
    oldValues: reconciliation,
    newValues: { status: "reversed", reason: parsed.data.reason },
    level: "critical",
    notes: "Conciliação bancária reaberta. Movimentos liberados para correção.",
  });
  await Promise.all(
    (linkedPayments ?? []).map((payment) =>
      recordEntryEvent({
        admin,
        clinicId: context.activeClinic.id,
        userId: context.user.id,
        entryId: payment.entry_id,
        eventType: "reconciliation_reopened",
        oldValues: { reconciliation_id: parsed.data.reconciliation_id },
        newValues: { reconciliation_id: null, payment_id: payment.id },
        notes: parsed.data.reason,
      }),
    ),
  );

  revalidateFinancial();
  return { success: "Conciliação reaberta. Movimentos liberados para ajuste." };
}

export async function issueFinancialReceiptAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = receiptSchema.safeParse({
    entry_id: formData.get("entry_id"),
    receipt_type: formData.get("receipt_type"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canCreate && !context.access.canView) {
    return { error: "Você não possui permissão para emitir recibos." };
  }

  const admin = createSupabaseAdminClient();
  const { data: entry } = await admin
    .from("financial_entries")
    .select("*")
    .eq("id", parsed.data.entry_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<FinancialEntry>();
  if (!entry) return { error: "Lançamento não encontrado." };

  const receiptId = await createReceipt({
    admin,
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    entryId: entry.id,
    patientId: entry.patient_id,
    receiptType: parsed.data.receipt_type,
    notes: parsed.data.notes,
  });

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.receipt_type === "payment" ? "financial_receipt_issued" : "payment_acknowledgement_issued",
    module: "financial",
    recordTable: "financial_receipts",
    recordId: receiptId,
    level: "security",
    notes: "Documento financeiro emitido.",
  });

  revalidateFinancial();
  return { success: "Documento financeiro emitido.", receiptId };
}

export async function saveFinancialPreferencesAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = preferencesSchema.safeParse({
    allow_reception_checkout: formData.get("allow_reception_checkout") ?? "off",
    allow_professional_checkout: formData.get("allow_professional_checkout") ?? "off",
    require_payment_method_on_checkout: formData.get("require_payment_method_on_checkout") ?? "off",
    default_receivable_due_days: formData.get("default_receivable_due_days"),
    default_late_fee: formData.get("default_late_fee"),
    default_monthly_interest: formData.get("default_monthly_interest"),
    receipt_footer: formData.get("receipt_footer"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para alterar preferências financeiras." };

  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin
    .from("financial_preferences")
    .select("*")
    .eq("clinic_id", context.activeClinic.id)
    .maybeSingle();
  const payload = {
    clinic_id: context.activeClinic.id,
    allow_reception_checkout: parsed.data.allow_reception_checkout,
    allow_professional_checkout: parsed.data.allow_professional_checkout,
    require_payment_method_on_checkout: parsed.data.require_payment_method_on_checkout,
    default_receivable_due_days: parsed.data.default_receivable_due_days,
    default_late_fee_cents: parseCurrencyToCents(parsed.data.default_late_fee),
    default_monthly_interest_bps: percentToBps(parsed.data.default_monthly_interest),
    receipt_footer: parsed.data.receipt_footer,
    deleted_at: null,
    created_by: previous?.created_by ?? context.user.id,
    updated_by: context.user.id,
  };
  const { error } = await admin.from("financial_preferences").upsert(payload, { onConflict: "clinic_id" });
  if (error) return { error: financialError(error, "Não foi possível salvar as preferências.") };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "financial_preferences_updated",
    module: "financial",
    recordTable: "financial_preferences",
    recordId: context.activeClinic.id,
    oldValues: previous,
    newValues: payload,
  });

  revalidateFinancial();
  return { success: "Preferencias financeiras salvas." };
}

async function createPayment({
  admin,
  clinicId,
  userId,
  entryId,
  entryType,
  amountCents,
  accountId,
  paymentMethodId,
  cardMachineId,
  paidAt,
  notes,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  clinicId: string;
  userId: string;
  entryId: string;
  entryType: "receivable" | "payable";
  amountCents: number;
  accountId: string | null;
  paymentMethodId: string | null;
  cardMachineId: string | null;
  paidAt: string;
  notes: string | null;
}): Promise<{ paymentId?: string; error?: string }> {
  let feeCents = 0;
  let expectedSettlementDate: string | null = null;
  const { data: method } = paymentMethodId
    ? await admin
        .from("financial_payment_methods")
        .select("method_type, settlement_days")
        .eq("id", paymentMethodId)
        .maybeSingle<{ method_type: string; settlement_days: number }>()
    : { data: null };
  const { data: machine } = cardMachineId
    ? await admin
        .from("financial_card_machines")
        .select("debit_fee_bps, credit_fee_bps, credit_settlement_days, debit_settlement_days")
        .eq("id", cardMachineId)
        .maybeSingle<{
          debit_fee_bps: number;
          credit_fee_bps: number;
          credit_settlement_days: number;
          debit_settlement_days: number;
        }>()
    : { data: null };

  if (machine && method?.method_type === "debit_card") {
    feeCents = Math.round((amountCents * machine.debit_fee_bps) / 10000);
    expectedSettlementDate = addDays(paidAt, machine.debit_settlement_days);
  } else if (machine && method?.method_type === "credit_card") {
    feeCents = Math.round((amountCents * machine.credit_fee_bps) / 10000);
    expectedSettlementDate = addDays(paidAt, machine.credit_settlement_days);
  } else if (method) {
    expectedSettlementDate = addDays(paidAt, method.settlement_days);
  }

  const netAmount = Math.max(amountCents - feeCents, 0);
  const payload = {
    clinic_id: clinicId,
    entry_id: entryId,
    account_id: accountId,
    payment_method_id: paymentMethodId,
    card_machine_id: cardMachineId,
    direction: entryType === "receivable" ? "in" : "out",
    amount_cents: amountCents,
    fee_cents: feeCents,
    net_amount_cents: netAmount,
    paid_at: paidAt,
    expected_settlement_date: expectedSettlementDate,
    notes,
    created_by: userId,
    updated_by: userId,
  };
  const { data, error } = await admin
    .from("financial_payments")
    .insert(payload)
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { error: financialError(error, "Não foi possível registrar a baixa.") };

  if (accountId) {
    const { data: account } = await admin
      .from("financial_accounts")
      .select("current_balance_cents")
      .eq("id", accountId)
      .maybeSingle<{ current_balance_cents: number }>();
    if (account) {
      await admin
        .from("financial_accounts")
        .update({
          current_balance_cents:
            account.current_balance_cents + (entryType === "receivable" ? netAmount : -netAmount),
          updated_by: userId,
        })
        .eq("id", accountId);
    }
  }

  await postLedgerEntry({
    admin,
    clinicId,
    userId,
    accountId,
    entryId,
    paymentId: data.id,
    direction: entryType === "receivable" ? "in" : "out",
    amountCents,
    feeCents,
    netAmountCents: netAmount,
    occurredAt: paidAt,
    description: entryType === "receivable" ? "Recebimento confirmado." : "Pagamento confirmado.",
    sourceType: "payment",
    sourceId: data.id,
    metadata: {
      payment_method_id: paymentMethodId,
      card_machine_id: cardMachineId,
      expected_settlement_date: expectedSettlementDate,
    },
  });

  return { paymentId: data.id };
}

async function createReceipt({
  admin,
  clinicId,
  userId,
  entryId,
  patientId,
  receiptType,
  notes,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  clinicId: string;
  userId: string;
  entryId: string;
  patientId: string | null;
  receiptType: "payment" | "payment_acknowledgement";
  notes: string | null;
}) {
  const { data: entry } = await admin
    .from("financial_entries")
    .select("*")
    .eq("id", entryId)
    .maybeSingle<FinancialEntry>();
  const { data: patient } = patientId
    ? await admin
        .from("patients")
        .select("full_name, social_name, cpf")
        .eq("id", patientId)
        .maybeSingle<{ full_name: string; social_name: string | null; cpf: string | null }>()
    : { data: null };
  const total = entry ? entry.amount_cents - entry.discount_cents + (entry.freight_cents ?? 0) + entry.addition_cents : 0;
  const open = entry ? Math.max(total - entry.paid_cents, 0) : 0;
  const patientName = patient?.social_name || patient?.full_name || "Paciente";
  const title = receiptType === "payment" ? "Recibo de pagamento" : "Ciencia de pagamento em aberto";
  const content =
    receiptType === "payment"
      ? `Recebemos de ${patientName} o valor de ${formatCurrencyBRL(entry?.paid_cents ?? total)} referente a ${entry?.description ?? "atendimento"}.\n\nObservações: ${notes ?? "Sem observações."}`
      : `${patientName} declara ciência do valor em aberto de ${formatCurrencyBRL(open)} referente a ${entry?.description ?? "atendimento"}, com vencimento em ${entry?.due_date ?? "data não informada"}.\n\nObservações: ${notes ?? "Sem observações."}`;

  const { data } = await admin
    .from("financial_receipts")
    .insert({
      clinic_id: clinicId,
      entry_id: entryId,
      patient_id: patientId,
      receipt_type: receiptType,
      title,
      content,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single<{ id: string }>();

  if (data?.id) {
    await recordEntryEvent({
      admin,
      clinicId,
      userId,
      entryId,
      eventType: "receipt_issued",
      newValues: { receipt_id: data.id, receipt_type: receiptType, title },
      notes: "Documento financeiro emitido.",
    });
  }

  return data?.id;
}

function addDays(value: string, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function advanceRecurringDueDate(value: string, frequency: "weekly" | "monthly" | "quarterly" | "yearly") {
  const date = new Date(`${value}T00:00:00`);
  if (frequency === "weekly") date.setDate(date.getDate() + 7);
  if (frequency === "monthly") date.setMonth(date.getMonth() + 1);
  if (frequency === "quarterly") date.setMonth(date.getMonth() + 3);
  if (frequency === "yearly") date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}
