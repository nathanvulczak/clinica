"use client";

import { useState } from "react";
import { AlertTriangle, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EncounterChargeForm } from "@/features/financial/components/financial-forms";
import { formatCurrencyBRL } from "@/lib/utils";
import type { FinancialWorkspace, PendingEncounterCharge } from "@/repositories/financial";

export function PendingEncounterChargesPanel({ data }: { data: FinancialWorkspace }) {
  const [selected, setSelected] = useState<PendingEncounterCharge | null>(null);

  if (!data.pendingEncounterCharges.length) return null;

  return (
    <section className="grid gap-3 rounded-md border bg-card p-3">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="size-4 text-amber-600" />
        <div>
          <p className="text-sm font-medium">Atendimentos liberados para cobrança</p>
          <p className="text-xs text-muted-foreground">A recepção pode cobrar sem acessar o módulo financeiro completo.</p>
        </div>
      </div>
      <div className="grid gap-1.5">
        {data.pendingEncounterCharges.slice(0, 8).map((item) => (
          <article key={item.encounter_id} className="grid gap-2 rounded-md border bg-background px-3 py-2 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-[13px] font-medium">{item.patient_name}</p>
              <p className="text-xs text-muted-foreground">
                {item.service_name} | {item.professional_name} | {formatCurrencyBRL(item.suggested_amount_cents)}
              </p>
            </div>
            <Button className="h-8 px-2.5 text-xs" size="sm" disabled={!data.access.canChargeEncounter} onClick={() => setSelected(item)}>
              <ReceiptText />
              Cobrar
            </Button>
          </article>
        ))}
      </div>
      <Modal
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title="Cobrar atendimento"
        description={selected ? `${selected.patient_name} - ${selected.service_name}` : undefined}
        className="max-w-4xl"
      >
        {selected ? (
          <EncounterChargeForm
            encounterId={selected.encounter_id}
            suggestedAmountCents={selected.suggested_amount_cents}
            accounts={data.accounts}
            paymentMethods={data.paymentMethods}
            cardMachines={data.cardMachines}
            onCompleted={(state) => {
              setSelected(null);
              if (state.receiptId) window.open(`/financeiro/recibos/${state.receiptId}`, "_blank");
            }}
          />
        ) : null}
      </Modal>
    </section>
  );
}
