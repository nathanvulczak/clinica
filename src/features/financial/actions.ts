"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  cardMachineSchema,
  encounterChargeSchema,
  financialAccountSchema,
  financialEntrySchema,
  paymentMethodSchema,
  preferencesSchema,
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

function financialError(error: { message?: string } | null, fallback: string) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("does not exist") || message.includes("schema cache")) {
    return "A estrutura do Financeiro ainda nao esta disponivel. Execute a migration 023 no Supabase.";
  }
  if (message.includes("permission") || message.includes("policy")) {
    return "O banco bloqueou a operacao por seguranca. Revise as permissoes e o RLS.";
  }
  if (message.includes("duplicate") || message.includes("unique")) {
    return "Ja existe um registro financeiro com estes dados.";
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
  if (!activeClinic) return { error: "Selecione uma clinica antes de acessar o Financeiro." as const };

  const access = await getFinancialAccess(activeClinic.id);
  return { activeClinic, user, access };
}

function revalidateFinancial() {
  revalidatePath("/financeiro");
  revalidatePath("/atendimentos");
  revalidatePath("/prontuarios");
  revalidatePath("/auditoria");
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
  if (!context.access.canManage) return { error: "Voce nao possui permissao para gerenciar contas financeiras." };

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
    current_balance_cents: openingBalance,
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
    if (!previous) return { error: "Conta financeira nao encontrada." };

    const { error } = await admin.from("financial_accounts").update(payload).eq("id", parsed.data.id);
    if (error) return { error: financialError(error, "Nao foi possivel atualizar a conta.") };

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
      .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
      .select("id")
      .single();
    if (error || !data) return { error: financialError(error, "Nao foi possivel criar a conta.") };

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
  if (!context.access.canManage) return { error: "Voce nao possui permissao para gerenciar formas de pagamento." };

  const admin = createSupabaseAdminClient();
  const payload = { ...parsed.data, id: undefined, updated_by: context.user.id };
  const result = parsed.data.id
    ? await admin.from("financial_payment_methods").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("financial_payment_methods")
        .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { error: financialError(result.error, "Nao foi possivel salvar a forma de pagamento.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "payment_method_updated" : "payment_method_created",
    module: "financial",
    recordTable: "financial_payment_methods",
    recordId: result.data.id,
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
  if (!context.access.canManage) return { error: "Voce nao possui permissao para gerenciar maquinas." };

  const admin = createSupabaseAdminClient();
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
    return { error: financialError(result.error, "Nao foi possivel salvar a maquina de cartao.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "card_machine_updated" : "card_machine_created",
    module: "financial",
    recordTable: "financial_card_machines",
    recordId: result.data.id,
    newValues: payload,
  });

  revalidateFinancial();
  return { success: parsed.data.id ? "Maquina atualizada." : "Maquina cadastrada." };
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
  if (!context.access.canManage) return { error: "Voce nao possui permissao para gerenciar fornecedores." };

  const admin = createSupabaseAdminClient();
  const payload = { ...parsed.data, id: undefined, updated_by: context.user.id };
  const result = parsed.data.id
    ? await admin.from("financial_vendors").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("financial_vendors")
        .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
        .select("id")
        .single();

  if (result.error || !result.data) {
    return { error: financialError(result.error, "Nao foi possivel salvar o fornecedor.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "vendor_updated" : "vendor_created",
    module: "financial",
    recordTable: "financial_vendors",
    recordId: result.data.id,
    newValues: payload,
  });

  revalidateFinancial();
  return { success: parsed.data.id ? "Fornecedor atualizado." : "Fornecedor cadastrado." };
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
    description: formData.get("description"),
    document_number: formData.get("document_number"),
    issue_date: formData.get("issue_date"),
    due_date: formData.get("due_date"),
    competence_date: formData.get("competence_date"),
    amount: formData.get("amount"),
    discount: formData.get("discount"),
    addition: formData.get("addition"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados invalidos." };

  const context = await getFinancialContext();
  if ("error" in context) return { error: context.error };
  if (parsed.data.id ? !context.access.canEdit : !context.access.canCreate) {
    return { error: "Voce nao possui permissao para salvar lancamentos financeiros." };
  }

  const admin = createSupabaseAdminClient();
  const payload = {
    entry_type: parsed.data.entry_type,
    origin: "manual",
    patient_id: parsed.data.patient_id,
    vendor_id: parsed.data.vendor_id,
    professional_member_id: parsed.data.professional_member_id,
    category_id: parsed.data.category_id,
    description: parsed.data.description,
    document_number: parsed.data.document_number,
    issue_date: parsed.data.issue_date,
    due_date: parsed.data.due_date,
    competence_date: parsed.data.competence_date,
    amount_cents: parseCurrencyToCents(parsed.data.amount),
    discount_cents: parseCurrencyToCents(parsed.data.discount),
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
    return { error: financialError(result.error, "Nao foi possivel salvar o lancamento.") };
  }

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "financial_entry_updated" : "financial_entry_created",
    module: "financial",
    recordTable: "financial_entries",
    recordId: result.data.id,
    newValues: payload,
  });

  revalidateFinancial();
  return { success: parsed.data.id ? "Lancamento atualizado." : "Lancamento criado." };
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
    return { error: "Voce nao possui permissao para cobrar atendimentos." };
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
    return { error: "Este atendimento ainda nao esta liberado para cobranca." };
  }

  const { data: existing } = await admin
    .from("financial_entries")
    .select("id")
    .eq("clinic_id", context.activeClinic.id)
    .eq("encounter_id", encounter.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return { error: "Este atendimento ja possui cobranca financeira." };

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
    return { error: "Informe a forma de pagamento para baixar a cobranca agora." };
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
  if (error || !entry) return { error: financialError(error, "Nao foi possivel criar a cobranca.") };

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
    return { error: "Voce nao possui permissao para baixar lancamentos." };
  }

  const admin = createSupabaseAdminClient();
  const { data: entry } = await admin
    .from("financial_entries")
    .select("*")
    .eq("id", parsed.data.entry_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<FinancialEntry>();
  if (!entry) return { error: "Lancamento financeiro nao encontrado." };
  if (["paid", "cancelled", "refunded"].includes(entry.status)) {
    return { error: "Este lancamento nao pode ser baixado no status atual." };
  }

  const total = entry.amount_cents - entry.discount_cents + entry.addition_cents;
  const openAmount = Math.max(total - entry.paid_cents, 0);
  const amount = parseCurrencyToCents(parsed.data.amount);
  if (amount > openAmount) return { error: "O valor baixado nao pode ultrapassar o saldo em aberto." };

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
  if (!context.access.canManage) return { error: "Voce nao possui permissao para estornar pagamentos." };

  const admin = createSupabaseAdminClient();
  const { data: payment } = await admin
    .from("financial_payments")
    .select("*")
    .eq("id", parsed.data.payment_id)
    .eq("clinic_id", context.activeClinic.id)
    .eq("status", "confirmed")
    .is("deleted_at", null)
    .maybeSingle<FinancialPayment>();
  if (!payment) return { error: "Pagamento/recebimento nao encontrado ou ja estornado." };

  const { data: entry } = await admin
    .from("financial_entries")
    .select("*")
    .eq("id", payment.entry_id)
    .maybeSingle<FinancialEntry>();
  if (!entry) return { error: "Lancamento vinculado nao encontrado." };

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
  const total = entry.amount_cents - entry.discount_cents + entry.addition_cents;
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

  revalidateFinancial();
  return { success: "Estorno registrado com auditoria." };
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
    return { error: "Voce nao possui permissao para emitir recibos." };
  }

  const admin = createSupabaseAdminClient();
  const { data: entry } = await admin
    .from("financial_entries")
    .select("*")
    .eq("id", parsed.data.entry_id)
    .eq("clinic_id", context.activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle<FinancialEntry>();
  if (!entry) return { error: "Lancamento nao encontrado." };

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
  if (!context.access.canManage) return { error: "Voce nao possui permissao para alterar preferencias financeiras." };

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
  if (error) return { error: financialError(error, "Nao foi possivel salvar as preferencias.") };

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
  if (error || !data) return { error: financialError(error, "Nao foi possivel registrar a baixa.") };

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
  const total = entry ? entry.amount_cents - entry.discount_cents + entry.addition_cents : 0;
  const open = entry ? Math.max(total - entry.paid_cents, 0) : 0;
  const patientName = patient?.social_name || patient?.full_name || "Paciente";
  const title = receiptType === "payment" ? "Recibo de pagamento" : "Ciencia de pagamento em aberto";
  const content =
    receiptType === "payment"
      ? `Recebemos de ${patientName} o valor de ${formatCurrencyBRL(entry?.paid_cents ?? total)} referente a ${entry?.description ?? "atendimento"}.\n\nObservacoes: ${notes ?? "Sem observacoes."}`
      : `${patientName} declara ciencia do valor em aberto de ${formatCurrencyBRL(open)} referente a ${entry?.description ?? "atendimento"}, com vencimento em ${entry?.due_date ?? "data nao informada"}.\n\nObservacoes: ${notes ?? "Sem observacoes."}`;

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

  return data?.id;
}

function addDays(value: string, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
