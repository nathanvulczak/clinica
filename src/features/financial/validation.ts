import { z } from "zod";
import { onlyDigits } from "@/lib/utils";
import { isValidCpfOrCnpj, isValidEmail } from "@/lib/validators";

const optionalText = z
  .string()
  .nullish()
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
  .refine((value) => !value || isValidCpfOrCnpj(value), "Informe um CPF ou CNPJ válido.")
  .transform((value) => (value.length > 0 ? value : null));

const optionalPhone = z
  .string()
  .optional()
  .transform((value) => onlyDigits(value ?? ""))
  .refine((value) => !value || (value.length >= 10 && value.length <= 11), "Telefone invalido.")
  .transform((value) => (value.length > 0 ? value : null));

const companyRegistrationFields = {
  legal_name: optionalText,
  trade_name: optionalText,
  postal_code: optionalText,
  address_line: optionalText,
  address_number: optionalText,
  address_complement: optionalText,
  neighborhood: optionalText,
  city: optionalText,
  state: z.string().optional().transform((value) => value?.trim().toUpperCase() || null).refine((value) => !value || /^[A-Z]{2}$/.test(value), "Informe uma UF válida."),
  registration_status: optionalText,
};

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
  .nullish()
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
  name: z.string().trim().min(2, "Informe o nome da máquina."),
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

export const financialCategorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome da categoria."),
  direction: z.enum(["income", "expense"]),
  parent_id: optionalUuid,
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

export const costCenterSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome do centro de custo."),
  code: optionalText,
  notes: optionalText,
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

export const healthPlanSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome do convenio."),
  document: optionalDocument,
  email: optionalEmail,
  phone: optionalPhone,
  ...companyRegistrationFields,
  ans_registration: optionalText,
  tiss_version: optionalText,
  operator_code: optionalText,
  submission_deadline_days: z.coerce.number().int().min(1).max(365),
  ...companyRegistrationFields,
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
  cost_center_id: optionalUuid,
  health_plan_id: optionalUuid,
  document_type: z.enum(["nfe", "nfse", "receipt", "contract", "other"]).optional().default("other"),
  description: z.string().trim().min(3, "Informe a descricao."),
  document_number: optionalText,
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de emissao."),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento."),
  competence_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a competencia."),
  amount: currencyString,
  discount: optionalCurrencyString,
  freight: optionalCurrencyString,
  addition: optionalCurrencyString,
  line_items_json: z.string().optional().default("[]"),
  notes: optionalText,
});

export const financialEntryItemInputSchema = z.object({
  description: z.string().trim().min(2, "Informe a descricao do item.").max(180),
  quantity: z.coerce.number().positive("Informe a quantidade do item.").max(999999),
  unit_amount: currencyString,
  generate_stock: z.boolean().optional().default(false),
  inventory_item_id: optionalUuid,
  inventory_location_id: optionalUuid,
  batch_number: optionalText,
  expires_at: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a validade no formato correto."),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((value) => value || null),
}).superRefine((item, ctx) => {
  if (!item.inventory_item_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["inventory_item_id"],
      message: "Selecione um item cadastrado para cada linha do documento.",
    });
  }
});

export const cancelFinancialEntrySchema = z.object({
  entry_id: z.string().uuid(),
  reason: z.string().trim().min(8, "Informe o motivo do cancelamento.").max(700),
});

export const recurringEntrySchema = z.object({
  id: z.string().uuid().optional(),
  vendor_id: optionalUuid,
  category_id: optionalUuid,
  cost_center_id: optionalUuid,
  description: z.string().trim().min(3, "Informe a descricao da recorrencia."),
  amount: currencyString,
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o proximo vencimento."),
  notes: optionalText,
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

export const generateRecurringPayableSchema = z.object({
  recurring_id: z.string().uuid(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de emissao."),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento."),
  document_number: optionalText,
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

export const reconciliationSchema = z
  .object({
    account_id: z.string().uuid("Selecione a conta financeira."),
    period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data inicial."),
    period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data final."),
    opening_balance: currencyString,
    bank_balance: currencyString,
    notes: optionalText,
  })
  .superRefine((value, context) => {
    if (value.period_end < value.period_start) {
      context.addIssue({
        code: "custom",
        path: ["period_end"],
        message: "A data final deve ser maior ou igual à data inicial.",
      });
    }
  });

export const commissionRuleSchema = z.object({
  id: z.string().uuid().optional(),
  professional_member_id: optionalUuid,
  service_id: optionalUuid,
  rule_type: z.enum(["percent", "fixed"]),
  value: z.coerce.number().min(0.01, "Informe um valor de comissão maior que zero."),
  calculate_on: z.enum(["billed", "received"]),
  notes: optionalText,
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

export const commissionStatusSchema = z.object({
  commission_id: z.string().uuid(),
  action: z.enum(["approve", "cancel"]),
  reason: optionalText,
});

export const settleCommissionSchema = z.object({
  commission_id: z.string().uuid(),
  account_id: z.string().uuid(),
  payment_method_id: optionalUuid,
  paid_at: z.string().min(10),
  notes: optionalText,
});

export const commissionSettlementSchema = z
  .object({
    professional_member_id: z.string().uuid(),
    period_start: z.string().date(),
    period_end: z.string().date(),
    competence_date: z.string().date(),
    due_date: z.string().date(),
    notes: optionalText,
  })
  .superRefine((value, context) => {
    if (value.period_end < value.period_start) {
      context.addIssue({
        code: "custom",
        path: ["period_end"],
        message: "A data final deve ser igual ou posterior à data inicial.",
      });
    }
  });

export const reverseReconciliationSchema = z.object({
  reconciliation_id: z.string().uuid(),
  reason: z.string().trim().min(8, "Informe o motivo para reabrir a conciliação.").max(700),
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
