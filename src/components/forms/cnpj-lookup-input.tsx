"use client";

import { useRef, useState } from "react";
import { Building2, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatCpfOrCnpj } from "@/lib/formatters";
import { onlyDigits } from "@/lib/utils";
import { isValidCnpj } from "@/lib/validators";

export type CompanyLookupResult = {
  cnpj: string;
  legalName: string;
  tradeName: string;
  registrationStatus: string;
  email: string;
  phone: string;
  postalCode: string;
  addressLine: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  city: string;
  state: string;
  source: string;
};

export function CnpjLookupInput({
  value,
  onChange,
  onFound,
  label = "CNPJ",
  name = "document",
}: {
  value: string;
  onChange: (value: string) => void;
  onFound: (company: CompanyLookupResult) => void;
  label?: string;
  name?: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const lastLookup = useRef("");
  const digits = onlyDigits(value);

  async function lookup(force = false) {
    if (!isValidCnpj(digits) || loading || (!force && lastLookup.current === digits)) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/lookup/cnpj/${digits}`);
      const payload = (await response.json()) as CompanyLookupResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível consultar o CNPJ.");
      lastLookup.current = digits;
      onFound(payload);
      toast({ title: "Dados empresariais encontrados", description: "Revise as informações preenchidas antes de salvar." });
    } catch (error) {
      toast({ title: "Consulta de CNPJ", description: error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <span className="flex min-w-0 gap-2">
        <span className="relative min-w-0 flex-1">
          <Building2 className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input
            name={name}
            value={value}
            onChange={(event) => onChange(formatCpfOrCnpj(event.target.value))}
            onBlur={() => void lookup()}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </span>
        <Button type="button" size="icon" variant="outline" disabled={!isValidCnpj(digits) || loading} onClick={() => void lookup(true)} title="Consultar CNPJ" aria-label="Consultar CNPJ">
          {loading ? <LoaderCircle className="animate-spin" /> : <Search />}
        </Button>
      </span>
      <span className="text-[11px] font-normal text-muted-foreground">Ao completar um CNPJ válido, os dados públicos são consultados automaticamente.</span>
    </label>
  );
}
