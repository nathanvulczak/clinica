"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, CreditCard, Landmark, ReceiptText, RotateCcw, Save, Settings2, ShieldCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  createEncounterChargeAction,
  createFinancialReconciliationAction,
  issueFinancialReceiptAction,
  reverseFinancialReconciliationAction,
  reverseFinancialPaymentAction,
  saveCardMachineAction,
  saveFinancialAccountAction,
  saveFinancialEntryAction,
  saveFinancialPreferencesAction,
  savePaymentMethodAction,
  saveVendorAction,
  settleFinancialEntryAction,
  type FinancialActionState,
} from "@/features/financial/actions";
import { formatCurrencyBRL } from "@/lib/utils";
import type {
  FinancialAccount,
  FinancialCardMachine,
  FinancialCategory,
  FinancialEntryType,
  FinancialPayment,
  FinancialPaymentMethod,
  FinancialPreferences,
  FinancialReconciliation,
  FinancialVendor,
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
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        inputMode="decimal"
        placeholder="0,00"
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
}: {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
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
        <Field name="debit_fee" label="Taxa débito (%)" type="number" defaultValue={(machine?.debit_fee_bps ?? 0) / 100} />
        <Field name="credit_fee" label="Taxa crédito (%)" type="number" defaultValue={(machine?.credit_fee_bps ?? 0) / 100} />
        <Field
          name="credit_installment_fee"
          label="Taxa crédito parcelado (%)"
          type="number"
          defaultValue={(machine?.credit_installment_fee_bps ?? 0) / 100}
        />
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

export function VendorForm({ vendor, onCompleted }: { vendor?: FinancialVendor | null; onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(saveVendorAction, {});
  useActionToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={vendor?.id ?? ""} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="name" label="Nome" defaultValue={vendor?.name} required />
        <Field name="document" label="CPF/CNPJ" defaultValue={vendor?.document} />
        <Field name="email" label="E-mail" defaultValue={vendor?.email} />
        <Field name="phone" label="Telefone" defaultValue={vendor?.phone} />
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

export function FinancialEntryForm({
  entryType,
  categories,
  vendors,
  onCompleted,
}: {
  entryType: FinancialEntryType;
  categories: FinancialCategory[];
  vendors: FinancialVendor[];
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(saveFinancialEntryAction, {});
  useActionToast(state, onCompleted);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="entry_type" value={entryType} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Field name="description" label="Descrição" required />
        <Field name="document_number" label="Documento/numero" />
        <label className="grid gap-2 text-sm font-medium">
          Categoria
          <Select name="category_id" defaultValue="none">
            <option value="none">Sem categoria</option>
            {categories
              .filter((category) => category.direction === (entryType === "receivable" ? "income" : "expense"))
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </Select>
        </label>
        {entryType === "payable" ? (
          <label className="grid gap-2 text-sm font-medium">
            Fornecedor
            <Select name="vendor_id" defaultValue="none">
              <option value="none">Não informado</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <Field name="issue_date" label="Emissão" type="date" defaultValue={today} />
        <Field name="due_date" label="Vencimento" type="date" defaultValue={today} />
        <Field name="competence_date" label="Competência" type="date" defaultValue={today} />
        <MoneyInput name="amount" label="Valor" required />
        <MoneyInput name="discount" label="Desconto" />
        <MoneyInput name="addition" label="Acréscimos" />
      </div>
      <TextArea name="notes" label="Observações" />
      <div className="flex justify-end">
        <Button disabled={pending}>
          <Save />
          {pending ? "Salvando..." : "Salvar lançamento"}
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
  onCompleted,
}: {
  accounts: FinancialAccount[];
  onCompleted?: () => void;
}) {
  const [state, action, pending] = useActionState(createFinancialReconciliationAction, {});
  useActionToast(state, onCompleted);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = new Date();
  firstDay.setDate(1);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="account_id" value={selectedAccountId} />
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
        O sistema conciliará todos os movimentos confirmados, ainda pendentes de conciliação, da conta e período selecionados.
        O fechamento só será permitido quando o saldo calculado bater com o saldo bancário final informado.
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
