"use client";

import { useActionState, useState } from "react";
import { Building2 } from "lucide-react";
import { createClinicAction } from "@/features/clinics/actions";
import { formatCpfOrCnpj, formatPhone, normalizeEmail } from "@/lib/formatters";
import { isValidCpfOrCnpj, isValidEmail } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClinicForm() {
  const [state, formAction, pending] = useActionState(createClinicAction, {});
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const showDocumentError = document.length > 0 && document.length >= 14 && !isValidCpfOrCnpj(document);
  const showEmailError = email.length > 0 && !isValidEmail(email);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="trade_name">Nome da clínica</Label>
        <Input id="trade_name" name="trade_name" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="legal_name">Razão social ou responsável</Label>
        <Input id="legal_name" name="legal_name" required />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="document">CNPJ/CPF</Label>
          <Input
            id="document"
            name="document"
            inputMode="numeric"
            value={document}
            onChange={(event) => setDocument(formatCpfOrCnpj(event.target.value))}
            aria-invalid={showDocumentError}
          />
          {showDocumentError ? <p className="text-xs text-destructive">Informe um CPF ou CNPJ válido.</p> : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            name="phone"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(formatPhone(event.target.value))}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">E-mail administrativo</Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(normalizeEmail(event.target.value))}
          aria-invalid={showEmailError}
        />
        {showEmailError ? <p className="text-xs text-destructive">Informe um e-mail válido.</p> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_96px]">
        <div className="grid gap-2">
          <Label htmlFor="city">Cidade</Label>
          <Input id="city" name="city" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="state">UF</Label>
          <Input
            id="state"
            name="state"
            maxLength={2}
            onChange={(event) => {
              event.target.value = event.target.value.toUpperCase().replace(/[^A-Z]/g, "");
            }}
          />
        </div>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button disabled={pending || showDocumentError || showEmailError}>
        <Building2 />
        {pending ? "Salvando..." : "Cadastrar clínica"}
      </Button>
    </form>
  );
}
