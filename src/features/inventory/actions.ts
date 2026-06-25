"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getInventoryAccess } from "@/repositories/inventory";
import { logAuditEvent } from "@/services/audit/audit-service";

export type InventoryActionState = {
  error?: string;
  success?: string;
};

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((value) => value || null);

const inventoryItemSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Informe o nome do item.").max(160),
  sku: z.string().trim().max(80).optional().or(z.literal("")).transform((value) => value || null),
  category: z.string().trim().max(120).optional().or(z.literal("")).transform((value) => value || null),
  unit: z.string().trim().min(1, "Informe a unidade.").max(20),
  minimum_quantity: z.coerce.number().min(0, "Informe um estoque mínimo válido.").max(999999).default(0),
  generate_stock: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
  notes: z.string().trim().max(700).optional().or(z.literal("")).transform((value) => value || null),
});

const inventoryLocationSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Informe o nome do local.").max(140),
  description: z.string().trim().max(500).optional().or(z.literal("")).transform((value) => value || null),
  active: z.enum(["on", "off"]).optional().transform((value) => value !== "off"),
});

const consumeSchema = z.object({
  item_id: z.string().uuid("Selecione o material."),
  batch_id: optionalUuid,
  location_id: optionalUuid,
  encounter_id: optionalUuid,
  nursing_assessment_id: optionalUuid,
  medical_record_id: optionalUuid,
  quantity: z.coerce.number().positive("Informe a quantidade consumida.").max(999999),
  notes: z.string().trim().max(500).optional().or(z.literal("")).transform((value) => value || null),
});

async function getContext() {
  const [{ activeClinic }, supabase] = await Promise.all([
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Faça login novamente." as const };
  if (!activeClinic) return { error: "Selecione uma clínica antes de usar o estoque." as const };
  const access = await getInventoryAccess(activeClinic.id);
  return { activeClinic, user, access };
}

function revalidateInventory() {
  revalidatePath("/estoque");
  revalidatePath("/financeiro");
  revalidatePath("/enfermagem");
  revalidatePath("/prontuarios");
}

export async function saveInventoryItemAction(
  _state: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const parsed = inventoryItemSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    sku: formData.get("sku"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    minimum_quantity: formData.get("minimum_quantity") || 0,
    generate_stock: formData.get("generate_stock") ? "on" : "off",
    active: formData.get("active") ? "on" : "off",
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const context = await getContext();
  if ("error" in context) return { error: context.error };
  if (parsed.data.id ? !context.access.canEdit : !context.access.canCreate) {
    return { error: "Seu perfil não possui permissão para salvar materiais." };
  }

  const admin = createSupabaseAdminClient();
  const { data: previous } = parsed.data.id
    ? await admin
        .from("inventory_items")
        .select("*")
        .eq("id", parsed.data.id)
        .eq("clinic_id", context.activeClinic.id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  const payload = {
    name: parsed.data.name,
    sku: parsed.data.sku,
    category: parsed.data.category,
    unit: parsed.data.unit,
    minimum_quantity: parsed.data.minimum_quantity,
    generate_stock: parsed.data.generate_stock,
    active: parsed.data.active,
    notes: parsed.data.notes,
    updated_by: context.user.id,
  };

  const result = parsed.data.id
    ? await admin.from("inventory_items").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("inventory_items")
        .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
        .select("id")
        .single();

  if (result.error || !result.data) return { error: "Não foi possível salvar o material." };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "inventory_item_updated" : "inventory_item_created",
    module: "inventory",
    recordTable: "inventory_items",
    recordId: result.data.id,
    oldValues: previous,
    newValues: payload,
  });

  revalidateInventory();
  return { success: parsed.data.id ? "Material atualizado." : "Material cadastrado." };
}

export async function saveInventoryLocationAction(
  _state: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const parsed = inventoryLocationSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    description: formData.get("description"),
    active: formData.get("active") ? "on" : "off",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const context = await getContext();
  if ("error" in context) return { error: context.error };
  if (parsed.data.id ? !context.access.canEdit : !context.access.canCreate) {
    return { error: "Seu perfil não possui permissão para salvar locais de estoque." };
  }

  const admin = createSupabaseAdminClient();
  const payload = {
    name: parsed.data.name,
    description: parsed.data.description,
    active: parsed.data.active,
    updated_by: context.user.id,
  };

  const result = parsed.data.id
    ? await admin.from("inventory_locations").update(payload).eq("id", parsed.data.id).select("id").single()
    : await admin
        .from("inventory_locations")
        .insert({ clinic_id: context.activeClinic.id, ...payload, created_by: context.user.id })
        .select("id")
        .single();

  if (result.error || !result.data) return { error: "Não foi possível salvar o local de estoque." };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: parsed.data.id ? "inventory_location_updated" : "inventory_location_created",
    module: "inventory",
    recordTable: "inventory_locations",
    recordId: result.data.id,
    newValues: payload,
  });

  revalidateInventory();
  return { success: parsed.data.id ? "Local atualizado." : "Local cadastrado." };
}

