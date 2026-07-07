"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Calculator, CalendarCheck, Check, CreditCard, Landmark, LockOpen, ReceiptText, RotateCcw, Save, Settings2, ShieldCheck, Tags, Trash2, Truck, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CnpjLookupInput, type CompanyLookupResult } from "@/components/forms/cnpj-lookup-input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  cancelFinancialEntryAction,
  completeFinancialBankImportAction,
  closeFinancialMonthAction,
  createEncounterChargeAction,
  createFinancialCommissionSettlementAction,
  createFinancialReconciliationAction,
  generateFinancialCommissionsAction,
  deleteFinancialBankImportAction,
  importFinancialBankStatementAction,
  generatePayableFromRecurringAction,
  issueFinancialReceiptAction,
  reverseFinancialReconciliationAction,
  reverseFinancialPaymentAction,
  reopenFinancialMonthAction,
  saveCardMachineAction,
  saveCostCenterAction,
  saveFinancialAccountAction,
  saveFinancialCommissionRuleAction,
  saveFinancialCategoryAction,
  saveFinancialEntryAction,
  saveFinancialPreferencesAction,
  saveFinancialRecurringEntryAction,
  saveHealthPlanAction,
  savePaymentMethodAction,
  saveVendorAction,
  settleFinancialEntryAction,
  updateFinancialCommissionStatusAction,
  type FinancialActionState,
} from "@/features/financial/actions";
import { formatCpfOrCnpj, formatCurrencyInput, formatPhone, formatPostalCode, normalizeEmail } from "@/lib/formatters";
import { formatCurrencyBRL } from "@/lib/utils";
import { InventoryItemForm } from "@/features/inventory/components/inventory-workspace";
import type {
  FinancialAccount,
  FinancialBankImport,
  FinancialCardMachine,
  FinancialCategory,
  FinancialCostCenter,
  FinancialEntry,
  FinancialEntryItem,
  FinancialEntryType,
  FinancialCommission,
  FinancialCommissionRule,
  FinancialHealthPlan,
  FinancialPayment,
  FinancialPaymentMethod,
  FinancialMonthlyClosing,
  FinancialPreferences,
  FinancialReconciliation,
  FinancialRecurringEntry,
  FinancialVendor,
  InventoryItem,
  InventoryLocation,
} from "@/types/domain";

function useActionToast(state: FinancialActionState, onCompleted?: (state: FinancialActionState) => void) {
  const { toast } = useToast();
  const completedRef = useRef(onCompleted);
  const lastToastRef = useRef<string | null>(null);

  useEffect(() => {
    completedRef.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    const signature = state.error ? `error:${state.error}` : state.success ? `success:${state.success}:${state.receiptId ?? ""}` : null;
    if (!signature || lastToastRef.current === signature) return;
    lastToastRef.current = signature;

    if (state.error) {
      toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
    }
    if (state.success) {
      toast({ title: "Financeiro", description: state.success });
      completedRef.current?.(state);
    }
  }, [state, toast]);
}

