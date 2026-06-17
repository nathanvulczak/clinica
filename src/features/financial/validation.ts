import { z } from "zod";
import { onlyDigits } from "@/lib/utils";
import { isValidEmail } from "@/lib/validators";

const optionalText = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .transform((value) => (value.length > 0 ? value : null));

const optionalEmail = z
  .string()
  .optional()
  .transform((value) => value?.trim().toLowerCase() ?? "")
  .refine((value) => !value || isValidEmail(value), "Informe um e-mail valido.")
  .transform((value) => (value.length > 0 ? value : null));

const optionalDocument = z
  .string()
  .optional()
  .transform((value) => onlyDigits(value ?? ""))
  .refine((value) => !value || value.length === 11 || value.length === 14, "Informe CPF ou CNPJ valido.")
  .transform((value) => (value.length > 0 ? value : null));

const optionalPhone = z
  .string()
  .optional()
  .transform((value) => onlyDigits(value ?? ""))
  .refine((value) => !value || (value.length >= 10 && value.length <= 11), "Telefone invalido.")
  .transform((value) => (value.length > 0 ? value : null));

export const currencyString = z
  .string()
  .trim()
  .refine(
    (value) =>
      /^(\d{1,3}(\.\d{3})*|\d+)(,\d{1,2})?$/.test(value) || /^\d+(\.\d{1,2})?$/.test(value),
    "Informe um valor valido.",
  );

export const optionalCurrencyString = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "0")
  .refine(
    (value) =>
      /^(\d{1,3}(\.\d{3})*|\d+)(,\d{1,2})?$/.test(value) || /^\d+(\.\d{1,2})?$/.test(value),
    "Informe um valor valido.",
  );

const optionalUuid = z
  .string()
  .optional()
  .transform((value) => (value && value !== "none" ? value : null));

export const financialAccountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome da conta."),
  account_type: z.enum(["cash", "checking", "savings", "digital_wallet", "card_processor"]),
  bank_name: optionalText,
  agency: optionalText,
  account_number: optionalText,
  pix_key: optionalText,
  opening_balance: optionalCurrencyString,
  notes: optionalText,
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

export const paymentMethodSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome da forma de pagamento."),
  method_type: z.enum(["cash", "pix", "debit_card", "credit_card", "bank_transfer", "boleto", "health_plan", "other"]),
  requires_card_machine: z.enum(["on", "off"]).optional().transform((value) => value === "on"),
  settlement_days: z.coerce.number().int().min(0).max(365),
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

export const cardMachineSchema = z.object({
  id: z.string().uuid().optional(),
  account_id: optionalUuid,
  name: z.string().trim().min(2, "Informe o nome da maquina."),
  provider: optionalText,
  debit_fee: z.coerce.number().min(0).max(100),
  credit_fee: z.coerce.number().min(0).max(100),
  credit_installment_fee: z.coerce.number().min(0).max(100),
  debit_settlement_days: z.coerce.number().int().min(0).max(365),
  credit_settlement_days: z.coerce.number().int().min(0).max(365),
  notes: optionalText,
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

export const vendorSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome do fornecedor."),
  document: optionalDocument,
  email: optionalEmail,
  phone: optionalPhone,
  vendor_type: z.enum(["supplier", "laboratory", "professional", "tax", "other"]),
  notes: optionalText,
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

export const financialEntrySchema = z.object({
  id: z.string().uuid().optional(),
  entry_type: z.enum(["receivable", "payable"]),
  patient_id: optionalUuid,
  vendor_id: optionalUuid,
  professional_member_id: optionalUuid,
  category_id: optionalUuid,
  description: z.string().trim().min(3, "Informe a descricao."),
  document_number: optionalText,
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de emissao."),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento."),
  competence_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a competencia."),
  amount: currencyString,
  discount: optionalCurrencyString,
  addition: optionalCurrencyString,
  notes: optionalText,
});

export const encounterChargeSchema = z.object({
  encounter_id: z.string().uuid(),
  amount: currencyString,
  discount: optionalCurrencyString,
  addition: optionalCurrencyString,
  paid_now: z.enum(["on", "off"]).optional().transform((value) => value === "on"),
  account_id: optionalUuid,
  payment_method_id: optionalUuid,
  card_machine_id: optionalUuid,
  paid_at: z.string().optional().transform((value) => value || new Date().toISOString()),
  notes: optionalText,
});

export const settleEntrySchema = z.object({
  entry_id: z.string().uuid(),
  account_id: optionalUuid,
  payment_method_id: optionalUuid,
  card_machine_id: optionalUuid,
  amount: currencyString,
  paid_at: z.string().optional().transform((value) => value || new Date().toISOString()),
  notes: optionalText,
});

export const reversePaymentSchema = z.object({
  payment_id: z.string().uuid(),
  reason: z.string().trim().min(5, "Informe o motivo do estorno.").max(500),
});

export const receiptSchema = z.object({
  entry_id: z.string().uuid(),
  receipt_type: z.enum(["payment", "payment_acknowledgement"]),
  notes: optionalText,
});

export const preferencesSchema = z.object({
  allow_reception_checkout: z.enum(["on", "off"]).optional().transform((value) => value === "on"),
  allow_professional_checkout: z.enum(["on", "off"]).optional().transform((value) => value === "on"),
  require_payment_method_on_checkout: z.enum(["on", "off"]).optional().transform((value) => value === "on"),
  default_receivable_due_days: z.coerce.number().int().min(0).max(365),
  default_late_fee: optionalCurrencyString,
  default_monthly_interest: z.coerce.number().min(0).max(100),
  receipt_footer: optionalText,
});