export async function consumeInventoryMaterialAction(
  _state: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const parsed = consumeSchema.safeParse({
    item_id: formData.get("item_id"),
    batch_id: formData.get("batch_id") || undefined,
    location_id: formData.get("location_id") || undefined,
    encounter_id: formData.get("encounter_id") || undefined,
    nursing_assessment_id: formData.get("nursing_assessment_id") || undefined,
    medical_record_id: formData.get("medical_record_id") || undefined,
    quantity: formData.get("quantity"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const context = await getContext();
  if ("error" in context) return { error: context.error };
  if (!context.access.canCreate && !context.access.canEdit) {
    return { error: "Seu perfil não pode lançar consumo de materiais." };
  }
  if (!parsed.data.encounter_id && !parsed.data.nursing_assessment_id && !parsed.data.medical_record_id) {
    return { error: "Informe o atendimento vinculado ao consumo." };
  }

  const admin = createSupabaseAdminClient();
  const { data: selectedBatch } = parsed.data.batch_id
    ? await admin
        .from("inventory_batches")
        .select("id, quantity_on_hand, unit_cost_cents, location_id")
        .eq("id", parsed.data.batch_id)
        .eq("clinic_id", context.activeClinic.id)
        .is("deleted_at", null)
        .maybeSingle()
    : await admin
        .from("inventory_batches")
        .select("id, quantity_on_hand, unit_cost_cents, location_id")
        .eq("item_id", parsed.data.item_id)
        .eq("clinic_id", context.activeClinic.id)
        .is("deleted_at", null)
        .gt("quantity_on_hand", 0)
        .order("expires_at", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();

  if (!selectedBatch) return { error: "Este material ainda não possui saldo disponível em estoque." };
  const quantity = Number(parsed.data.quantity);
  if (Number(selectedBatch.quantity_on_hand) < quantity) {
    return { error: "Saldo insuficiente para lançar este consumo." };
  }

  const nextQuantity = Number(selectedBatch.quantity_on_hand) - quantity;
  const { error: batchError } = await admin
    .from("inventory_batches")
    .update({ quantity_on_hand: nextQuantity, updated_by: context.user.id })
    .eq("id", selectedBatch.id)
    .eq("clinic_id", context.activeClinic.id);

  if (batchError) return { error: "Não foi possível atualizar o saldo do lote." };

  const unitCostCents = Number(selectedBatch.unit_cost_cents ?? 0);
  const totalCostCents = Math.round(quantity * unitCostCents);
  const { data: movement, error: movementError } = await admin
    .from("inventory_movements")
    .insert({
      clinic_id: context.activeClinic.id,
      item_id: parsed.data.item_id,
      batch_id: selectedBatch.id,
      location_id: parsed.data.location_id ?? selectedBatch.location_id,
      movement_type: "care_consumption",
      direction: "out",
      quantity,
      unit_cost_cents: unitCostCents,
      total_cost_cents: totalCostCents,
      encounter_id: parsed.data.encounter_id,
      nursing_assessment_id: parsed.data.nursing_assessment_id,
      medical_record_id: parsed.data.medical_record_id,
      notes: parsed.data.notes,
      created_by: context.user.id,
    })
    .select("id")
    .single();

  if (movementError || !movement) return { error: "Saldo atualizado, mas o movimento não foi registrado. Revise o estoque." };

  await logAuditEvent({
    clinicId: context.activeClinic.id,
    userId: context.user.id,
    actionType: "inventory_care_consumption_created",
    module: "inventory",
    recordTable: "inventory_movements",
    recordId: movement.id,
    newValues: {
      item_id: parsed.data.item_id,
      batch_id: selectedBatch.id,
      quantity,
      total_cost_cents: totalCostCents,
      encounter_id: parsed.data.encounter_id,
      nursing_assessment_id: parsed.data.nursing_assessment_id,
      medical_record_id: parsed.data.medical_record_id,
    },
    notes: "Material lançado como consumo assistencial.",
  });

  revalidateInventory();
  return { success: "Material lançado no atendimento." };
}
