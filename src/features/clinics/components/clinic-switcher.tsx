"use client";

import { useRef, useTransition } from "react";
import { Building2 } from "lucide-react";
import { setActiveClinicAction } from "@/features/clinics/context-actions";
import type { Clinic } from "@/types/domain";
import { useToast } from "@/components/ui/toast";
import { Select } from "@/components/ui/select";

export function ClinicSwitcher({
  clinics,
  activeClinicId,
  collapsed,
}: {
  clinics: Clinic[];
  activeClinicId?: string;
  collapsed?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  if (clinics.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
        <Building2 className="size-4" />
        {!collapsed ? "Nenhuma clínica" : null}
      </div>
    );
  }

  return (
    <form ref={formRef} action={setActiveClinicAction} className="grid gap-1">
      {!collapsed ? <span className="text-xs font-medium text-muted-foreground">Clínica ativa</span> : null}
      <div className="relative">
        <Building2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Select
          name="clinic_id"
          defaultValue={activeClinicId}
          className={collapsed ? "w-10 appearance-none px-0 text-transparent" : "pl-9"}
          title="Selecionar clínica ativa"
          onChange={(event) => {
            const clinicName = clinics.find((clinic) => clinic.id === event.target.value)?.trade_name;
            toast({
              title: "Clínica ativa",
              description: clinicName ? `${clinicName} agora é o contexto ativo.` : "Contexto atualizado.",
            });
            startTransition(() => formRef.current?.requestSubmit());
          }}
        >
          {clinics.map((clinic) => (
            <option key={clinic.id} value={clinic.id}>
              {clinic.trade_name}
            </option>
          ))}
        </Select>
      </div>
    </form>
  );
}