function MoneyInput({
  name,
  label,
  defaultValue = "0,00",
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        name={name}
        value={value}
        required={required}
        inputMode="decimal"
        placeholder="0,00"
        onChange={(event) => setValue(formatCurrencyInput(event.target.value))}
        onBlur={() => {
          if (!value) setValue("0,00");
        }}
        className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function CurrencyInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(formatCurrencyInput(event.target.value))}
        onBlur={() => {
          if (!value) onChange("0,00");
        }}
        inputMode="decimal"
        placeholder="0,00"
        className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function PhoneInput({ name, label, defaultValue, value: controlledValue, onValueChange }: { name: string; label: string; defaultValue?: string | null; value?: string; onValueChange?: (value: string) => void }) {
  const [localValue, setLocalValue] = useState(defaultValue ? formatPhone(defaultValue) : "");
  const value = controlledValue ?? localValue;
  const update = (next: string) => onValueChange ? onValueChange(next) : setLocalValue(next);
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        name={name}
        value={value}
        onChange={(event) => update(formatPhone(event.target.value))}
        inputMode="tel"
        placeholder="(00) 00000-0000"
        className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function EmailInput({ name, label, defaultValue, value: controlledValue, onValueChange }: { name: string; label: string; defaultValue?: string | null; value?: string; onValueChange?: (value: string) => void }) {
  const [localValue, setLocalValue] = useState(defaultValue ?? "");
  const value = controlledValue ?? localValue;
  const update = (next: string) => onValueChange ? onValueChange(next) : setLocalValue(next);
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        name={name}
        type="email"
        value={value}
        onChange={(event) => update(event.target.value)}
        onBlur={() => update(normalizeEmail(value))}
        placeholder="email@clinica.com"
        className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function PercentInput({ name, label, defaultValue = 0 }: { name: string; label: string; defaultValue?: number }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <div className="flex h-10 overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
        <input
          name={name}
          type="number"
          min={0}
          max={100}
          step="0.01"
          defaultValue={defaultValue}
          className="min-w-0 flex-1 bg-transparent px-3 text-sm font-normal outline-none"
        />
        <span className="flex items-center border-l bg-muted/30 px-3 text-sm text-muted-foreground">%</span>
      </div>
    </label>
  );
}

function QuantityInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      Quantidade
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d,.]/g, ""))}
        inputMode="decimal"
        placeholder="1"
        className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  required,
  placeholder,
  value,
  onChange,
}: {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        {...(value !== undefined ? { value, onChange } : { defaultValue: defaultValue ?? "" })}
        placeholder={placeholder}
        className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function TextArea({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string | null }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function BooleanField({ name, label, defaultChecked = true }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm font-medium">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4" />
      {label}
    </label>
  );
}

function centsToInput(value?: number | null) {
  return String(((value ?? 0) / 100).toFixed(2)).replace(".", ",");
}

function inputToCents(value: string) {
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

type PayableItemDraft = {
  id: string;
  description: string;
  inventory_code: string;
  quantity: string;
  unit_amount: string;
  generate_stock: boolean;
  inventory_item_id: string;
  inventory_location_id: string;
  batch_number: string;
  expires_at: string;
};

function createPayableItemDraft(item?: FinancialEntryItem, index = 0): PayableItemDraft {
  return {
    id: item?.id ?? `item-${Date.now()}-${index}`,
    description: item?.description ?? "",
    inventory_code: "",
    quantity: item ? String(item.quantity).replace(".", ",") : "1",
    unit_amount: centsToInput(item?.unit_amount_cents),
    generate_stock: item?.generate_stock ?? false,
    inventory_item_id: item?.inventory_item_id ?? "none",
    inventory_location_id: item?.inventory_location_id ?? "none",
    batch_number: item?.batch_number ?? "",
    expires_at: item?.expires_at ?? "",
  };
}

export function FinancialAccountForm({
  account,
  onCompleted,
}: {
  account?: FinancialAccount | null;
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(saveFinancialAccountAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={account?.id ?? ""} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="name" label="Nome da conta" defaultValue={account?.name} required />
        <label className="grid gap-2 text-sm font-medium">
          Tipo
          <Select name="account_type" defaultValue={account?.account_type ?? "cash"}>
            <option value="cash">Caixa interno</option>
            <option value="checking">Conta corrente</option>
            <option value="savings">Poupança</option>
            <option value="digital_wallet">Carteira digital</option>
            <option value="card_processor">Operadora/cartão</option>
          </Select>
        </label>
        <Field name="bank_name" label="Banco" defaultValue={account?.bank_name} />
        <Field name="agency" label="Agência" defaultValue={account?.agency} />
        <Field name="account_number" label="Número da conta" defaultValue={account?.account_number} />
        <Field name="pix_key" label="Chave Pix" defaultValue={account?.pix_key} />
        <MoneyInput
          name="opening_balance"
          label="Saldo inicial"
          defaultValue={account ? String((account.opening_balance_cents / 100).toFixed(2)).replace(".", ",") : "0,00"}
        />
      </div>
      <TextArea name="notes" label="Observações" defaultValue={account?.notes} />
      <BooleanField name="active" label="Conta ativa" defaultChecked={account?.active ?? true} />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <Landmark />
          {pending ? "Salvando..." : "Salvar conta"}
        </Button>
      </div>
    </form>
  );
}

export function PaymentMethodForm({
  method,
  onCompleted,
}: {
  method?: FinancialPaymentMethod | null;
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(savePaymentMethodAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={method?.id ?? ""} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="name" label="Nome" defaultValue={method?.name} required />
        <label className="grid gap-2 text-sm font-medium">
          Tipo
          <Select name="method_type" defaultValue={method?.method_type ?? "pix"}>
            <option value="cash">Dinheiro</option>
            <option value="pix">Pix</option>
            <option value="debit_card">Cartão de débito</option>
            <option value="credit_card">Cartão de crédito</option>
            <option value="bank_transfer">Transferência</option>
            <option value="boleto">Boleto</option>
            <option value="health_plan">Convênio</option>
            <option value="other">Outro</option>
          </Select>
        </label>
        <Field name="settlement_days" label="Prazo de compensação em dias" type="number" defaultValue={method?.settlement_days ?? 0} />
      </div>
      <BooleanField name="requires_card_machine" label="Exige máquina de cartão" defaultChecked={method?.requires_card_machine ?? false} />
      <BooleanField name="active" label="Forma ativa" defaultChecked={method?.active ?? true} />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <CreditCard />
          {pending ? "Salvando..." : "Salvar forma"}
        </Button>
      </div>
    </form>
  );
}

export function CardMachineForm({
  machine,
  accounts,
  onCompleted,
}: {
  machine?: FinancialCardMachine | null;
  accounts: FinancialAccount[];
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(saveCardMachineAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={machine?.id ?? ""} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="name" label="Nome da máquina" defaultValue={machine?.name} required />
        <Field name="provider" label="Operadora" defaultValue={machine?.provider} />
        <label className="grid gap-2 text-sm font-medium">
          Conta de liquidação
          <Select name="account_id" defaultValue={machine?.account_id ?? "none"}>
            <option value="none">Não definida</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </label>
        <PercentInput name="debit_fee" label="Taxa débito" defaultValue={(machine?.debit_fee_bps ?? 0) / 100} />
        <PercentInput name="credit_fee" label="Taxa crédito" defaultValue={(machine?.credit_fee_bps ?? 0) / 100} />
        <PercentInput name="credit_installment_fee" label="Taxa crédito parcelado" defaultValue={(machine?.credit_installment_fee_bps ?? 0) / 100} />
        <Field name="debit_settlement_days" label="Prazo débito" type="number" defaultValue={machine?.debit_settlement_days ?? 1} />
        <Field name="credit_settlement_days" label="Prazo crédito" type="number" defaultValue={machine?.credit_settlement_days ?? 30} />
      </div>
      <TextArea name="notes" label="Observações" defaultValue={machine?.notes} />
      <BooleanField name="active" label="Máquina ativa" defaultChecked={machine?.active ?? true} />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <CreditCard />
          {pending ? "Salvando..." : "Salvar máquina"}
        </Button>
      </div>
    </form>
  );
}

type CompanyFormState = {
  name: string;
  document: string;
  legalName: string;
  tradeName: string;
  email: string;
  phone: string;
  postalCode: string;
  addressLine: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  city: string;
  state: string;
  registrationStatus: string;
};

function companyFormState(source?: Partial<FinancialVendor & FinancialHealthPlan> | null): CompanyFormState {
  return {
    name: source?.name ?? "",
    document: source?.document ? formatCpfOrCnpj(source.document) : "",
    legalName: source?.legal_name ?? "",
    tradeName: source?.trade_name ?? "",
    email: source?.email ?? "",
    phone: source?.phone ? formatPhone(source.phone) : "",
    postalCode: source?.postal_code ? formatPostalCode(source.postal_code) : "",
    addressLine: source?.address_line ?? "",
    addressNumber: source?.address_number ?? "",
    addressComplement: source?.address_complement ?? "",
    neighborhood: source?.neighborhood ?? "",
    city: source?.city ?? "",
    state: source?.state ?? "",
    registrationStatus: source?.registration_status ?? "",
  };
}

function applyCompanyResult(current: CompanyFormState, company: CompanyLookupResult): CompanyFormState {
  return {
    ...current,
    name: company.tradeName || company.legalName || current.name,
    document: formatCpfOrCnpj(company.cnpj),
    legalName: company.legalName,
    tradeName: company.tradeName,
    email: company.email || current.email,
    phone: company.phone ? formatPhone(company.phone) : current.phone,
    postalCode: formatPostalCode(company.postalCode),
    addressLine: company.addressLine,
    addressNumber: company.addressNumber,
    addressComplement: company.addressComplement,
    neighborhood: company.neighborhood,
    city: company.city,
    state: company.state,
    registrationStatus: company.registrationStatus,
  };
}

function CompanyAddressFields({ company, setCompany }: { company: CompanyFormState; setCompany: React.Dispatch<React.SetStateAction<CompanyFormState>> }) {
  const field = (key: keyof CompanyFormState) => ({
    value: company[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setCompany((current) => ({ ...current, [key]: event.target.value })),
  });
  return <>
    <input type="hidden" name="registration_status" value={company.registrationStatus} />
    <Field name="legal_name" label="Razão social" value={company.legalName} onChange={field("legalName").onChange} />
    <Field name="trade_name" label="Nome fantasia" value={company.tradeName} onChange={field("tradeName").onChange} />
    <label className="grid gap-2 text-sm font-medium">CEP<input name="postal_code" value={company.postalCode} onChange={(event) => setCompany((current) => ({ ...current, postalCode: formatPostalCode(event.target.value) }))} className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
    <Field name="address_line" label="Logradouro" value={company.addressLine} onChange={field("addressLine").onChange} />
    <Field name="address_number" label="Número" value={company.addressNumber} onChange={field("addressNumber").onChange} />
    <Field name="address_complement" label="Complemento" value={company.addressComplement} onChange={field("addressComplement").onChange} />
    <Field name="neighborhood" label="Bairro" value={company.neighborhood} onChange={field("neighborhood").onChange} />
    <Field name="city" label="Cidade" value={company.city} onChange={field("city").onChange} />
    <label className="grid gap-2 text-sm font-medium">UF<input name="state" value={company.state} maxLength={2} onChange={(event) => setCompany((current) => ({ ...current, state: event.target.value.toUpperCase().replace(/[^A-Z]/g, "") }))} className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
  </>;
}

export function VendorForm({ vendor, onCompleted }: { vendor?: FinancialVendor | null; onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(saveVendorAction, {});
  const [company, setCompany] = useState(() => companyFormState(vendor));
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={vendor?.id ?? ""} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="name" label="Nome para exibição" value={company.name} onChange={(event) => setCompany((current) => ({ ...current, name: event.target.value }))} required />
        <CnpjLookupInput value={company.document} onChange={(document) => setCompany((current) => ({ ...current, document }))} onFound={(result) => setCompany((current) => applyCompanyResult(current, result))} />
        <EmailInput name="email" label="E-mail" value={company.email} onValueChange={(email) => setCompany((current) => ({ ...current, email }))} />
        <PhoneInput name="phone" label="Telefone" value={company.phone} onValueChange={(phone) => setCompany((current) => ({ ...current, phone }))} />
        <label className="grid gap-2 text-sm font-medium">
          Tipo
          <Select name="vendor_type" defaultValue={vendor?.vendor_type ?? "supplier"}>
            <option value="supplier">Fornecedor</option>
            <option value="laboratory">Laboratório</option>
            <option value="professional">Profissional</option>
            <option value="tax">Imposto/taxa</option>
            <option value="other">Outro</option>
          </Select>
        </label>
        <CompanyAddressFields company={company} setCompany={setCompany} />
      </div>
      <TextArea name="notes" label="Observações" defaultValue={vendor?.notes} />
      <BooleanField name="active" label="Fornecedor ativo" defaultChecked={vendor?.active ?? true} />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <Truck />
          {pending ? "Salvando..." : "Salvar fornecedor"}
        </Button>
      </div>
    </form>
  );
}

export function FinancialCategoryForm({
  category,
  categories,
  onCompleted,
}: {
  category?: FinancialCategory | null;
  categories: FinancialCategory[];
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(saveFinancialCategoryAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={category?.id ?? ""} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="name" label="Nome da categoria" defaultValue={category?.name} required />
        <label className="grid gap-2 text-sm font-medium">
          Natureza
          <Select name="direction" defaultValue={category?.direction ?? "income"}>
            <option value="income">Receita</option>
            <option value="expense">Despesa</option>
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Categoria superior
          <Select name="parent_id" defaultValue={category?.parent_id ?? "none"}>
            <option value="none">Sem categoria superior</option>
            {categories
              .filter((item) => item.id !== category?.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </Select>
        </label>
      </div>
      <BooleanField name="active" label="Categoria ativa" defaultChecked={category?.active ?? true} />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <Tags />
          {pending ? "Salvando..." : "Salvar categoria"}
        </Button>
      </div>
    </form>
  );
}

export function CostCenterForm({
  costCenter,
  onCompleted,
}: {
  costCenter?: FinancialCostCenter | null;
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(saveCostCenterAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={costCenter?.id ?? ""} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="name" label="Centro de custo" defaultValue={costCenter?.name} required />
        <Field name="code" label="Código interno" defaultValue={costCenter?.code} />
      </div>
      <TextArea name="notes" label="Observações" defaultValue={costCenter?.notes} />
      <BooleanField name="active" label="Centro de custo ativo" defaultChecked={costCenter?.active ?? true} />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <Building2 />
          {pending ? "Salvando..." : "Salvar centro de custo"}
        </Button>
      </div>
    </form>
  );
}

export function HealthPlanForm({
  healthPlan,
  onCompleted,
}: {
  healthPlan?: FinancialHealthPlan | null;
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(saveHealthPlanAction, {});
  const [company, setCompany] = useState(() => companyFormState(healthPlan));
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={healthPlan?.id ?? ""} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="name" label="Nome do convênio" value={company.name} onChange={(event) => setCompany((current) => ({ ...current, name: event.target.value }))} required />
        <CnpjLookupInput value={company.document} onChange={(document) => setCompany((current) => ({ ...current, document }))} onFound={(result) => setCompany((current) => applyCompanyResult(current, result))} />
        <EmailInput name="email" label="E-mail" value={company.email} onValueChange={(email) => setCompany((current) => ({ ...current, email }))} />
        <PhoneInput name="phone" label="Telefone" value={company.phone} onValueChange={(phone) => setCompany((current) => ({ ...current, phone }))} />
        <CompanyAddressFields company={company} setCompany={setCompany} />
        <Field name="ans_registration" label="Registro ANS" defaultValue={healthPlan?.ans_registration} />
        <Field name="operator_code" label="Código da operadora" defaultValue={healthPlan?.operator_code} />
        <Field name="tiss_version" label="Versão TISS" defaultValue={healthPlan?.tiss_version ?? "202511"} />
        <Field name="submission_deadline_days" label="Prazo de envio (dias)" type="number" defaultValue={healthPlan?.submission_deadline_days ?? 30} />
      </div>
      <TextArea name="notes" label="Observações" defaultValue={healthPlan?.notes} />
      <BooleanField name="active" label="Convênio ativo" defaultChecked={healthPlan?.active ?? true} />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <Building2 />
          {pending ? "Salvando..." : "Salvar convênio"}
        </Button>
      </div>
    </form>
  );
}

export function FinancialEntryForm({
  entry,
  entryType,
  categories,
  costCenters,
  healthPlans,
  vendors,
  inventoryItems = [],
  inventoryLocations = [],
  onCompleted,
  onDirtyChange,
}: {
  entry?: (FinancialEntry & { items?: FinancialEntryItem[] }) | null;
  entryType: FinancialEntryType;
  categories: FinancialCategory[];
  costCenters: FinancialCostCenter[];
  healthPlans: FinancialHealthPlan[];
  vendors: FinancialVendor[];
  inventoryItems?: InventoryItem[];
  inventoryLocations?: InventoryLocation[];
  onCompleted?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveFinancialEntryAction, {});
  useActionToast(state, onCompleted);
  const [quickCreate, setQuickCreate] = useState<"item" | "vendor" | "cost-center" | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const effectiveType = entry?.entry_type ?? entryType;
  const [items, setItems] = useState<PayableItemDraft[]>(() =>
    entry?.items?.length ? entry.items.map((item, index) => createPayableItemDraft(item, index)) : [createPayableItemDraft()],
  );
  const inventoryDatalistId = "financial-payable-inventory-items";
  const inventoryById = useMemo(() => new Map(inventoryItems.map((item) => [item.id, item])), [inventoryItems]);

  function inventoryOptionLabel(item: InventoryItem) {
    return item.sku ? `${item.sku} - ${item.name}` : item.name;
  }

  function findInventoryItem(value: string) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;

    return (
      inventoryItems.find((item) => {
        const candidates = [
          item.id,
          item.sku ?? "",
          item.name,
          inventoryOptionLabel(item),
          item.sku ? `${item.sku} ${item.name}` : "",
        ];
        return candidates.some((candidate) => candidate.trim().toLowerCase() === normalized);
      }) ?? null
    );
  }

  function patchItem(id: string, patch: Partial<Omit<PayableItemDraft, "id">>) {
    onDirtyChange?.(true);
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  const normalizedItems = useMemo(
    () =>
      items
        .map((item) => {
          const registeredItem = item.inventory_item_id !== "none" ? inventoryById.get(item.inventory_item_id) : null;
          const controlsStock = registeredItem?.generate_stock ?? item.generate_stock;
          return {
            description: (registeredItem?.name ?? item.description).trim(),
            quantity: Number(item.quantity.replace(",", ".")),
            unit_amount: item.unit_amount,
            generate_stock: controlsStock,
            inventory_item_id: registeredItem?.id ?? null,
            inventory_location_id: controlsStock && item.inventory_location_id !== "none" ? item.inventory_location_id : null,
            batch_number: controlsStock ? item.batch_number.trim() || null : null,
            expires_at: controlsStock ? item.expires_at || null : null,
          };
        })
        .filter((item) => item.description || inputToCents(item.unit_amount) > 0),
    [inventoryById, items],
  );
  const itemsSubtotalCents = normalizedItems.reduce(
    (sum, item) => sum + Math.round((Number.isFinite(item.quantity) ? item.quantity : 0) * inputToCents(item.unit_amount)),
    0,
  );
  const hasPayableItems = effectiveType === "payable" && normalizedItems.length > 0;

  function updateItem(id: string, key: keyof Omit<PayableItemDraft, "id">, value: string | boolean) {
    onDirtyChange?.(true);
    setItems((current) => current.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  }

  return (
    <>
    <form action={action} className="grid gap-4" onChangeCapture={() => onDirtyChange?.(true)}>
      <input type="hidden" name="id" value={entry?.id ?? ""} />
      <input type="hidden" name="entry_type" value={effectiveType} />
      <input type="hidden" name="line_items_json" value={effectiveType === "payable" ? JSON.stringify(normalizedItems) : "[]"} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="description" label="Descrição" defaultValue={entry?.description} required />
        <Field name="document_number" label="Documento/número" defaultValue={entry?.document_number} />
        {effectiveType === "payable" ? (
          <label className="grid gap-2 text-sm font-medium">
            Tipo de documento
            <Select name="document_type" defaultValue={entry?.document_type ?? "other"}>
              <option value="nfe">NF-e</option>
              <option value="nfse">NFS-e</option>
              <option value="receipt">Recibo</option>
              <option value="contract">Contrato</option>
              <option value="other">Outro</option>
            </Select>
          </label>
        ) : (
          <input type="hidden" name="document_type" value={entry?.document_type ?? "other"} />
        )}
        <label className="grid gap-2 text-sm font-medium">
          Categoria
          <Select name="category_id" defaultValue={entry?.category_id ?? "none"}>
            <option value="none">Sem categoria</option>
            {categories
              .filter((category) => category.direction === (effectiveType === "receivable" ? "income" : "expense"))
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          <span>Centro de custo</span>
          <span className="flex min-w-0 gap-2">
            <Select name="cost_center_id" defaultValue={entry?.cost_center_id ?? "none"} className="min-w-0 flex-1">
              <option value="none">Não informado</option>
              {costCenters.map((costCenter) => (
                <option key={costCenter.id} value={costCenter.id}>
                  {costCenter.code ? `${costCenter.code} - ${costCenter.name}` : costCenter.name}
                </option>
              ))}
            </Select>
            <Button type="button" size="sm" variant="outline" onClick={() => setQuickCreate("cost-center")}>Cadastrar</Button>
          </span>
        </label>
        {effectiveType === "receivable" ? (
          <label className="grid gap-2 text-sm font-medium">
            Convênio
            <Select name="health_plan_id" defaultValue={entry?.health_plan_id ?? "none"}>
              <option value="none">Particular / não informado</option>
              {healthPlans.map((healthPlan) => (
                <option key={healthPlan.id} value={healthPlan.id}>
                  {healthPlan.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        {effectiveType === "payable" ? (
          <label className="grid gap-2 text-sm font-medium">
            <span>Fornecedor</span>
            <span className="flex min-w-0 gap-2">
              <Select name="vendor_id" defaultValue={entry?.vendor_id ?? "none"} className="min-w-0 flex-1">
                <option value="none">Não informado</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </Select>
              <Button type="button" size="sm" variant="outline" onClick={() => setQuickCreate("vendor")}>Cadastrar</Button>
            </span>
          </label>
        ) : null}
        <Field name="issue_date" label="Emissão" type="date" defaultValue={entry?.issue_date ?? today} />
        <Field name="due_date" label="Vencimento" type="date" defaultValue={entry?.due_date ?? today} />
        <Field name="competence_date" label="Competência" type="date" defaultValue={entry?.competence_date ?? today} />
        {effectiveType === "payable" ? (
          <input type="hidden" name="amount" value={centsToInput(hasPayableItems ? itemsSubtotalCents : entry?.amount_cents)} />
        ) : (
          <MoneyInput name="amount" label="Valor" required defaultValue={centsToInput(entry?.amount_cents)} />
        )}
        <MoneyInput name="discount" label="Desconto" defaultValue={centsToInput(entry?.discount_cents)} />
        {effectiveType === "payable" ? <MoneyInput name="freight" label="Frete a pagar" defaultValue={centsToInput(entry?.freight_cents)} /> : <input type="hidden" name="freight" value="0,00" />}
        <MoneyInput name="addition" label="Acréscimos" defaultValue={centsToInput(entry?.addition_cents)} />
      </div>
      {effectiveType === "payable" ? (
        <section className="grid gap-3 rounded-lg border bg-muted/15 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Itens do documento</p>
              <p className="text-xs text-muted-foreground">Itens da nota, contrato ou recibo. Marque estoque somente para materiais físicos.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setQuickCreate("item")}>
                Cadastrar item
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { onDirtyChange?.(true); setItems((current) => [...current, createPayableItemDraft(undefined, current.length)]); }}
              >
                Adicionar linha
              </Button>
            </div>
          </div>
          <datalist id={inventoryDatalistId}>
            {inventoryItems.map((inventoryItem) => (
              <option key={inventoryItem.id} value={inventoryOptionLabel(inventoryItem)}>
                {inventoryItem.category ? `${inventoryItem.category} · ${inventoryItem.unit}` : inventoryItem.unit}
              </option>
            ))}
          </datalist>
          {!inventoryItems.length ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              Cadastre os itens em Cadastros &gt; Itens antes de lançar documentos a pagar.
            </div>
          ) : null}
          <div className="grid gap-2">
            {items.map((item) => {
              const selectedInventoryItem = item.inventory_item_id !== "none" ? inventoryById.get(item.inventory_item_id) : null;
              const inventoryValue = item.inventory_code || (selectedInventoryItem ? inventoryOptionLabel(selectedInventoryItem) : "");
              const controlsStock = selectedInventoryItem?.generate_stock ?? item.generate_stock;
              const lineTotal = Math.round(Number(item.quantity.replace(",", ".")) * inputToCents(item.unit_amount));
              return (
                <div key={item.id} className="grid gap-3 rounded-md border bg-background p-3">
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.4fr)_minmax(96px,.45fr)_minmax(120px,.55fr)_minmax(120px,.5fr)_auto] xl:items-end">
                    <label className="grid gap-1.5 text-[13px] font-medium">
                      Item cadastrado
                      <input
                        list={inventoryDatalistId}
                        value={inventoryValue}
                        onChange={(event) => {
                          const value = event.target.value;
                          const found = findInventoryItem(value);
                          patchItem(item.id, {
                            inventory_code: value,
                            description: found?.name ?? value,
                            inventory_item_id: found?.id ?? "none",
                            generate_stock: found?.generate_stock ?? false,
                            inventory_location_id: found?.generate_stock ? item.inventory_location_id : "none",
                            batch_number: found?.generate_stock ? item.batch_number : "",
                            expires_at: found?.generate_stock ? item.expires_at : "",
                          });
                        }}
                        onBlur={(event) => {
                          const found = findInventoryItem(event.target.value);
                          if (!found) return;
                          patchItem(item.id, {
                            inventory_code: inventoryOptionLabel(found),
                            description: found.name,
                            inventory_item_id: found.id,
                            generate_stock: found.generate_stock,
                          });
                        }}
                        placeholder="Código/SKU ou nome do item"
                        className="h-9 rounded-md border bg-background px-3 text-[13px] font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </label>
                    <QuantityInput value={item.quantity} onChange={(value) => updateItem(item.id, "quantity", value)} />
                    <CurrencyInput value={item.unit_amount} onChange={(value) => updateItem(item.id, "unit_amount", value)} label="Unitário" />
                    <div className="rounded-md border bg-muted/20 px-2.5 py-2 text-[13px]">
                      <span className="text-[11px] text-muted-foreground">Total</span>
                      <p className="font-medium tabular-nums">{formatCurrencyBRL(Number.isFinite(lineTotal) ? lineTotal : 0)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={items.length === 1}
                      onClick={() => { onDirtyChange?.(true); setItems((current) => current.filter((row) => row.id !== item.id)); }}
                    >
                      Remover
                    </Button>
                  </div>
                  <div className="grid gap-2 rounded-md border bg-muted/15 p-2.5 md:grid-cols-2 xl:grid-cols-[145px_minmax(210px,1fr)_minmax(160px,.75fr)_110px_138px] xl:items-end">
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        className="size-3.5"
                        checked={controlsStock}
                        readOnly
                        disabled
                      />
                      Gerar estoque
                    </label>
                    <label className="grid gap-1.5 text-xs font-medium">
                      Material
                      <Select
                        value={item.inventory_item_id}
                        onChange={(event) => {
                          const found = inventoryById.get(event.target.value);
                          patchItem(item.id, {
                            inventory_item_id: found?.id ?? "none",
                            inventory_code: found ? inventoryOptionLabel(found) : "",
                            description: found?.name ?? "",
                            generate_stock: found?.generate_stock ?? false,
                          });
                        }}
                      >
                        <option value="none">Selecione</option>
                        {inventoryItems.map((inventoryItem) => (
                          <option key={inventoryItem.id} value={inventoryItem.id}>
                            {inventoryItem.name} ({inventoryItem.unit})
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="grid gap-1.5 text-xs font-medium">
                      Local
                      <Select
                        value={item.inventory_location_id}
                        onChange={(event) => updateItem(item.id, "inventory_location_id", event.target.value)}
                        disabled={!controlsStock}
                      >
                        <option value="none">Padrão</option>
                        {inventoryLocations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="grid gap-1.5 text-xs font-medium">
                      Lote
                      <input
                        value={item.batch_number}
                        onChange={(event) => updateItem(item.id, "batch_number", event.target.value)}
                        disabled={!controlsStock}
                        className="h-9 rounded-md border bg-background px-2 text-xs font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                      />
                    </label>
                    <label className="grid gap-1.5 text-xs font-medium">
                      Validade
                      <input
                        type="date"
                        value={item.expires_at}
                        onChange={(event) => updateItem(item.id, "expires_at", event.target.value)}
                        disabled={!controlsStock}
                        className="h-9 rounded-md border bg-background px-2 text-xs font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end rounded-md border bg-background p-3 text-sm">
            <span className="text-muted-foreground">Subtotal dos itens:&nbsp;</span>
            <strong>{formatCurrencyBRL(itemsSubtotalCents)}</strong>
          </div>
        </section>
      ) : null}
      <TextArea name="notes" label="Observações" defaultValue={entry?.notes} />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <Save />
          {pending ? "Salvando..." : "Salvar lançamento"}
        </Button>
      </div>
    </form>
    <Modal open={quickCreate === "item"} onOpenChange={(open) => !open && setQuickCreate(null)} title="Cadastrar item" description="O novo item ficará disponível neste lançamento após a atualização." size="md">
      <InventoryItemForm onCompleted={() => { setQuickCreate(null); router.refresh(); }} />
    </Modal>
    <Modal open={quickCreate === "vendor"} onOpenChange={(open) => !open && setQuickCreate(null)} title="Cadastrar fornecedor" description="Cadastre sem perder os dados já preenchidos no documento." size="md">
      <VendorForm onCompleted={() => { setQuickCreate(null); router.refresh(); }} />
    </Modal>
    <Modal open={quickCreate === "cost-center"} onOpenChange={(open) => !open && setQuickCreate(null)} title="Cadastrar centro de custo" description="Organize a despesa sem sair do lançamento atual." size="md">
      <CostCenterForm onCompleted={() => { setQuickCreate(null); router.refresh(); }} />
    </Modal>
    </>
  );
}

export function CancelFinancialEntryForm({
  entry,
  onCompleted,
}: {
  entry: FinancialEntry;
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(cancelFinancialEntryAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="entry_id" value={entry.id} />
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        Cancelar não apaga o histórico. O lançamento ficará marcado como cancelado e o motivo será auditado.
      </div>
      <TextArea name="reason" label="Motivo do cancelamento" />
      <div className="flex justify-end">
        <Button variant="destructive" disabled={pending}>
          <XCircle />
          {pending ? "Cancelando..." : "Confirmar cancelamento"}
        </Button>
      </div>
    </form>
  );
}

export function FinancialRecurringEntryForm({
  recurringEntry,
  vendors,
  categories,
  costCenters,
  onCompleted,
}: {
  recurringEntry?: FinancialRecurringEntry | null;
  vendors: FinancialVendor[];
  categories: FinancialCategory[];
  costCenters: FinancialCostCenter[];
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(saveFinancialRecurringEntryAction, {});
  useActionToast(state, onCompleted);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={recurringEntry?.id ?? ""} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="description" label="Descrição" defaultValue={recurringEntry?.description} required />
        <MoneyInput name="amount" label="Valor previsto" defaultValue={centsToInput(recurringEntry?.amount_cents)} required />
        <label className="grid gap-2 text-sm font-medium">
          Fornecedor
          <Select name="vendor_id" defaultValue={recurringEntry?.vendor_id ?? "none"}>
            <option value="none">Não informado</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Categoria
          <Select name="category_id" defaultValue={recurringEntry?.category_id ?? "none"}>
            <option value="none">Sem categoria</option>
            {categories
              .filter((category) => category.direction === "expense")
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Centro de custo
          <Select name="cost_center_id" defaultValue={recurringEntry?.cost_center_id ?? "none"}>
            <option value="none">Não informado</option>
            {costCenters.map((costCenter) => (
              <option key={costCenter.id} value={costCenter.id}>
                {costCenter.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Frequência
          <Select name="frequency" defaultValue={recurringEntry?.frequency ?? "monthly"}>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensal</option>
            <option value="quarterly">Trimestral</option>
            <option value="yearly">Anual</option>
          </Select>
        </label>
        <Field name="next_due_date" label="Próximo vencimento" type="date" defaultValue={recurringEntry?.next_due_date ?? today} required />
      </div>
      <TextArea name="notes" label="Observações" defaultValue={recurringEntry?.notes} />
      <BooleanField name="active" label="Recorrência ativa" defaultChecked={recurringEntry?.active ?? true} />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <RotateCcw />
          {pending ? "Salvando..." : "Salvar recorrência"}
        </Button>
      </div>
    </form>
  );
}

export function GenerateRecurringPayableForm({
  recurringEntry,
  onCompleted,
}: {
  recurringEntry: FinancialRecurringEntry;
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(generatePayableFromRecurringAction, {});
  useActionToast(state, onCompleted);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="recurring_id" value={recurringEntry.id} />
      <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
        Revise os dados antes de gerar a conta. A recorrência permanece ativa e o próximo vencimento será atualizado automaticamente.
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="issue_date" label="Data de emissão" type="date" defaultValue={today} required />
        <Field name="due_date" label="Vencimento" type="date" defaultValue={recurringEntry.next_due_date} required />
        <Field name="document_number" label="Documento/número" />
      </div>
      <TextArea name="notes" label="Observações" defaultValue={recurringEntry.notes} />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <Save />
          {pending ? "Gerando..." : "Gerar conta a pagar"}
        </Button>
      </div>
    </form>
  );
}

export function EncounterChargeForm({
  encounterId,
  suggestedAmountCents,
  accounts,
  paymentMethods,
  cardMachines,
  onCompleted,
}: {
  encounterId: string;
  suggestedAmountCents: number;
  accounts: FinancialAccount[];
  paymentMethods: FinancialPaymentMethod[];
  cardMachines: FinancialCardMachine[];
  onCompleted?: (state: FinancialActionState) => void;
}) {
  const [state, action, pending] = useActionState(createEncounterChargeAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="encounter_id" value={encounterId} />
      <div className="grid gap-4 lg:grid-cols-2">
        <MoneyInput
          name="amount"
          label="Valor da consulta"
          required
          defaultValue={String((suggestedAmountCents / 100).toFixed(2)).replace(".", ",")}
        />
        <MoneyInput name="discount" label="Desconto" />
        <MoneyInput name="addition" label="Acréscimos" />
        <Field name="paid_at" label="Data/hora do pagamento" type="datetime-local" />
        <label className="grid gap-2 text-sm font-medium">
          Conta/caixa
          <Select name="account_id" defaultValue={accounts[0]?.id ?? "none"}>
            <option value="none">Não definida</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Forma de pagamento
          <Select name="payment_method_id" defaultValue={paymentMethods[0]?.id ?? "none"}>
            <option value="none">Não definida</option>
            {paymentMethods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Máquina de cartão
          <Select name="card_machine_id" defaultValue="none">
            <option value="none">Não usada</option>
            {cardMachines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <BooleanField name="paid_now" label="Paciente pagou agora" defaultChecked />
      <TextArea name="notes" label="Observações da cobrança" />
      <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
        Se não marcar pagamento agora, o valor ficará em aberto em Contas a receber e poderá gerar ciência de pagamento.
      </div>
      <div className="flex justify-end">
        <Button disabled={pending}>
          <ReceiptText />
          {pending ? "Processando..." : "Confirmar cobrança"}
        </Button>
      </div>
    </form>
  );
}

export function SettleEntryForm({
  entryId,
  entryOpenCents,
  accounts,
  paymentMethods,
  cardMachines,
  onCompleted,
}: {
  entryId: string;
  entryOpenCents: number;
  accounts: FinancialAccount[];
  paymentMethods: FinancialPaymentMethod[];
  cardMachines: FinancialCardMachine[];
  onCompleted?: (state: FinancialActionState) => void;
}) {
  const [state, action, pending] = useActionState(settleFinancialEntryAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="entry_id" value={entryId} />
      <div className="grid gap-4 lg:grid-cols-2">
        <MoneyInput
          name="amount"
          label="Valor da baixa"
          required
          defaultValue={String((entryOpenCents / 100).toFixed(2)).replace(".", ",")}
        />
        <Field name="paid_at" label="Data/hora" type="datetime-local" />
        <label className="grid gap-2 text-sm font-medium">
          Conta/caixa
          <Select name="account_id" defaultValue={accounts[0]?.id ?? "none"}>
            <option value="none">Não definida</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Forma
          <Select name="payment_method_id" defaultValue={paymentMethods[0]?.id ?? "none"}>
            <option value="none">Não definida</option>
            {paymentMethods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Máquina
          <Select name="card_machine_id" defaultValue="none">
            <option value="none">Não usada</option>
            {cardMachines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <TextArea name="notes" label="Observações" />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <Save />
          {pending ? "Baixando..." : "Confirmar baixa"}
        </Button>
      </div>
    </form>
  );
}

export function ReversePaymentForm({ payment, onCompleted }: { payment: FinancialPayment; onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(reverseFinancialPaymentAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="payment_id" value={payment.id} />
      <div className="rounded-md border bg-muted/20 p-3 text-sm">
        Estorno de {formatCurrencyBRL(payment.amount_cents)}. Esta ação ficará marcada como crítica na auditoria.
      </div>
      <TextArea name="reason" label="Motivo do estorno" />
      <div className="flex justify-end">
        <Button variant="destructive" disabled={pending}>
          {pending ? "Estornando..." : "Confirmar estorno"}
        </Button>
      </div>
    </form>
  );
}

export function ReconciliationForm({
  accounts,
  paymentIds,
  defaultAccountId,
  onCompleted,
}: {
  accounts: FinancialAccount[];
  paymentIds: string[];
  defaultAccountId?: string;
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(createFinancialReconciliationAction, {});
  useActionToast(state, onCompleted);
  const [selectedAccountId, setSelectedAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = new Date();
  firstDay.setDate(1);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="account_id" value={selectedAccountId} />
      <input type="hidden" name="payment_ids_json" value={JSON.stringify(paymentIds)} />
      <div className="grid gap-2">
        <p className="text-sm font-medium">Conta para conciliar</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => setSelectedAccountId(account.id)}
              className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors ${
                selectedAccountId === account.id ? "border-primary bg-primary/5 text-primary" : "bg-background hover:bg-muted/30"
              }`}
            >
              <span className="truncate">{account.name}</span>
              <span className={`flex size-4 items-center justify-center rounded border text-[10px] ${selectedAccountId === account.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
                {selectedAccountId === account.id ? <Check className="size-3" /> : ""}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="period_start" label="Início do período" type="date" defaultValue={firstDay.toISOString().slice(0, 10)} required />
        <Field name="period_end" label="Fim do período" type="date" defaultValue={today} required />
        <MoneyInput name="opening_balance" label="Saldo bancário inicial" required />
        <MoneyInput name="bank_balance" label="Saldo bancário final conferido" required />
      </div>
      <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
        {paymentIds.length} movimento(s) selecionado(s) serão conciliados. O fechamento só será permitido quando o saldo
        calculado desses itens bater com o saldo bancário final informado.
      </div>
      <TextArea name="notes" label="Observações da conciliação" />
      <div className="flex justify-end">
        <Button disabled={pending || accounts.length === 0}>
          <ShieldCheck />
          {pending ? "Conferindo..." : "Fechar conciliação"}
        </Button>
      </div>
    </form>
  );
}

export function ReverseReconciliationForm({
  reconciliation,
  onCompleted,
}: {
  reconciliation: FinancialReconciliation;
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(reverseFinancialReconciliationAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="reconciliation_id" value={reconciliation.id} />
      <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
        Esta ação reabre a conciliação e libera os movimentos para correção. O histórico permanece registrado na auditoria.
      </div>
      <TextArea name="reason" label="Motivo da reabertura" />
      <div className="flex justify-end">
        <Button variant="destructive" disabled={pending}>
          <RotateCcw />
          {pending ? "Reabrindo..." : "Reabrir conciliação"}
        </Button>
      </div>
    </form>
  );
}

export function CommissionRuleForm({
  rule,
  professionals,
  services,
  onCompleted,
}: {
  rule?: FinancialCommissionRule | null;
  professionals: Array<{ id: string; profile: { full_name: string } | null }>;
  services: Array<{ id: string; name: string }>;
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(saveFinancialCommissionRuleAction, {});
  const [ruleType, setRuleType] = useState<"percent" | "fixed">(rule?.rule_type ?? "percent");
  useActionToast(state, onCompleted);
  const value = rule ? (rule.rule_type === "percent" ? String(rule.value_bps / 100) : (rule.value_cents / 100).toFixed(2).replace(".", ",")) : "";
  return (
    <form action={action} className="grid gap-4">
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">Profissional<Select name="professional_member_id" defaultValue={rule?.professional_member_id ?? "none"}><option value="none">Todos os profissionais</option>{professionals.map((item) => <option key={item.id} value={item.id}>{item.profile?.full_name ?? "Profissional"}</option>)}</Select></label>
        <label className="grid gap-2 text-sm font-medium">Serviço<Select name="service_id" defaultValue={rule?.service_id ?? "none"}><option value="none">Todos os serviços</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
        <label className="grid gap-2 text-sm font-medium">Tipo da regra<Select name="rule_type" value={ruleType} onChange={(event) => setRuleType(event.target.value as "percent" | "fixed")}><option value="percent">Percentual</option><option value="fixed">Valor fixo</option></Select></label>
        <Field name="value" label={ruleType === "percent" ? "Percentual (%)" : "Valor fixo (R$)"} type="text" defaultValue={value} required />
        <label className="grid gap-2 text-sm font-medium">Calcular sobre<Select name="calculate_on" defaultValue={rule?.calculate_on ?? "received"}><option value="received">Valor recebido</option><option value="billed">Valor faturado</option></Select></label>
        <label className="mt-7 flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={rule?.active ?? true} /> Regra ativa</label>
      </div>
      <TextArea name="notes" label="Observações" defaultValue={rule?.notes ?? ""} />
      <div className="flex justify-end"><Button disabled={pending}><Save />{pending ? "Salvando..." : "Salvar regra"}</Button></div>
    </form>
  );
}

export function GenerateCommissionsForm({ onCompleted }: { onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(generateFinancialCommissionsAction, {});
  useActionToast(state, onCompleted);
  return <form action={action} className="grid gap-4"><div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">O sistema aplicará a regra mais específica por profissional e serviço. Comissões já calculadas não serão duplicadas.</div><div className="flex justify-end"><Button disabled={pending}><Calculator />{pending ? "Calculando..." : "Calcular comissões"}</Button></div></form>;
}

export function CommissionStatusForm({ commission, actionType, onCompleted }: { commission: FinancialCommission; actionType: "approve" | "cancel"; onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(updateFinancialCommissionStatusAction, {});
  useActionToast(state, onCompleted);
  return <form action={action} className="grid gap-4"><input type="hidden" name="commission_id" value={commission.id} /><input type="hidden" name="action" value={actionType} /><div className="rounded-md border bg-muted/20 p-3 text-sm">Valor do repasse: <strong>{formatCurrencyBRL(commission.commission_cents)}</strong></div>{actionType === "cancel" ? <TextArea name="reason" label="Motivo do cancelamento" /> : null}<div className="flex justify-end"><Button variant={actionType === "cancel" ? "destructive" : "default"} disabled={pending}>{pending ? "Confirmando..." : actionType === "approve" ? "Aprovar comissão" : "Cancelar comissão"}</Button></div></form>;
}

export function CommissionSettlementForm({ commission, professionals, onCompleted }: { commission?: FinancialCommission | null; professionals: Array<{ id: string; profile: { full_name: string } | null }>; onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(createFinancialCommissionSettlementAction, {});
  useActionToast(state, onCompleted);
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return <form action={action} className="grid gap-4"><div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">O sistema agrupa as comissões aprovadas do período e cria uma <strong className="text-foreground">conta a pagar em aberto</strong>. Baixa, estorno e conciliação seguem o fluxo financeiro normal.</div><label className="grid gap-2 text-sm font-medium">Profissional<Select name="professional_member_id" required defaultValue={commission?.professional_member_id ?? ""}><option value="" disabled>Selecione o profissional</option>{professionals.map((item) => <option key={item.id} value={item.id}>{item.profile?.full_name ?? "Profissional"}</option>)}</Select></label><div className="grid gap-4 lg:grid-cols-2"><Field name="period_start" label="Início da apuração" type="date" defaultValue={periodStart} required /><Field name="period_end" label="Fim da apuração" type="date" defaultValue={periodEnd} required /><Field name="competence_date" label="Competência" type="date" defaultValue={periodStart} required /><Field name="due_date" label="Vencimento do repasse" type="date" defaultValue={periodEnd} required /></div><TextArea name="notes" label="Observações do acerto" /><div className="flex justify-end"><Button disabled={pending || !professionals.length}><ReceiptText />{pending ? "Programando..." : "Programar acerto"}</Button></div></form>;
}

export function BankStatementImportForm({ accounts, onCompleted }: { accounts: FinancialAccount[]; onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(importFinancialBankStatementAction, {});
  useActionToast(state, onCompleted);
  return <form action={action} className="grid gap-4"><label className="grid gap-2 text-sm font-medium">Conta do extrato<Select name="account_id" required defaultValue=""><option value="" disabled>Selecione</option>{accounts.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label><label className="grid gap-2 text-sm font-medium">Arquivo bancário<input type="file" name="statement_file" accept=".ofx,.csv,text/csv,application/x-ofx" required className="rounded-md border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium" /><span className="text-xs font-normal text-muted-foreground">OFX ou CSV, até 5 MB. Para CSV use colunas de data, descrição e valor.</span></label><TextArea name="notes" label="Observações da importação" /><div className="flex justify-end"><Button disabled={pending}><Upload />{pending ? "Lendo e conciliando..." : "Importar extrato"}</Button></div></form>;
}

export function CompleteBankImportForm({ importId, onCompleted }: { importId: string; onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(completeFinancialBankImportAction, {});
  useActionToast(state, onCompleted);
  return <form action={action} className="flex justify-end"><input type="hidden" name="import_id" value={importId} /><Button disabled={pending}><Check />{pending ? "Concluindo..." : "Concluir revisão"}</Button></form>;
}

export function DeleteBankImportForm({ bankImport, onCompleted }: { bankImport: FinancialBankImport; onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(deleteFinancialBankImportAction, {});
  useActionToast(state, onCompleted);
  return <form action={action} className="grid gap-4"><input type="hidden" name="import_id" value={bankImport.id} /><div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm">O arquivo <strong>{bankImport.file_name}</strong> e seus movimentos importados serão removidos da operação. Lançamentos financeiros existentes não serão apagados.</div><TextArea name="reason" label="Motivo da exclusão" /><div className="flex justify-end"><Button variant="destructive" disabled={pending}><Trash2 />{pending ? "Excluindo..." : "Excluir importação"}</Button></div></form>;
}

export function MonthlyCloseForm({ onCompleted }: { onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(closeFinancialMonthAction, {});
  useActionToast(state, onCompleted);
  const currentMonth = new Date().toISOString().slice(0, 7);
  return <form action={action} className="grid gap-4"><Field name="period_month" label="Mês de competência" type="month" defaultValue={currentMonth} required /><div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">Antes de fechar, o sistema verifica movimentos bancários pendentes e importações ainda não revisadas. Após o fechamento, lançamentos e baixas do mês ficam protegidos.</div><TextArea name="notes" label="Observações do fechamento" /><div className="flex justify-end"><Button disabled={pending}><CalendarCheck />{pending ? "Validando período..." : "Fechar mês"}</Button></div></form>;
}

export function ReopenMonthlyCloseForm({ closing, onCompleted }: { closing: FinancialMonthlyClosing; onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(reopenFinancialMonthAction, {});
  useActionToast(state, onCompleted);
  return <form action={action} className="grid gap-4"><input type="hidden" name="closing_id" value={closing.id} /><div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">A reabertura libera correções no mês e será registrada como ação crítica na auditoria.</div><TextArea name="reason" label="Motivo da reabertura" /><div className="flex justify-end"><Button variant="destructive" disabled={pending}><LockOpen />{pending ? "Reabrindo..." : "Reabrir mês"}</Button></div></form>;
}

export function ReceiptForm({
  entryId,
  type,
  onCompleted,
}: {
  entryId: string;
  type: "payment" | "payment_acknowledgement";
  onCompleted?: (state: FinancialActionState) => void;
}) {
  const [state, action, pending] = useActionState(issueFinancialReceiptAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="entry_id" value={entryId} />
      <input type="hidden" name="receipt_type" value={type} />
      <TextArea name="notes" label="Observações no documento" />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <ReceiptText />
          {pending ? "Emitindo..." : type === "payment" ? "Emitir recibo" : "Emitir ciência"}
        </Button>
      </div>
    </form>
  );
}

export function FinancialPreferencesForm({
  preferences,
  onCompleted,
}: {
  preferences: FinancialPreferences;
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(saveFinancialPreferencesAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <BooleanField
          name="allow_reception_checkout"
          label="Recepção pode cobrar atendimentos"
          defaultChecked={preferences.allow_reception_checkout}
        />
        <BooleanField
          name="allow_professional_checkout"
          label="Profissional pode cobrar atendimento próprio"
          defaultChecked={preferences.allow_professional_checkout}
        />
        <BooleanField
          name="require_payment_method_on_checkout"
          label="Exigir forma de pagamento na baixa"
          defaultChecked={preferences.require_payment_method_on_checkout}
        />
        <Field
          name="default_receivable_due_days"
          label="Vencimento padrão em dias"
          type="number"
          defaultValue={preferences.default_receivable_due_days}
        />
        <MoneyInput
          name="default_late_fee"
          label="Multa padrão"
          defaultValue={String((preferences.default_late_fee_cents / 100).toFixed(2)).replace(".", ",")}
        />
        <Field
          name="default_monthly_interest"
          label="Juros mensal (%)"
          type="number"
          defaultValue={preferences.default_monthly_interest_bps / 100}
        />
      </div>
      <TextArea name="receipt_footer" label="Rodapé dos recibos" defaultValue={preferences.receipt_footer} />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <Settings2 />
          {pending ? "Salvando..." : "Salvar preferências"}
        </Button>
      </div>
    </form>
  );
}
