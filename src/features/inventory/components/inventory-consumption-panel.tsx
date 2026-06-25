"use client";

import { useActionState, useEffect, useMemo } from "react";
import { PackageMinus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { consumeInventoryMaterialAction, type InventoryActionState } from "@/features/inventory/actions";
import { formatCurrencyBRL } from "@/lib/utils";
import type { InventoryBatch, InventoryItem, InventoryLocation, InventoryMovement } from "@/types/domain";

export function InventoryConsumptionPanel({
  items,
  locations,
  batches,
  movements,
  encounterId,
  nursingAssessmentId,
  medicalRecordId,
}: {
  items: InventoryItem[];
  locations: InventoryLocation[];
  batches: InventoryBatch[];
  movements: InventoryMovement[];
  encounterId?: string | null;
  nursingAssessmentId?: string | null;
  medicalRecordId?: string | null;
}) {
  const [state, action, pending] = useActionState<InventoryActionState, FormData>(consumeInventoryMaterialAction, {});
  const { toast } = useToast();
  const stockByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const batch of batches) map.set(batch.item_id, (map.get(batch.item_id) ?? 0) + Number(batch.quantity_on_hand));
    return map;
  }, [batches]);

  useEffect(() => {
    if (state.error) toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
    if (state.success) toast({ title: "Estoque", description: state.success });
  }, [state, toast]);

  return (
    <section className="grid gap-3 rounded-lg border bg-card p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <p className="text-sm font-medium">Materiais do atendimento</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lance somente materiais realmente consumidos. O custo ficará vinculado ao atendimento.
          </p>
        </div>
        <PackageMinus className="size-4 text-primary" />
      </div>

      <form action={action} className="grid gap-2 lg:grid-cols-[minmax(210px,1fr)_minmax(160px,0.7fr)_minmax(150px,0.7fr)_92px_minmax(190px,1fr)_auto] lg:items-end">
        <input type="hidden" name="encounter_id" value={encounterId ?? ""} />
        <input type="hidden" name="nursing_assessment_id" value={nursingAssessmentId ?? ""} />
        <input type="hidden" name="medical_record_id" value={medicalRecordId ?? ""} />
        <label className="grid gap-1.5 text-xs font-medium">
          Material
          <Select name="item_id" defaultValue="">
            <option value="">Selecione</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({stockByItem.get(item.id) ?? 0} {item.unit})
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium">
          Lote
          <Select name="batch_id" defaultValue="">
            <option value="">Automático</option>
            {batches.map((batch) => {
              const item = items.find((row) => row.id === batch.item_id);
              return (
                <option key={batch.id} value={batch.id}>
                  {item?.name ?? "Material"} · {batch.batch_number || "sem lote"} · {batch.quantity_on_hand}
                </option>
              );
            })}
          </Select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium">
          Local
          <Select name="location_id" defaultValue="">
            <option value="">Pelo lote</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium">
          Quantidade
          <input
            name="quantity"
            type="number"
            min="0.001"
            step="0.001"
            defaultValue="1"
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium">
          Observação
          <input
            name="notes"
            placeholder="Ex.: usado em curativo"
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <Button disabled={pending || !items.length}>
          <Save />
          {pending ? "Lançando..." : "Lançar"}
        </Button>
      </form>

      {movements.length ? (
        <div className="rounded-md border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Material</th>
                <th className="px-3 py-2 text-right">Qtd.</th>
                <th className="px-3 py-2 text-right">Custo</th>
              </tr>
            </thead>
            <tbody>
              {movements.slice(0, 6).map((movement) => (
                <tr key={movement.id} className="border-t">
                  <td className="px-3 py-2">{movement.item?.name ?? "Material"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{movement.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrencyBRL(movement.total_cost_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
