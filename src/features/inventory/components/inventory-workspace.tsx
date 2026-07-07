"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Boxes, ClipboardList, MapPin, Package, Plus, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  saveInventoryItemAction,
  saveInventoryLocationAction,
  type InventoryActionState,
} from "@/features/inventory/actions";
import { formatCurrencyBRL } from "@/lib/utils";
import type { InventoryItem, InventoryLocation } from "@/types/domain";
import type { InventoryWorkspace as InventoryWorkspaceData } from "@/repositories/inventory";

function useInventoryToast(state: InventoryActionState, onCompleted?: () => void) {
  const { toast } = useToast();
  useEffect(() => {
    if (state.error) toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
    if (state.success) {
      toast({ title: "Estoque", description: state.success });
      onCompleted?.();
    }
  }, [onCompleted, state, toast]);
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <section className="rounded-lg border bg-card p-3.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </section>
  );
}

export function InventoryItemForm({ item, onCompleted }: { item?: InventoryItem | null; onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(saveInventoryItemAction, {});
  useInventoryToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Nome do material
          <input name="name" required defaultValue={item?.name ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Código/SKU
          <input name="sku" defaultValue={item?.sku ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Categoria
          <input name="category" defaultValue={item?.category ?? ""} placeholder="Ex.: Curativo, odontologia, medicamento" className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Unidade
          <input name="unit" required defaultValue={item?.unit ?? "un"} className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Estoque mínimo
          <input name="minimum_quantity" type="number" min="0" step="0.001" defaultValue={item?.minimum_quantity ?? 0} className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <div className="grid gap-2">
          <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm font-medium">
            <input name="generate_stock" type="checkbox" defaultChecked={item?.generate_stock ?? true} className="size-4" />
            Item controla estoque
          </label>
          <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm font-medium">
            <input name="active" type="checkbox" defaultChecked={item?.active ?? true} className="size-4" />
            Material ativo
          </label>
        </div>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">
        Observações
        <textarea name="notes" defaultValue={item?.notes ?? ""} className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <div className="flex justify-end">
        <Button disabled={pending}><Save />{pending ? "Salvando..." : "Salvar material"}</Button>
      </div>
    </form>
  );
}

function InventoryLocationForm({ location, onCompleted }: { location?: InventoryLocation | null; onCompleted?: () => void }) {
  const [state, action, pending] = useActionState(saveInventoryLocationAction, {});
  useInventoryToast(state, onCompleted);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={location?.id ?? ""} />
      <label className="grid gap-1.5 text-sm font-medium">
        Nome do local
        <input name="name" required defaultValue={location?.name ?? ""} className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Descrição
        <textarea name="description" defaultValue={location?.description ?? ""} className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm font-medium">
        <input name="active" type="checkbox" defaultChecked={location?.active ?? true} className="size-4" />
        Local ativo
      </label>
      <div className="flex justify-end">
        <Button disabled={pending}><Save />{pending ? "Salvando..." : "Salvar local"}</Button>
      </div>
    </form>
  );
}

export function InventoryWorkspace({ data, section }: { data: InventoryWorkspaceData; section: string }) {
  const [itemModal, setItemModal] = useState<InventoryItem | "new" | null>(null);
  const [locationModal, setLocationModal] = useState<InventoryLocation | "new" | null>(null);
  const totalQuantity = data.items.reduce((sum, item) => sum + Number(item.quantity_on_hand ?? 0), 0);
  const stockValue = data.items.reduce((sum, item) => sum + Number(item.stock_value_cents ?? 0), 0);
  const lowStock = data.items.filter((item) => Number(item.quantity_on_hand ?? 0) <= Number(item.minimum_quantity)).length;
  const expiringBatches = data.batches.filter((batch) => {
    if (!batch.expires_at) return false;
    const days = (new Date(batch.expires_at).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 45;
  }).length;
  const itemMap = useMemo(() => new Map(data.items.map((item) => [item.id, item])), [data.items]);
  const locationMap = useMemo(() => new Map(data.locations.map((location) => [location.id, location])), [data.locations]);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold">Estoque e materiais</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Entradas por notas do contas a pagar, consumo por atendimento e rastreabilidade por lote.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!data.access.canCreate} onClick={() => setLocationModal("new")}><MapPin />Novo local</Button>
          <Button disabled={!data.access.canCreate} onClick={() => setItemModal("new")}><Plus />Novo material</Button>
        </div>
      </header>

      <section className="grid gap-3 lg:grid-cols-4">
        <Metric label="Materiais ativos" value={String(data.items.filter((item) => item.active).length)} hint="Itens controlados pela clínica" />
        <Metric label="Quantidade total" value={String(totalQuantity.toLocaleString("pt-BR"))} hint="Soma dos lotes disponíveis" />
        <Metric label="Valor em estoque" value={formatCurrencyBRL(stockValue)} hint="Custo estimado dos lotes" />
        <Metric label="Alertas" value={String(lowStock + expiringBatches)} hint="Estoque mínimo ou validade próxima" />
      </section>

      {section === "items" || section === "overview" ? (
        <section className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3"><Package className="size-4 text-primary" /><p className="font-medium">Materiais cadastrados</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[13px]">
              <thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                <tr><th className="px-3 py-2.5">Material</th><th className="px-3 py-2.5">Categoria</th><th className="px-3 py-2.5 text-right">Saldo</th><th className="px-3 py-2.5 text-right">Mínimo</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Ações</th></tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2.5 font-medium">{item.name}<p className="text-xs font-normal text-muted-foreground">{item.sku || item.unit}</p></td>
                    <td className="px-3 py-2.5">{item.category || "Sem categoria"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{item.quantity_on_hand ?? 0} {item.unit}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{item.minimum_quantity}</td>
                    <td className="px-3 py-2.5"><Badge className={item.active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}>{item.active ? "Ativo" : "Inativo"}</Badge></td>
                    <td className="px-3 py-2.5 text-right"><Button size="sm" variant="outline" onClick={() => setItemModal(item)}>Editar</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {section === "batches" ? (
        <section className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3"><Boxes className="size-4 text-primary" /><p className="font-medium">Lotes e validade</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-[13px]"><thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2.5">Material</th><th className="px-3 py-2.5">Local</th><th className="px-3 py-2.5">Lote</th><th className="px-3 py-2.5">Validade</th><th className="px-3 py-2.5 text-right">Saldo</th><th className="px-3 py-2.5 text-right">Custo unit.</th></tr></thead><tbody>{data.batches.map((batch) => <tr key={batch.id} className="border-t"><td className="px-3 py-2.5 font-medium">{itemMap.get(batch.item_id)?.name ?? "Material"}</td><td className="px-3 py-2.5">{batch.location_id ? locationMap.get(batch.location_id)?.name ?? "Local" : "Padrão"}</td><td className="px-3 py-2.5">{batch.batch_number || "-"}</td><td className="px-3 py-2.5">{batch.expires_at ? new Date(`${batch.expires_at}T12:00:00`).toLocaleDateString("pt-BR") : "Sem validade"}</td><td className="px-3 py-2.5 text-right tabular-nums">{batch.quantity_on_hand}</td><td className="px-3 py-2.5 text-right tabular-nums">{formatCurrencyBRL(batch.unit_cost_cents)}</td></tr>)}</tbody></table></div>
        </section>
      ) : null}

      {section === "movements" || section === "care" ? (
        <section className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3"><ClipboardList className="size-4 text-primary" /><p className="font-medium">{section === "care" ? "Consumo por atendimento" : "Movimentos de estoque"}</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-[13px]"><thead className="bg-muted/40 text-left text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Material</th><th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5">Origem</th><th className="px-3 py-2.5 text-right">Qtd.</th><th className="px-3 py-2.5 text-right">Custo</th></tr></thead><tbody>{data.movements.filter((movement) => section !== "care" || movement.movement_type === "care_consumption").map((movement) => <tr key={movement.id} className="border-t"><td className="px-3 py-2.5">{new Date(movement.created_at).toLocaleString("pt-BR")}</td><td className="px-3 py-2.5 font-medium">{movement.item?.name ?? itemMap.get(movement.item_id)?.name ?? "Material"}</td><td className="px-3 py-2.5">{movement.movement_type === "purchase_entry" ? "Entrada por nota" : movement.movement_type === "care_consumption" ? "Consumo assistencial" : movement.movement_type}</td><td className="px-3 py-2.5">{movement.financial_entry_id ? "Contas a pagar" : movement.encounter_id ? "Atendimento" : "Manual"}</td><td className="px-3 py-2.5 text-right tabular-nums">{movement.direction === "out" ? "-" : "+"}{movement.quantity}</td><td className="px-3 py-2.5 text-right tabular-nums">{formatCurrencyBRL(movement.total_cost_cents)}</td></tr>)}</tbody></table></div>
        </section>
      ) : null}

      {section === "settings" ? (
        <section className="grid gap-3 rounded-lg border bg-card p-4">
          <p className="font-medium">Preferências operacionais</p>
          <p className="text-sm text-muted-foreground">
            O padrão atual exige que entradas venham do contas a pagar, preservando vínculo com nota, fornecedor e auditoria. Consumos podem ser lançados em enfermagem e prontuário.
          </p>
          <div className="grid gap-2 lg:grid-cols-3">
            {data.locations.map((location) => (
              <button key={location.id} type="button" onClick={() => setLocationModal(location)} className="rounded-md border bg-background p-3 text-left text-sm hover:bg-muted/30">
                <strong>{location.name}</strong>
                <p className="mt-1 text-xs text-muted-foreground">{location.description || "Sem descrição"}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <Modal open={Boolean(itemModal)} onOpenChange={(open) => !open && setItemModal(null)} title={itemModal === "new" ? "Novo material" : "Editar material"} className="max-w-3xl">
        {itemModal ? <InventoryItemForm item={itemModal === "new" ? null : itemModal} onCompleted={() => setItemModal(null)} /> : null}
      </Modal>
      <Modal open={Boolean(locationModal)} onOpenChange={(open) => !open && setLocationModal(null)} title={locationModal === "new" ? "Novo local" : "Editar local"} className="max-w-2xl">
        {locationModal ? <InventoryLocationForm location={locationModal === "new" ? null : locationModal} onCompleted={() => setLocationModal(null)} /> : null}
      </Modal>
    </div>
  );
}
