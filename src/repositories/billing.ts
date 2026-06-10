import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { InvoiceSummary } from "@/types/domain";

export async function listCurrentUserInvoices(ownerUserId?: string): Promise<InvoiceSummary[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const ownerId = ownerUserId ?? user.id;
  const client = ownerId === user.id ? supabase : createSupabaseAdminClient();
  const { data, error } = await client
    .from("invoices")
    .select("id, stripe_invoice_id, status, amount_due, amount_paid, currency, hosted_invoice_url, invoice_pdf, paid_at, created_at")
    .eq("owner_user_id", ownerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error || !data) {
    return [];
  }

  return data as InvoiceSummary[];
}

export async function countOwnerClinics(ownerUserId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return 0;
  }

  const { count } = await createSupabaseAdminClient()
    .from("clinics")
    .select("id", { count: "exact", head: true })
    .eq("created_by", ownerUserId)
    .is("deleted_at", null);

  return count ?? 0;
}
