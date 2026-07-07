"use client";

import { useActionState, useState } from "react";
import { Building2 } from "lucide-react";
import { CnpjLookupInput } from "@/components/forms/cnpj-lookup-input";
import { createClinicAction, updateClinicAction } from "@/features/clinics/actions";
import { formatCpfOrCnpj, formatPhone, formatPostalCode, normalizeEmail } from "@/lib/formatters";
import { isValidCpfOrCnpj, isValidEmail } from "@/lib/validators";
import type { Clinic } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClinicForm({ clinic }: { clinic?: Clinic }) {
  const isEditing = Boolean(clinic);
  const [state, formAction, pending] = useActionState(isEditing ? updateClinicAction : createClinicAction, {});
  const [document, setDocument] = useState(clinic?.document ? formatCpfOrCnpj(clinic.document) : "");
  const [tradeName, setTradeName] = useState(clinic?.trade_name ?? "");
  const [legalName, setLegalName] = useState(clinic?.legal_name ?? "");
  const [phone, setPhone] = useState(clinic?.phone ? formatPhone(clinic.phone) : "");
  const [email, setEmail] = useState(clinic?.email ?? "");
  const [postalCode, setPostalCode] = useState(clinic?.postal_code ? formatPostalCode(clinic.postal_code) : "");
  const [addressLine, setAddressLine] = useState(clinic?.address_line ?? "");
  const [addressNumber, setAddressNumber] = useState(clinic?.address_number ?? "");
  const [addressComplement, setAddressComplement] = useState(clinic?.address_complement ?? "");
  const [neighborhood, setNeighborhood] = useState(clinic?.neighborhood ?? "");
  const [city, setCity] = useState(clinic?.city ?? "");
  const [stateCode, setStateCode] = useState(clinic?.state ?? "");
  const [registrationStatus, setRegistrationStatus] = useState(clinic?.registration_status ?? "");
  const showDocumentError = document.length > 0 && document.length >= 14 && !isValidCpfOrCnpj(document);
  const showEmailError = email.length > 0 && !isValidEmail(email);

  return (
    <form action={formAction} className="grid gap-4">
      {clinic?.id ? <input type="hidden" name="clinic_id" value={clinic.id} /> : null}
      <div className="grid gap-2">
        <Label htmlFor="trade_name">Nome da clínica</Label>
        <Input id="trade_name" name="trade_name" value={tradeName} onChange={(event) => setTradeName(event.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="legal_name">Razão social ou responsável</Label>
        <Input id="legal_name" name="legal_name" value={legalName} onChange={(event) => setLegalName(event.target.value)} required />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <CnpjLookupInput value={document} onChange={setDocument} label="CNPJ" onFound={(company) => {
          setDocument(formatCpfOrCnpj(company.cnpj));
          setTradeName(company.tradeName || company.legalName);
          setLegalName(company.legalName);
          if (company.email) setEmail(company.email);
          if (company.phone) setPhone(formatPhone(company.phone));
          setPostalCode(formatPostalCode(company.postalCode));
          setAddressLine(company.addressLine);
          setAddressNumber(company.addressNumber);
          setAddressComplement(company.addressComplement);
          setNeighborhood(company.neighborhood);
          setCity(company.city);
          setStateCode(company.state);
          setRegistrationStatus(company.registrationStatus);
        }} />
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
      <input type="hidden" name="registration_status" value={registrationStatus} />
      <div className="grid gap-2 sm:grid-cols-[140px_1fr_120px]">
        <div className="grid gap-2"><Label htmlFor="postal_code">CEP</Label><Input id="postal_code" name="postal_code" value={postalCode} onChange={(event) => setPostalCode(formatPostalCode(event.target.value))} /></div>
        <div className="grid gap-2"><Label htmlFor="address_line">Logradouro</Label><Input id="address_line" name="address_line" value={addressLine} onChange={(event) => setAddressLine(event.target.value)} /></div>
        <div className="grid gap-2"><Label htmlFor="address_number">Número</Label><Input id="address_number" name="address_number" value={addressNumber} onChange={(event) => setAddressNumber(event.target.value)} /></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2"><Label htmlFor="address_complement">Complemento</Label><Input id="address_complement" name="address_complement" value={addressComplement} onChange={(event) => setAddressComplement(event.target.value)} /></div>
        <div className="grid gap-2"><Label htmlFor="neighborhood">Bairro</Label><Input id="neighborhood" name="neighborhood" value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)} /></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_96px]">
        <div className="grid gap-2">
          <Label htmlFor="city">Cidade</Label>
          <Input id="city" name="city" value={city} onChange={(event) => setCity(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="state">UF</Label>
          <Input
            id="state"
            name="state"
            maxLength={2}
            value={stateCode}
            onChange={(event) => {
              setStateCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""));
            }}
          />
        </div>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button disabled={pending || showDocumentError || showEmailError}>
        <Building2 />
        {pending ? "Salvando..." : isEditing ? "Salvar alterações" : "Cadastrar clínica"}
      </Button>
    </form>
  );
}
