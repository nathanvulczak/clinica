import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { InventoryBatch, InventoryItem, InventoryLocation, InventoryMovement } from "@/types/domain";

export type InventoryAccess = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canManage: boolean;
  canExport: boolean;
};

export type InventoryWorkspace = {
  access: InventoryAccess;
  items: InventoryItem[];
  locations: InventoryLocation[];
  batches: InventoryBatch[];
  movements: InventoryMovement[];
};

export type InventoryOptionData = {
  items: InventoryItem[];
  locations: InventoryLocation[];
  batches: InventoryBatch[];
};

export async function getInventoryAccess(clinicId?: string | null): Promise<InventoryAccess> {
  const authorization = await getClinicAuthorization(clinicId ?? undefined);

  return {
    canView: authorization.can("inventory", "view"),
    canCreate: authorization.can("inventory", "create"),
    canEdit: authorization.can("inventory", "edit"),
    canManage: authorization.can("inventory", "manage"),
    canExport: authorization.can("inventory", "export"),
  };
}

export async function getInventoryOptions(clinicId?: string | null): Promise<InventoryOptionData> {
  if (!clinicId) return { items: [], locations: [], batches: [] };
  const access = await getInventoryAccess(clinicId);
  if (!access.canView && !access.canCreate) return { items: [], locations: [], batches: [] };

  const admin = createSupabaseAdminClient();
  const [{ data: items }, { data: locations }, { data: batches }] = await Promise.all([
    admin
      .from("inventory_items")
      .select("id, clinic_id, name, sku, category, unit, generate_stock, minimum_quantity, active, notes, created_at, updated_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .eq("active", true)
      .order("name"),
    admin
      .from("inventory_locations")
      .select("id, clinic_id, name, description, active, created_at, updated_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .eq("active", true)
      .order("name"),
    admin
      .from("inventory_batches")
      .select("id, clinic_id, item_id, location_id, batch_number, expires_at, quantity_on_hand, unit_cost_cents, source_financial_entry_id, source_financial_entry_item_id, created_at, updated_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .gt("quantity_on_hand", 0)
      .order("expires_at", { ascending: true, nullsFirst: false }),
  ]);

  return {
    items: (items ?? []) as InventoryItem[],
    locations: (locations ?? []) as InventoryLocation[],
    batches: (batches ?? []) as InventoryBatch[],
  };
}

export async function getInventoryWorkspace(clinicId?: string | null): Promise<InventoryWorkspace> {
  const access = await getInventoryAccess(clinicId);
  const empty: InventoryWorkspace = { access, items: [], locations: [], batches: [], movements: [] };
  if (!clinicId || !access.canView) return empty;

  const admin = createSupabaseAdminClient();
  const [{ data: items }, { data: locations }, { data: batches }, { data: movements }] = await Promise.all([
    admin
      .from("inventory_items")
      .select("id, clinic_id, name, sku, category, unit, generate_stock, minimum_quantity, active, notes, created_at, updated_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("name"),
    admin
      .from("inventory_locations")
      .select("id, clinic_id, name, description, active, created_at, updated_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("name"),
    admin
      .from("inventory_batches")
      .select("id, clinic_id, item_id, location_id, batch_number, expires_at, quantity_on_hand, unit_cost_cents, source_financial_entry_id, source_financial_entry_item_id, created_at, updated_at")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("expires_at", { ascending: true, nullsFirst: false }),
    admin
      .from("inventory_movements")
      .select("id, clinic_id, item_id, location_id, batch_id, movement_type, direction, quantity, unit_cost_cents, total_cost_cents, financial_entry_id, financial_entry_item_id, appointment_id, encounter_id, nursing_assessment_id, medical_record_id, notes, created_at, item:inventory_items(id, name, unit), location:inventory_locations(id, name)")
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const stockByItem = new Map<string, { quantity: number; value: number }>();
  for (const batch of (batches ?? []) as InventoryBatch[]) {
    const current = stockByItem.get(batch.item_id) ?? { quantity: 0, value: 0 };
    current.quantity += Number(batch.quantity_on_hand);
    current.value += Math.round(Number(batch.quantity_on_hand) * Number(batch.unit_cost_cents));
    stockByItem.set(batch.item_id, current);
  }

  return {
    access,
    items: ((items ?? []) as InventoryItem[]).map((item) => {
      const stock = stockByItem.get(item.id);
      return {
        ...item,
        quantity_on_hand: stock?.quantity ?? 0,
        stock_value_cents: stock?.value ?? 0,
      };
    }),
    locations: (locations ?? []) as InventoryLocation[],
    batches: (batches ?? []) as InventoryBatch[],
    movements: (movements ?? []) as unknown as InventoryMovement[],
  };
}

export async function getInventoryCareConsumption(clinicId: string, encounterId: string) {
  const [{ items, locations, batches }, admin] = await Promise.all([
    getInventoryOptions(clinicId),
    Promise.resolve(createSupabaseAdminClient()),
  ]);
  const { data: movements } = await admin
    .from("inventory_movements")
    .select("id, clinic_id, item_id, location_id, batch_id, movement_type, direction, quantity, unit_cost_cents, total_cost_cents, financial_entry_id, financial_entry_item_id, appointment_id, encounter_id, nursing_assessment_id, medical_record_id, notes, created_at, item:inventory_items(id, name, unit), location:inventory_locations(id, name)")
    .eq("clinic_id", clinicId)
    .eq("encounter_id", encounterId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return {
    items,
    locations,
    batches,
    movements: (movements ?? []) as unknown as InventoryMovement[],
  };
}
