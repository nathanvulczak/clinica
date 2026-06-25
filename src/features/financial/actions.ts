"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  cancelFinancialEntrySchema,
  cardMachineSchema,
  commissionRuleSchema,
  commissionSettlementSchema,
  commissionStatusSchema,
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
  settleCommissionSchema,
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

type FinancialLineItemPayload = {
  description: string;
  quantity: number;
  unit_amount_cents: number;
  total_amount_cents: number;
  sort_order: number;
  generate_stock: boolean;
  inventory_item_id: string | null;
  inventory_location_id: string | null;
  batch_number: string | null;
  expires_at: string | null;
};

type SavedFinancialLineItem = FinancialLineItemPayload & {
  id: string;
  entry_id: string;
  clinic_id: string;
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
    items: parsed.data.map<FinancialLineItemPayload>((item, index) => {
      const unitAmountCents = parseCurrencyToCents(item.unit_amount);
      const totalAmountCents = Math.round(item.quantity * unitAmountCents);
      return {
        description: item.description,
        quantity: item.quantity,
        unit_amount_cents: unitAmountCents,
        total_amount_cents: totalAmountCents,
        sort_order: index,
        generate_stock: item.generate_stock,
        inventory_item_id: item.inventory_item_id,
        inventory_location_id: item.inventory_location_id,
        batch_number: item.batch_number,
        expires_at: item.expires_at,
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
  if (message.includes("financial_period_closed")) {
    return "O período financeiro está fechado. Reabra o mês com autorização antes de alterar lançamentos.";
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

async function rebuildPurchaseInventoryFromPayable({
  admin,
  clinicId,
  userId,
  entryId,
  items,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  clinicId: string;
  userId: string;
  entryId: string;
  items: SavedFinancialLineItem[];
}) {
  const { data: previousMovements } = await admin
    .from("inventory_movements")
    .select("id, batch_id, quantity")
    .eq("clinic_id", clinicId)
    .eq("financial_entry_id", entryId)
    .eq("movement_type", "purchase_entry")
    .is("deleted_at", null);

  for (const movement of previousMovements ?? []) {
    if (!movement.batch_id) continue;
    const { data: batch } = await admin
      .from("inventory_batches")
      .select("id, quantity_on_hand")
      .eq("id", movement.batch_id)
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .maybeSingle();

    if (batch) {
      const currentQuantity = Number(batch.quantity_on_hand);
      const movementQuantity = Number(movement.quantity);
      if (currentQuantity < movementQuantity) {
        return {
          error:
            "Este documento já gerou estoque com consumo posterior. Para alterar, faça um ajuste no módulo Estoque.",
        };
      }

      await admin
        .from("inventory_batches")
        .update({ quantity_on_hand: currentQuantity - movementQuantity, updated_by: userId })
        .eq("id", batch.id)
        .eq("clinic_id", clinicId);
    }

    await admin
      .from("inventory_movements")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", movement.id)
      .eq("clinic_id", clinicId);
  }

  const stockItems = items.filter((item) => item.generate_stock && item.inventory_item_id);
  for (const item of stockItems) {
    const quantity = Number(item.quantity);
    const unitCostCents = Number(item.unit_amount_cents);
    const { data: batch, error: batchError } = await admin
      .from("inventory_batches")
      .insert({
        clinic_id: clinicId,
        item_id: item.inventory_item_id,
        location_id: item.inventory_location_id,
        batch_number: item.batch_number,
        expires_at: item.expires_at,
        quantity_on_hand: quantity,
        unit_cost_cents: unitCostCents,
        source_financial_entry_id: entryId,
        source_financial_entry_item_id: item.id,
        created_by: userId,
        updated_by: userId,
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      return { error: "O lançamento foi salvo, mas não foi possível criar o lote de estoque." };
    }

    const { error: movementError } = await admin.from("inventory_movements").insert({
      clinic_id: clinicId,
      item_id: item.inventory_item_id,
      location_id: item.inventory_location_id,
      batch_id: batch.id,
      movement_type: "purchase_entry",
      direction: "in",
      quantity,
      unit_cost_cents: unitCostCents,
      total_cost_cents: item.total_amount_cents,
      financial_entry_id: entryId,
      financial_entry_item_id: item.id,
      notes: "Entrada gerada automaticamente por documento em contas a pagar.",
      created_by: userId,
    });

    if (movementError) {
      return { error: "O lote foi criado, mas o movimento de entrada não foi registrado." };
    }
  }

  return { success: true as const };
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
  if (lineItems.some((item) => item.generate_stock && !item.inventory_item_id)) {
    return { error: "Todo item marcado para gerar estoque precisa estar vinculado a um material cadastrado." };
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
    let savedLineItems: SavedFinancialLineItem[] = [];
    await admin
      .from("financial_entry_items")
      .update({ deleted_at: new Date().toISOString(), updated_by: context.user.id })
      .eq("entry_id", result.data.id)
      .eq("clinic_id", context.activeClinic.id)
      .is("deleted_at", null);

    if (lineItems.length) {
      const { data: savedItems, error: itemsError } = await admin.from("financial_entry_items").insert(
        lineItems.map((item) => ({
          clinic_id: context.activeClinic.id,
          entry_id: result.data.id,
          ...item,
          created_by: context.user.id,
          updated_by: context.user.id,
        })),
      ).select("id, clinic_id, entry_id, description, quantity, unit_amount_cents, total_amount_cents, sort_order, generate_stock, inventory_item_id, inventory_location_id, batch_number, expires_at");
      if (itemsError) {
        return { error: financialError(itemsError, "O lançamento foi salvo, mas os itens do documento não foram registrados.") };
      }
      savedLineItems = (savedItems ?? []) as SavedFinancialLineItem[];
    }

    const inventoryResult = await rebuildPurchaseInventoryFromPayable({
      admin,
      clinicId: context.activeClinic.id,
      userId: context.user.id,
      entryId: result.data.id,
      items: savedLineItems,
    });
    if ("error" in inventoryResult) return { error: inventoryResult.error };
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

  if (entry.origin === "commission") {
    const { data: settlement } = await admin
      .from("financial_commission_settlements")
      .select("id")
      .eq("payable_entry_id", entry.id)
      .eq("clinic_id", context.activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle<{ id: string }>();
    if (settlement) {
      await Promise.all([
        admin.from("financial_commission_settlements").update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: context.user.id,
          cancellation_reason: parsed.data.reason,
          updated_by: context.user.id,
        }).eq("id", settlement.id),
        admin.from("financial_commissions").update({
          status: "approved",
          settlement_id: null,
          settlement_entry_id: null,
          updated_by: context.user.id,
        }).eq("settlement_id", settlement.id).neq("status", "cancelled"),
      ]);
    }
  }

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

  if (entry.origin === "commission" && nextStatus === "paid") {
    const { data: settlement } = await admin
      .from("financial_commission_settlements")
      .select("id")
      .eq("payable_entry_id", entry.id)
      .eq("clinic_id", context.activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle<{ id: string }>();

    if (settlement) {
      const paidAt = new Date(parsed.data.paid_at).toISOString();
      await Promise.all([
        admin
          .from("financial_commission_settlements")
          .update({ status: "paid", paid_at: paidAt, paid_by: context.user.id, updated_by: context.user.id })
          .eq("id", settlement.id),
        admin
          .from("financial_commissions")
          .update({ status: "paid", paid_at: paidAt, settled_by: context.user.id, updated_by: context.user.id })
          .eq("settlement_id", settlement.id)
          .neq("status", "cancelled"),
      ]);
    }
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

  if (entry.origin === "commission") {
    const { data: settlement } = await admin
      .from("financial_commission_settlements")
      .select("id")
      .eq("payable_entry_id", entry.id)
      .eq("clinic_id", context.activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle<{ id: string }>();

    if (settlement) {
      await Promise.all([
        admin
          .from("financial_commission_settlements")
          .update({
            status: "reversed",
            paid_at: null,
            paid_by: null,
            reversed_at: new Date().toISOString(),
            reversed_by: context.user.id,
            reversal_reason: parsed.data.reason,
            updated_by: context.user.id,
          })
          .eq("id", settlement.id),
        admin
          .from("financial_commissions")
          .update({ status: "approved", paid_at: null, settled_by: null, updated_by: context.user.id })
          .eq("settlement_id", settlement.id)
          .eq("status", "paid"),
      ]);
    }
  }

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

  let selectedPaymentIds: string[] = [];
  try {
    const raw = JSON.parse(String(formData.get("payment_ids_json") ?? "[]"));
    selectedPaymentIds = Array.isArray(raw)
      ? [...new Set(raw.filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)))]
      : [];
  } catch {
    return { error: "A seleção de movimentos é inválida. Atualize a página e tente novamente." };
  }
  if (!selectedPaymentIds.length) return { error: "Selecione ao menos um movimento pendente para conciliar." };

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
    .in("id", selectedPaymentIds)
    .is("deleted_at", null)
    .is("reconciliation_id", null)
    .gte("paid_at", periodStart)
    .lte("paid_at", periodEnd);

  if (error) return { error: financialError(error, "Não foi possível buscar os movimentos do período.") };
  if (!payments?.length) {
    return { error: "Os movimentos selecionados não estão mais disponíveis para conciliação. Atualize a página." };
  }
  if (payments.length !== selectedPaymentIds.length) {
    return { error: "Parte dos movimentos selecionados pertence a outra conta, período ou já foi conciliada." };
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

export async function saveFinancialCommissionRuleAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = commissionRuleSchema.safeParse({
    id: formData.get("id") || undefined,
    professional_member_id: formData.get("professional_member_id") || undefined,
    service_id: formData.get("service_id") || undefined,
    rule_type: formData.get("rule_type"),
    value: String(formData.get("value") ?? "").replace(/\./g, "").replace(",", "."),
    calculate_on: formData.get("calculate_on"),
    notes: formData.get("notes"),
    active: formData.get("active") ?? "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Regra inválida." };
  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para gerenciar regras de comissão." };

  const admin = createSupabaseAdminClient();
  const { data: previous } = parsed.data.id
    ? await admin.from("financial_commission_rules").select("*").eq("id", parsed.data.id).eq("clinic_id", context.activeClinic.id).maybeSingle()
    : { data: null };
  const payload = {
    clinic_id: context.activeClinic.id,
    professional_member_id: parsed.data.professional_member_id,
    service_id: parsed.data.service_id,
    rule_type: parsed.data.rule_type,
    value_bps: parsed.data.rule_type === "percent" ? percentToBps(parsed.data.value) : 0,
    value_cents: parsed.data.rule_type === "fixed" ? Math.round(parsed.data.value * 100) : 0,
    calculate_on: parsed.data.calculate_on,
    active: parsed.data.active,
    notes: parsed.data.notes,
    updated_by: context.user.id,
  };
  const query = parsed.data.id
    ? admin.from("financial_commission_rules").update(payload).eq("id", parsed.data.id).eq("clinic_id", context.activeClinic.id)
    : admin.from("financial_commission_rules").insert({ ...payload, created_by: context.user.id });
  const { data, error } = await query.select("id").single<{ id: string }>();
  if (error || !data) return { error: financialError(error, "Não foi possível salvar a regra de comissão.") };
  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "financial_commission_rule_updated" : "financial_commission_rule_created",
    module: "financial",
    recordTable: "financial_commission_rules",
    recordId: data.id,
    oldValues: previous,
    newValues: payload,
  });
  revalidateFinancial();
  return { success: parsed.data.id ? "Regra de comissão atualizada." : "Regra de comissão criada." };
}

export async function generateFinancialCommissionsAction(
  _state: FinancialActionState,
  _formData: FormData,
): Promise<FinancialActionState> {
  void _state;
  void _formData;
  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para calcular comissões." };
  const admin = createSupabaseAdminClient();
  const { data: rules } = await admin
    .from("financial_commission_rules")
    .select("*")
    .eq("clinic_id", context.activeClinic.id)
    .eq("active", true)
    .is("deleted_at", null);
  if (!rules?.length) return { error: "Cadastre ao menos uma regra ativa antes de calcular as comissões." };

  const { data: entries } = await admin
    .from("financial_entries")
    .select("id, appointment_id, professional_member_id, amount_cents, discount_cents, freight_cents, addition_cents, status")
    .eq("clinic_id", context.activeClinic.id)
    .eq("entry_type", "receivable")
    .not("professional_member_id", "is", null)
    .neq("status", "cancelled")
    .is("deleted_at", null)
    .limit(1000);
  if (!entries?.length) return { error: "Não há produção financeira vinculada a profissionais." };
  const entryIds = entries.map((entry) => entry.id);
  const appointmentIds = entries.map((entry) => entry.appointment_id).filter(Boolean) as string[];
  const [{ data: payments }, { data: appointments }, { data: existing }] = await Promise.all([
    admin.from("financial_payments").select("id, entry_id, net_amount_cents").in("entry_id", entryIds).eq("status", "confirmed").is("deleted_at", null),
    appointmentIds.length ? admin.from("appointments").select("id, service_id").in("id", appointmentIds) : Promise.resolve({ data: [] }),
    admin.from("financial_commissions").select("entry_id, payment_id, professional_member_id").eq("clinic_id", context.activeClinic.id).is("deleted_at", null),
  ]);
  const appointmentMap = new Map((appointments ?? []).map((item) => [item.id, item.service_id]));
  const paymentsByEntry = new Map<string, Array<{ id: string; entry_id: string; net_amount_cents: number }>>();
  for (const payment of payments ?? []) paymentsByEntry.set(payment.entry_id, [...(paymentsByEntry.get(payment.entry_id) ?? []), payment]);
  const existingKeys = new Set((existing ?? []).map((item) => `${item.professional_member_id}:${item.entry_id}:${item.payment_id ?? "billed"}`));
  const inserts: Array<Record<string, unknown>> = [];

  for (const entry of entries) {
    const professionalId = entry.professional_member_id as string;
    const serviceId = entry.appointment_id ? appointmentMap.get(entry.appointment_id) ?? null : null;
    const rule = [...rules]
      .filter((item) => (!item.professional_member_id || item.professional_member_id === professionalId) && (!item.service_id || item.service_id === serviceId))
      .sort((a, b) => Number(Boolean(b.professional_member_id)) + Number(Boolean(b.service_id)) - Number(Boolean(a.professional_member_id)) - Number(Boolean(a.service_id)))[0];
    if (!rule) continue;
    const sources = rule.calculate_on === "received"
      ? (paymentsByEntry.get(entry.id) ?? []).map((payment) => ({ paymentId: payment.id, base: Number(payment.net_amount_cents) }))
      : [{ paymentId: null, base: Number(entry.amount_cents) - Number(entry.discount_cents) + Number(entry.freight_cents ?? 0) + Number(entry.addition_cents) }];
    for (const source of sources) {
      const key = `${professionalId}:${entry.id}:${source.paymentId ?? "billed"}`;
      if (existingKeys.has(key)) continue;
      const commissionCents = rule.rule_type === "percent"
        ? Math.round((source.base * Number(rule.value_bps)) / 10000)
        : Number(rule.value_cents);
      if (commissionCents <= 0) continue;
      inserts.push({
        clinic_id: context.activeClinic.id,
        professional_member_id: professionalId,
        entry_id: entry.id,
        payment_id: source.paymentId,
        rule_id: rule.id,
        base_amount_cents: source.base,
        commission_cents: commissionCents,
        status: "pending",
        created_by: context.user.id,
        updated_by: context.user.id,
      });
      existingKeys.add(key);
    }
  }
  if (!inserts.length) return { success: "As comissões já estão atualizadas para a produção disponível." };
  const { error } = await admin.from("financial_commissions").insert(inserts);
  if (error) return { error: financialError(error, "Não foi possível gerar as comissões.") };
  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "financial_commissions_generated",
    module: "financial",
    recordTable: "financial_commissions",
    newValues: { generated_count: inserts.length },
    notes: "Comissões calculadas a partir das regras ativas.",
  });
  revalidateFinancial();
  return { success: `${inserts.length} comissão(ões) calculada(s).` };
}

export async function updateFinancialCommissionStatusAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = commissionStatusSchema.safeParse({
    commission_id: formData.get("commission_id"),
    action: formData.get("action"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Ação inválida." };
  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canApprove) return { error: "Você não possui permissão para aprovar ou cancelar comissões." };
  if (parsed.data.action === "cancel" && (!parsed.data.reason || parsed.data.reason.length < 8)) return { error: "Informe um motivo com pelo menos 8 caracteres." };
  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin.from("financial_commissions").select("*").eq("id", parsed.data.commission_id).eq("clinic_id", context.activeClinic.id).is("deleted_at", null).maybeSingle();
  if (!previous || previous.status === "paid") return { error: "Comissão não encontrada ou já paga." };
  const payload = parsed.data.action === "approve"
    ? { status: "approved", approved_at: new Date().toISOString(), approved_by: context.user.id, updated_by: context.user.id }
    : { status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: context.user.id, cancellation_reason: parsed.data.reason, updated_by: context.user.id };
  const { error } = await admin.from("financial_commissions").update(payload).eq("id", parsed.data.commission_id);
  if (error) return { error: financialError(error, "Não foi possível atualizar a comissão.") };
  await logAuditEvent({ clinicId: context.activeClinic.id, userId: context.user.id, actionType: parsed.data.action === "approve" ? "financial_commission_approved" : "financial_commission_cancelled", module: "financial", recordTable: "financial_commissions", recordId: parsed.data.commission_id, oldValues: previous, newValues: payload, level: parsed.data.action === "cancel" ? "critical" : "info", notes: parsed.data.reason });
  revalidateFinancial();
  return { success: parsed.data.action === "approve" ? "Comissão aprovada para pagamento." : "Comissão cancelada com auditoria." };
}

export async function createFinancialCommissionSettlementAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = commissionSettlementSchema.safeParse({
    professional_member_id: formData.get("professional_member_id"),
    period_start: formData.get("period_start"),
    period_end: formData.get("period_end"),
    competence_date: formData.get("competence_date"),
    due_date: formData.get("due_date"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados do acerto inválidos." };
  }

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canApprove && !context.access.canManage) {
    return { error: "Você não possui permissão para programar acertos de comissão." };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_financial_commission_settlement", {
    clinic_uuid: context.activeClinic.id,
    professional_uuid: parsed.data.professional_member_id,
    period_start_value: parsed.data.period_start,
    period_end_value: parsed.data.period_end,
    competence_value: parsed.data.competence_date,
    due_value: parsed.data.due_date,
    notes_value: parsed.data.notes,
    actor_uuid: context.user.id,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("commission_items_not_found")) {
      return { error: "Não há comissões aprovadas e livres para este profissional no período informado." };
    }
    if (message.includes("commission_professional_not_found")) {
      return { error: "O profissional selecionado não está ativo nesta clínica." };
    }
    return { error: financialError(error, "Não foi possível programar o acerto de comissão.") };
  }

  const result = Array.isArray(data) ? data[0] : data;
  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "financial_commission_settlement_scheduled",
    module: "financial",
    recordTable: "financial_commission_settlements",
    recordId: result?.settlement_id,
    newValues: {
      ...parsed.data,
      payable_entry_id: result?.payable_entry_id,
      commission_count: result?.commission_count,
      amount_cents: result?.amount_cents,
      status: "scheduled",
    },
    level: "security",
    notes: "Acerto programado e lançado em Contas a pagar.",
  });

  revalidateFinancial();
  return {
    success: `Acerto programado com ${result?.commission_count ?? 0} comissão(ões). A conta já está disponível em Pagamentos.`,
  };
}

export async function settleFinancialCommissionAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const parsed = settleCommissionSchema.safeParse({
    commission_id: formData.get("commission_id"),
    account_id: formData.get("account_id"),
    payment_method_id: formData.get("payment_method_id") || undefined,
    paid_at: formData.get("paid_at"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados do pagamento inválidos." };
  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para pagar comissões." };
  const admin = createSupabaseAdminClient();
  const { data: commission } = await admin.from("financial_commissions").select("*").eq("id", parsed.data.commission_id).eq("clinic_id", context.activeClinic.id).eq("status", "approved").is("deleted_at", null).maybeSingle();
  if (!commission) return { error: "A comissão precisa estar aprovada antes do pagamento." };
  const { data: professional } = await admin.from("clinic_members").select("profile:profiles!clinic_members_user_id_fkey(full_name)").eq("id", commission.professional_member_id).maybeSingle<{ profile: { full_name: string } | { full_name: string }[] | null }>();
  const professionalName = Array.isArray(professional?.profile) ? professional.profile[0]?.full_name : professional?.profile?.full_name;
  const paidAt = new Date(parsed.data.paid_at).toISOString();
  const { data: entry, error: entryError } = await admin.from("financial_entries").insert({
    clinic_id: context.activeClinic.id,
    entry_type: "payable",
    origin: "commission",
    status: "paid",
    professional_member_id: commission.professional_member_id,
    description: `Repasse de comissão - ${professionalName ?? "Profissional"}`,
    document_type: "receipt",
    issue_date: paidAt.slice(0, 10),
    due_date: paidAt.slice(0, 10),
    competence_date: paidAt.slice(0, 7) + "-01",
    amount_cents: commission.commission_cents,
    discount_cents: 0,
    freight_cents: 0,
    addition_cents: 0,
    paid_cents: commission.commission_cents,
    notes: parsed.data.notes,
    created_by: context.user.id,
    updated_by: context.user.id,
  }).select("id").single<{ id: string }>();
  if (entryError || !entry) return { error: financialError(entryError, "Não foi possível criar o lançamento do repasse.") };
  const payment = await createPayment({ admin, clinicId: context.activeClinic.id, userId: context.user.id, entryId: entry.id, entryType: "payable", amountCents: commission.commission_cents, accountId: parsed.data.account_id, paymentMethodId: parsed.data.payment_method_id, cardMachineId: null, paidAt, notes: parsed.data.notes });
  if (payment.error) return { error: payment.error };
  const payload = { status: "paid", paid_at: paidAt, settled_by: context.user.id, settlement_entry_id: entry.id, updated_by: context.user.id };
  const { error } = await admin.from("financial_commissions").update(payload).eq("id", commission.id);
  if (error) return { error: financialError(error, "O repasse foi lançado, mas a comissão não foi atualizada.") };
  await logAuditEvent({ clinicId: context.activeClinic.id, userId: context.user.id, actionType: "financial_commission_paid", module: "financial", recordTable: "financial_commissions", recordId: commission.id, oldValues: commission, newValues: { ...payload, payment_id: payment.paymentId }, level: "critical", notes: "Repasse de comissão pago e lançado no livro-caixa." });
  revalidateFinancial();
  return { success: "Comissão paga e registrada no livro-caixa." };
}

type ParsedBankRow = {
  date: string;
  description: string;
  document: string | null;
  direction: "in" | "out";
  amountCents: number;
  externalId: string | null;
  raw: Record<string, unknown>;
};

function normalizeBankDate(value: string) {
  const raw = value.trim();
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = raw.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function bankAmountToCents(value: string) {
  const cleaned = value.replace(/[^0-9,.-]/g, "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  return Math.round(Math.abs(Number(normalized)) * 100);
}

function splitCsvLine(line: string, separator: string) {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (char === separator && !quoted) { fields.push(value.trim()); value = ""; } else value += char;
  }
  fields.push(value.trim());
  return fields;
}

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseBankCsv(content: string): ParsedBankRow[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const separator = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = splitCsvLine(lines[0], separator).map(normalizeHeader);
  const find = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const dateIndex = find("data", "date", "dtmovimento", "datamovimento");
  const descriptionIndex = find("descricao", "historico", "memo", "description", "lancamento");
  const amountIndex = find("valor", "amount", "valorlancamento");
  const directionIndex = find("tipo", "natureza", "direction", "debitooucredito");
  const documentIndex = find("documento", "doc", "numero", "id");
  if (dateIndex < 0 || descriptionIndex < 0 || amountIndex < 0) return [];
  return lines.slice(1).map((line, lineIndex) => {
    const values = splitCsvLine(line, separator);
    const date = normalizeBankDate(values[dateIndex] ?? "");
    const rawAmount = values[amountIndex] ?? "";
    const amountCents = bankAmountToCents(rawAmount);
    const directionText = (values[directionIndex] ?? "").toLowerCase();
    const direction: "in" | "out" = rawAmount.trim().startsWith("-") || /deb|saida|débito/.test(directionText) ? "out" : "in";
    if (!date || !amountCents) return null;
    return { date, description: values[descriptionIndex]?.trim() || "Movimento bancário", document: values[documentIndex]?.trim() || null, direction, amountCents, externalId: values[documentIndex]?.trim() || `csv-${lineIndex + 1}`, raw: Object.fromEntries(headers.map((header, index) => [header || `coluna_${index + 1}`, values[index] ?? ""])) };
  }).filter(Boolean) as ParsedBankRow[];
}

function ofxTag(block: string, tag: string) {
  return block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"))?.[1]?.trim() ?? "";
}

function parseBankOfx(content: string): ParsedBankRow[] {
  return [...content.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi)].map((match, index) => {
    const block = match[1];
    const rawAmount = ofxTag(block, "TRNAMT");
    const amountCents = bankAmountToCents(rawAmount);
    const date = normalizeBankDate(ofxTag(block, "DTPOSTED").slice(0, 8));
    if (!date || !amountCents) return null;
    return {
      date,
      description: ofxTag(block, "MEMO") || ofxTag(block, "NAME") || "Movimento bancário",
      document: ofxTag(block, "CHECKNUM") || null,
      direction: rawAmount.trim().startsWith("-") || /DEBIT/i.test(ofxTag(block, "TRNTYPE")) ? "out" : "in",
      amountCents,
      externalId: ofxTag(block, "FITID") || `ofx-${index + 1}`,
      raw: { trntype: ofxTag(block, "TRNTYPE"), fitid: ofxTag(block, "FITID") },
    };
  }).filter(Boolean) as ParsedBankRow[];
}

export async function importFinancialBankStatementAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para importar extratos bancários." };
  const accountId = String(formData.get("account_id") ?? "");
  const file = formData.get("statement_file");
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return { error: "Selecione a conta do extrato." };
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo OFX ou CSV." };
  if (file.size > 5 * 1024 * 1024) return { error: "O arquivo deve ter no máximo 5 MB." };
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "ofx" && extension !== "csv") return { error: "Formato não suportado. Use OFX ou CSV." };
  const admin = createSupabaseAdminClient();
  const { data: account } = await admin.from("financial_accounts").select("id, name").eq("id", accountId).eq("clinic_id", context.activeClinic.id).is("deleted_at", null).maybeSingle();
  if (!account) return { error: "Conta financeira não encontrada." };
  const content = await file.text();
  const fileHash = createHash("sha256").update(content).digest("hex");
  const { data: duplicateImport } = await admin
    .from("financial_bank_imports")
    .select("id, file_name, created_at")
    .eq("clinic_id", context.activeClinic.id)
    .eq("account_id", accountId)
    .eq("file_hash", fileHash)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; file_name: string; created_at: string }>();
  if (duplicateImport) {
    return { error: `Este arquivo já foi importado para esta conta em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(duplicateImport.created_at))}.` };
  }
  const rows = extension === "ofx" ? parseBankOfx(content) : parseBankCsv(content);
  if (!rows.length) return { error: "Nenhum movimento válido foi identificado. Confira as colunas de data, descrição e valor." };
  if (rows.length > 5000) return { error: "O arquivo possui mais de 5.000 movimentos. Divida-o em períodos menores." };
  const sortedDates = rows.map((row) => row.date).sort();
  const start = new Date(`${sortedDates[0]}T00:00:00Z`); start.setUTCDate(start.getUTCDate() - 2);
  const end = new Date(`${sortedDates.at(-1)}T23:59:59Z`); end.setUTCDate(end.getUTCDate() + 2);
  const { data: payments } = await admin.from("financial_payments").select("id, direction, net_amount_cents, paid_at").eq("clinic_id", context.activeClinic.id).eq("account_id", accountId).eq("status", "confirmed").is("deleted_at", null).is("reconciliation_id", null).gte("paid_at", start.toISOString()).lte("paid_at", end.toISOString());
  const usedPayments = new Set<string>();
  const matchedRows = rows.map((row) => {
    const rowTime = new Date(`${row.date}T12:00:00Z`).getTime();
    const candidates = (payments ?? []).filter((payment) => !usedPayments.has(payment.id) && payment.direction === row.direction && Number(payment.net_amount_cents) === row.amountCents).map((payment) => ({ payment, dayDifference: Math.abs(new Date(payment.paid_at).getTime() - rowTime) / 86400000 })).filter((item) => item.dayDifference <= 2).sort((a, b) => a.dayDifference - b.dayDifference);
    const match = candidates[0];
    if (match) usedPayments.add(match.payment.id);
    return { ...row, matchedPaymentId: match?.payment.id ?? null, confidence: match ? (match.dayDifference < 0.6 ? 100 : 85) : null };
  });
  const { data: batch, error: batchError } = await admin.from("financial_bank_imports").insert({ clinic_id: context.activeClinic.id, account_id: accountId, file_name: file.name.slice(0, 220), file_type: extension, file_hash: fileHash, status: "ready", period_start: sortedDates[0], period_end: sortedDates.at(-1), total_rows: rows.length, matched_rows: matchedRows.filter((row) => row.matchedPaymentId).length, notes: String(formData.get("notes") ?? "").trim() || null, created_by: context.user.id, updated_by: context.user.id }).select("id").single<{ id: string }>();
  if (batchError || !batch) return { error: financialError(batchError, "Não foi possível registrar a importação.") };
  const { error: itemError } = await admin.from("financial_bank_import_items").insert(matchedRows.map((row) => ({ clinic_id: context.activeClinic.id, import_id: batch.id, transaction_date: row.date, description: row.description, document_number: row.document, direction: row.direction, amount_cents: row.amountCents, external_id: row.externalId, status: row.matchedPaymentId ? "matched" : "pending", matched_payment_id: row.matchedPaymentId, match_confidence: row.confidence, raw_data: row.raw, created_by: context.user.id, updated_by: context.user.id })));
  if (itemError) { await admin.from("financial_bank_imports").update({ status: "failed", updated_by: context.user.id }).eq("id", batch.id); return { error: financialError(itemError, "O arquivo foi lido, mas os movimentos não foram gravados.") }; }
  await logAuditEvent({ clinicId: context.activeClinic.id, userId: context.user.id, actionType: "financial_bank_statement_imported", module: "financial", recordTable: "financial_bank_imports", recordId: batch.id, newValues: { account_id: accountId, file_name: file.name, rows: rows.length, matched: usedPayments.size }, notes: "Extrato bancário importado para revisão." });
  revalidateFinancial();
  return { success: `Extrato importado: ${rows.length} movimento(s), ${usedPayments.size} correspondência(s) automática(s).` };
}

export async function completeFinancialBankImportAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const importId = String(formData.get("import_id") ?? "");
  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canApprove) return { error: "Você não possui permissão para concluir a revisão do extrato." };
  const admin = createSupabaseAdminClient();
  const { data: batch } = await admin.from("financial_bank_imports").select("*").eq("id", importId).eq("clinic_id", context.activeClinic.id).eq("status", "ready").is("deleted_at", null).maybeSingle();
  if (!batch) return { error: "Importação pronta para revisão não encontrada." };
  const payload = { status: "completed", completed_at: new Date().toISOString(), completed_by: context.user.id, updated_by: context.user.id };
  const { error } = await admin.from("financial_bank_imports").update(payload).eq("id", importId);
  if (error) return { error: financialError(error, "Não foi possível concluir a revisão do extrato.") };
  await logAuditEvent({ clinicId: context.activeClinic.id, userId: context.user.id, actionType: "financial_bank_import_completed", module: "financial", recordTable: "financial_bank_imports", recordId: importId, oldValues: batch, newValues: payload, notes: "Revisão de importação bancária concluída." });
  revalidateFinancial();
  return { success: "Revisão do extrato concluída. As correspondências permanecem disponíveis para conciliação." };
}

