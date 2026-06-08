import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { InvoiceSummary } from "@/types/domain";

export async function listCurrentUserInvoices(): Promise<InvoiceSummary[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("invoices")
    .select("id, stripe_invoice_id, status, amount_due, amount_paid, currency, hosted_invoice_url, invoice_pdf, paid_at, created_at")
    .eq("owner_user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error || !data) {
    return [];
  }

  return data as InvoiceSummary[];
}
