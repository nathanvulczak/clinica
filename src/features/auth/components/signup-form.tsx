"use client";

import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";
import { signUpAction } from "@/features/auth/actions";
import { PLANS } from "@/config/plans";
import { formatCpf, formatPhone, normalizeEmail } from "@/lib/formatters";
import { formatCurrencyBRL } from "@/lib/utils";
import { isValidCpf, isValidEmail } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Select } from "@/components/ui/select";

export function SignupForm({ selectedPlan }: { selectedPlan?: string }) {
  const [state, formAction, pending] = useActionState(signUpAction, {});
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const showCpfError = cpf.length === 14 && !isValidCpf(cpf);
  const showEmailError = email.length > 0 && !isValidEmail(email);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="fullName">Nome completo</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            name="cpf"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(event) => setCpf(formatCpf(event.target.value))}
            aria-invalid={showCpfError}
            required
          />
          {showCpfError ? <p className="text-xs text-destructive">Informe um CPF válido.</p> : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            placeholder="(00) 00000-0000"
            value={phone}
            onChange={(event) => setPhone(formatPhone(event.target.value))}
            required
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(normalizeEmail(event.target.value))}
          aria-invalid={showEmailError}
          required
        />
        {showEmailError ? <p className="text-xs text-destructive">Informe um e-mail válido.</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Senha</Label>
        <PasswordInput id="password" name="password" minLength={8} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="plan">Plano</Label>
        <Select id="plan" name="plan" defaultValue={selectedPlan ?? "singular"}>
          {PLANS.map((plan) => (
            <option key={plan.slug} value={plan.slug}>
              {plan.name} - {formatCurrencyBRL(plan.priceCents)}/mês
            </option>
          ))}
        </Select>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending || showCpfError || showEmailError}>
        <UserPlus />
        {pending ? "Criando conta..." : "Criar conta"}
      </Button>
    </form>
  );
}
