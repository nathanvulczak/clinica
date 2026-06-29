import { notFound, redirect } from "next/navigation";
import { getActiveClinicContext } from "@/features/clinics/context";
import { PrintButton } from "@/features/financial/components/print-button";
import { getFinancialReceiptDetail } from "@/repositories/financial";
import { formatCurrencyBRL } from "@/lib/utils";
import { getClinicDocumentBranding } from "@/services/documents/clinic-document-branding";

function formatDate(value: string | null | undefined) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export default async function FinancialReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  const { activeClinic } = await getActiveClinicContext();
  if (!activeClinic) redirect("/dashboard?clinic=required");

  const [detail, branding] = await Promise.all([
    getFinancialReceiptDetail(activeClinic.id, receiptId),
    getClinicDocumentBranding(activeClinic.id),
  ]);
  if (!detail) notFound();

  const total =
    detail.entry.amount_cents - detail.entry.discount_cents + detail.entry.addition_cents;
  const open = Math.max(total - detail.entry.paid_cents, 0);

  return (
    <main className="report-content selectable mx-auto grid max-w-4xl gap-6 bg-background p-8 print:max-w-none print:p-0">
      <style>{`
        @page { size: A4; margin: 16mm; }
        @media print {
          .no-print { display: none; }
          body { background: white; }
        }
      `}</style>
      <div className="no-print flex justify-end">
        <PrintButton />
      </div>
      <section className="rounded-lg border bg-card p-8 print:border-0 print:p-0">
        <header className="border-b-2 pb-4" style={{ borderColor: branding.primary_color }}>
          <div className="flex items-center justify-between gap-5">
            <div className="flex items-center gap-3">{branding.logo_url ? <span className="h-12 w-40 bg-contain bg-left bg-no-repeat" style={{ backgroundImage: `url(${branding.logo_url})` }} /> : <strong style={{ color: branding.primary_color }}>{branding.trade_name}</strong>}<div className="grid text-xs text-muted-foreground"><strong className="text-foreground">{branding.trade_name}</strong>{branding.show_legal_name && branding.legal_name ? <span>{branding.legal_name}</span> : null}{branding.show_document && branding.document ? <span>CNPJ/CPF: {branding.document}</span> : null}</div></div>
            <span className="text-xs text-muted-foreground">CliniCore Financeiro</span>
          </div>
          <h1 className="mt-4 text-xl font-semibold">{detail.receipt.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Emitido em {formatDate(detail.receipt.issued_at)}
          </p>
        </header>
        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Clinica</p>
            <p className="mt-1 font-medium">{detail.clinic?.trade_name ?? activeClinic.trade_name}</p>
            <p className="text-muted-foreground">{detail.clinic?.document ?? "Documento não informado"}</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Paciente</p>
            <p className="mt-1 font-medium">
              {detail.entry.patient?.social_name || detail.entry.patient?.full_name || "Paciente"}
            </p>
            <p className="text-muted-foreground">{detail.entry.patient?.phone ?? "Telefone não informado"}</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Lancamento</p>
            <p className="mt-1 font-medium">{detail.entry.description}</p>
            <p className="text-muted-foreground">Vencimento: {formatDate(detail.entry.due_date)}</p>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Valores</p>
            <p className="mt-1 font-medium">Total: {formatCurrencyBRL(total)}</p>
            <p className="text-muted-foreground">
              Pago: {formatCurrencyBRL(detail.entry.paid_cents)} | Aberto: {formatCurrencyBRL(open)}
            </p>
          </div>
        </div>
        <article className="mt-6 whitespace-pre-wrap rounded-md border bg-background p-5 text-sm leading-7">
          {detail.receipt.content}
        </article>
        <footer className="mt-10 border-t pt-5 text-xs text-muted-foreground">
          {branding.footer_text ?? "Documento financeiro com rastreabilidade em auditoria. Confira as informações antes da entrega ao paciente."} | CliniCore
        </footer>
      </section>
    </main>
  );
}
