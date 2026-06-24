import { NextResponse } from "next/server";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCurrencyBRL } from "@/lib/utils";
import { getFinancialAccess, listFinancialEntries } from "@/repositories/financial";
import { logAuditEvent } from "@/services/audit/audit-service";
import { clinicDocumentCss, escapeDocumentHtml as escapeHtml, getClinicDocumentBranding, renderClinicDocumentFooter, renderClinicDocumentHeader } from "@/services/documents/clinic-document-branding";

function formatDate(value: string | null | undefined) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function parseCurrencyToCents(value: string | null) {
  if (!value) return null;
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const { activeClinic } = await getActiveClinicContext();
  if (!activeClinic) return new NextResponse("Clínica ativa não encontrada.", { status: 404 });

  const access = await getFinancialAccess(activeClinic.id);
  if (!access.canView) return new NextResponse("Acesso financeiro não autorizado.", { status: 403 });
  const branding = await getClinicDocumentBranding(activeClinic.id, { embedLogo: true });

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");
  const accountId = url.searchParams.get("account_id");
  const reconciled = url.searchParams.get("reconciled");
  const includeIn = url.searchParams.get("include_in") !== "0";
  const includeOut = url.searchParams.get("include_out") !== "0";
  const minAmount = parseCurrencyToCents(url.searchParams.get("min_amount"));
  const maxAmount = parseCurrencyToCents(url.searchParams.get("max_amount"));

  const entries = await listFinancialEntries(activeClinic.id);
  const rows = entries
    .flatMap((entry) =>
      entry.payments.map((payment) => ({
        entry,
        payment,
        party: entry.patient?.social_name || entry.patient?.full_name || entry.vendor?.name || "Sem vinculação",
      })),
    )
    .filter(({ payment }) => payment.status === "confirmed")
    .filter(({ payment }) => (includeIn ? true : payment.direction !== "in"))
    .filter(({ payment }) => (includeOut ? true : payment.direction !== "out"))
    .filter(({ payment }) => !accountId || payment.account_id === accountId)
    .filter(({ payment }) => !dateFrom || payment.paid_at >= `${dateFrom}T00:00:00`)
    .filter(({ payment }) => !dateTo || payment.paid_at <= `${dateTo}T23:59:59`)
    .filter(({ payment }) => (reconciled === "yes" ? Boolean(payment.reconciliation_id) : true))
    .filter(({ payment }) => (reconciled === "no" ? !payment.reconciliation_id : true))
    .filter(({ payment }) => (minAmount === null ? true : payment.net_amount_cents >= minAmount))
    .filter(({ payment }) => (maxAmount === null ? true : payment.net_amount_cents <= maxAmount))
    .sort((a, b) => new Date(a.payment.paid_at).getTime() - new Date(b.payment.paid_at).getTime());

  const accountIds = [...new Set(rows.map((row) => row.payment.account_id).filter(Boolean))] as string[];
  const { data: accounts } = accountIds.length
    ? await supabase.from("financial_accounts").select("id, name, bank_name, agency, account_number").in("id", accountIds)
    : { data: [] };
  const accountMap = new Map((accounts ?? []).map((account) => [account.id, account]));
  const totalIn = rows.filter(({ payment }) => payment.direction === "in").reduce((sum, row) => sum + row.payment.net_amount_cents, 0);
  const totalOut = rows.filter(({ payment }) => payment.direction === "out").reduce((sum, row) => sum + row.payment.net_amount_cents, 0);

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "financial_movements_report_viewed",
    module: "financial",
    recordTable: "financial_payments",
    level: "security",
    notes: "Relatório de movimentos financeiros visualizado para impressão/PDF.",
    newValues: Object.fromEntries(url.searchParams.entries()),
  });

  const tableRows = rows
    .map(({ entry, payment, party }) => {
      const account = payment.account_id ? accountMap.get(payment.account_id) : null;
      return `
        <tr>
          <td>${escapeHtml(formatDate(payment.paid_at))}</td>
          <td>${escapeHtml(account?.name ?? "Sem conta")}</td>
          <td>${escapeHtml(payment.direction === "in" ? "Entrada" : "Saída")}</td>
          <td>${escapeHtml(entry.description)}<br><span>${escapeHtml(party)}</span></td>
          <td class="right">${escapeHtml(formatCurrencyBRL(payment.amount_cents))}</td>
          <td class="right">${escapeHtml(formatCurrencyBRL(payment.fee_cents))}</td>
          <td class="right">${escapeHtml(formatCurrencyBRL(payment.net_amount_cents))}</td>
          <td>${escapeHtml(payment.reconciliation_id ? "Conciliado" : "Pendente")}</td>
        </tr>
      `;
    })
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Relatório de movimentos financeiros</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      ${clinicDocumentCss}
      * { box-sizing: border-box; }
      body { margin: 0; background: #f8fafc; color: #111827; font-family: Arial, sans-serif; }
      .toolbar { position: sticky; top: 0; display: flex; justify-content: space-between; gap: 12px; padding: 14px 22px; border-bottom: 1px solid #e5e7eb; background: rgba(255,255,255,.96); }
      button { border: 0; border-radius: 6px; background: #111827; color: white; padding: 10px 14px; font-weight: 600; cursor: pointer; }
      main { width: min(1180px, calc(100% - 32px)); margin: 24px auto; border: 1px solid #e5e7eb; border-radius: 10px; background: white; padding: 24px; }
      h1 { margin: 0; font-size: 22px; }
      .muted, span { color: #6b7280; font-size: 12px; }
      .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
      .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f9fafb; }
      .box strong { display: block; margin-top: 6px; font-size: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #f3f4f6; color: #4b5563; text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: .03em; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
      .right { text-align: right; }
      footer { margin-top: 18px; color: #6b7280; font-size: 11px; }
      @media print { body { background: white; } .toolbar { display: none; } main { width: 100%; margin: 0; border: 0; padding: 0; } }
    </style>
  </head>
  <body>
    <div class="toolbar"><div><strong>Relatório financeiro para PDF</strong><div class="muted">Revise os filtros antes de imprimir ou salvar como PDF.</div></div><button onclick="window.print()">Imprimir / salvar PDF</button></div>
    <main>
      ${renderClinicDocumentHeader(branding, "Movimentos financeiros")}
      <div class="muted" style="margin-top:8px">Período: ${escapeHtml(dateFrom ?? "início")} até ${escapeHtml(dateTo ?? "hoje")}</div>
      <section class="summary">
        <div class="box">Entradas<strong>${escapeHtml(formatCurrencyBRL(totalIn))}</strong></div>
        <div class="box">Saídas<strong>${escapeHtml(formatCurrencyBRL(totalOut))}</strong></div>
        <div class="box">Saldo líquido<strong>${escapeHtml(formatCurrencyBRL(totalIn - totalOut))}</strong></div>
        <div class="box">Movimentos<strong>${rows.length}</strong></div>
      </section>
      <table>
        <thead><tr><th>Data</th><th>Conta</th><th>Tipo</th><th>Lançamento</th><th class="right">Bruto</th><th class="right">Taxa</th><th class="right">Líquido</th><th>Conciliação</th></tr></thead>
        <tbody>${tableRows || '<tr><td colspan="8">Nenhum movimento encontrado.</td></tr>'}</tbody>
      </table>
      ${renderClinicDocumentFooter(branding, "Relatório financeiro. A visualização foi registrada em auditoria.")}
    </main>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