export async function deleteFinancialBankImportAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const importId = String(formData.get("import_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(importId)) return { error: "Importação inválida." };
  if (reason.length < 8) return { error: "Informe um motivo com pelo menos 8 caracteres." };
  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canManage) return { error: "Você não possui permissão para excluir importações bancárias." };
  const admin = createSupabaseAdminClient();
  const { data: batch } = await admin.from("financial_bank_imports").select("*").eq("id", importId).eq("clinic_id", context.activeClinic.id).is("deleted_at", null).maybeSingle();
  if (!batch) return { error: "Arquivo importado não encontrado." };
  const deletedAt = new Date().toISOString();
  const { error: itemError } = await admin.from("financial_bank_import_items").update({ deleted_at: deletedAt, updated_by: context.user.id }).eq("import_id", importId).eq("clinic_id", context.activeClinic.id).is("deleted_at", null);
  if (itemError) return { error: financialError(itemError, "Não foi possível remover os movimentos importados.") };
  const { error } = await admin.from("financial_bank_imports").update({ deleted_at: deletedAt, deleted_reason: reason, deleted_by: context.user.id, updated_by: context.user.id }).eq("id", importId);
  if (error) return { error: financialError(error, "Não foi possível excluir o arquivo importado.") };
  await logAuditEvent({ clinicId: context.activeClinic.id, userId: context.user.id, actionType: "financial_bank_import_deleted", module: "financial", recordTable: "financial_bank_imports", recordId: importId, oldValues: batch, newValues: { deleted_at: deletedAt, reason }, level: "critical", notes: "Importação bancária removida por exclusão lógica." });
  revalidateFinancial();
  return { success: "Arquivo importado excluído. O histórico permanece na auditoria." };
}

function financialMonthBounds(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const start = `${match[1]}-${match[2]}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export async function closeFinancialMonthAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const period = String(formData.get("period_month") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const bounds = financialMonthBounds(period);
  if (!bounds) return { error: "Selecione um mês válido." };
  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canApprove) return { error: "Você não possui permissão para fechar períodos financeiros." };
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from("financial_monthly_closings").select("*").eq("clinic_id", context.activeClinic.id).eq("period_month", bounds.start).is("deleted_at", null).maybeSingle();
  if (existing?.status === "closed") return { error: "Este mês já está fechado." };

  const periodStartIso = `${bounds.start}T00:00:00.000Z`;
  const periodEndIso = `${bounds.end}T23:59:59.999Z`;
  const [{ data: entries }, { data: pendingPayments }, { data: pendingImports }] = await Promise.all([
    admin.from("financial_entries").select("id, entry_type, category_id, amount_cents, discount_cents, freight_cents, addition_cents, paid_cents, status").eq("clinic_id", context.activeClinic.id).gte("competence_date", bounds.start).lte("competence_date", bounds.end).is("deleted_at", null).neq("status", "cancelled"),
    admin.from("financial_payments").select("id").eq("clinic_id", context.activeClinic.id).eq("status", "confirmed").not("account_id", "is", null).is("reconciliation_id", null).gte("paid_at", periodStartIso).lte("paid_at", periodEndIso).is("deleted_at", null).limit(1),
    admin.from("financial_bank_imports").select("id").eq("clinic_id", context.activeClinic.id).eq("status", "ready").lte("period_start", bounds.end).gte("period_end", bounds.start).is("deleted_at", null).limit(1),
  ]);
  if (pendingPayments?.length) return { error: "Existem movimentos bancários não conciliados neste mês." };
  if (pendingImports?.length) return { error: "Existe uma importação bancária aguardando revisão neste mês." };

  const normalizedEntries = entries ?? [];
  const total = (entry: (typeof normalizedEntries)[number]) => Number(entry.amount_cents) - Number(entry.discount_cents) + Number(entry.freight_cents ?? 0) + Number(entry.addition_cents);
  const receivables = normalizedEntries.filter((entry) => entry.entry_type === "receivable");
  const payables = normalizedEntries.filter((entry) => entry.entry_type === "payable");
  const receivableCents = receivables.reduce((sum, entry) => sum + total(entry), 0);
  const revenueCents = receivables.reduce((sum, entry) => sum + Number(entry.paid_cents), 0);
  const payableCents = payables.reduce((sum, entry) => sum + total(entry), 0);
  const expenseCents = payables.reduce((sum, entry) => sum + Number(entry.paid_cents), 0);
  const payload = {
    clinic_id: context.activeClinic.id,
    period_month: bounds.start,
    status: "closed",
    receivable_cents: receivableCents,
    revenue_cents: revenueCents,
    payable_cents: payableCents,
    expense_cents: expenseCents,
    result_cents: revenueCents - expenseCents,
    open_receivable_cents: Math.max(receivableCents - revenueCents, 0),
    open_payable_cents: Math.max(payableCents - expenseCents, 0),
    snapshot: { entry_count: normalizedEntries.length, period_start: bounds.start, period_end: bounds.end },
    notes,
    closed_at: new Date().toISOString(),
    closed_by: context.user.id,
    updated_by: context.user.id,
  };
  const query = existing
    ? admin.from("financial_monthly_closings").update(payload).eq("id", existing.id)
    : admin.from("financial_monthly_closings").insert({ ...payload, created_by: context.user.id });
  const { data: closing, error } = await query.select("id").single<{ id: string }>();
  if (error || !closing) return { error: financialError(error, "Não foi possível fechar o período financeiro.") };
  await logAuditEvent({ clinicId: context.activeClinic.id, userId: context.user.id, actionType: "financial_month_closed", module: "financial", recordTable: "financial_monthly_closings", recordId: closing.id, oldValues: existing, newValues: payload, level: "critical", notes: "Fechamento financeiro mensal concluído." });
  revalidateFinancial();
  return { success: "Mês financeiro fechado. Os lançamentos do período estão protegidos." };
}

export async function reopenFinancialMonthAction(
  _state: FinancialActionState,
  formData: FormData,
): Promise<FinancialActionState> {
  const closingId = String(formData.get("closing_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(closingId)) return { error: "Fechamento inválido." };
  if (reason.length < 8) return { error: "Informe o motivo da reabertura com pelo menos 8 caracteres." };
  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canApprove) return { error: "Você não possui permissão para reabrir períodos financeiros." };
  const admin = createSupabaseAdminClient();
  const { data: closing } = await admin.from("financial_monthly_closings").select("*").eq("id", closingId).eq("clinic_id", context.activeClinic.id).eq("status", "closed").is("deleted_at", null).maybeSingle();
  if (!closing) return { error: "Fechamento mensal não encontrado." };
  const payload = { status: "reopened", reopened_at: new Date().toISOString(), reopened_by: context.user.id, reopening_reason: reason, updated_by: context.user.id };
  const { error } = await admin.from("financial_monthly_closings").update(payload).eq("id", closingId);
  if (error) return { error: financialError(error, "Não foi possível reabrir o mês financeiro.") };
  await logAuditEvent({ clinicId: context.activeClinic.id, userId: context.user.id, actionType: "financial_month_reopened", module: "financial", recordTable: "financial_monthly_closings", recordId: closingId, oldValues: closing, newValues: payload, level: "critical", notes: reason });
  revalidateFinancial();
  return { success: "Mês financeiro reaberto para correções auditadas." };
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
