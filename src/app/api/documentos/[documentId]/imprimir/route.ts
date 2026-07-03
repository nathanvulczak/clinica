import { NextResponse } from "next/server";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDocumentsAccess } from "@/repositories/documents";
import { logAuditEvent } from "@/services/audit/audit-service";
import {
  clinicDocumentCss,
  escapeDocumentHtml as escapeHtml,
  getClinicDocumentBranding,
  renderClinicDocumentFooter,
  renderClinicDocumentHeader,
} from "@/services/documents/clinic-document-branding";

function formatDate(value?: string | null, includeTime = false) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const [{ documentId }, { activeClinic }, supabase] = await Promise.all([
    params,
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!activeClinic) return new NextResponse("Clínica ativa não encontrada.", { status: 404 });

  const access = await getDocumentsAccess(activeClinic.id);
  if (!access.canView || (!access.canExport && !access.canManage)) {
    return new NextResponse("Acesso à exportação documental não autorizado.", { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const [{ data: document }, branding] = await Promise.all([
    admin
      .from("generated_documents")
      .select("id, clinic_id, title, content, status, document_number, issued_at, expires_at, cancelled_at, cancellation_reason, created_at, patient:patients(full_name, social_name, cpf), appointment:appointments(starts_at, appointment_type), professional:clinic_members(profile:profiles!clinic_members_user_id_fkey(full_name)), template:document_templates(name, template_type)")
      .eq("id", documentId)
      .eq("clinic_id", activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle(),
    getClinicDocumentBranding(activeClinic.id, { embedLogo: true }),
  ]);
  if (!document) return new NextResponse("Documento não encontrado.", { status: 404 });
  if (document.status === "draft") {
    return new NextResponse("Emita o rascunho antes de imprimir.", { status: 409 });
  }

  await Promise.all([
    admin.from("generated_document_events").insert({
      clinic_id: activeClinic.id,
      document_id: document.id,
      event_type: "opened_for_print",
      details: { source: "print_view", document_number: document.document_number },
      created_by: user.id,
      updated_by: user.id,
    }),
    logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "document_opened_for_print",
      module: "documents",
      recordTable: "generated_documents",
      recordId: document.id,
      level: "security",
      notes: "Documento aberto em visualização preparada para impressão/PDF.",
    }),
  ]);

  const patient = document.patient as unknown as {
    full_name?: string;
    social_name?: string | null;
    cpf?: string | null;
  } | null;
  const appointment = document.appointment as unknown as {
    starts_at?: string;
    appointment_type?: string;
  } | null;
  const professional = document.professional as unknown as {
    profile?: { full_name?: string } | null;
  } | null;
  const template = document.template as unknown as { name?: string; template_type?: string } | null;
  const content = escapeHtml(document.content).replaceAll("\n", "<br />");
  const cancelled = document.status === "cancelled";

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(document.title)}</title>
    <style>
      @page { size: A4 portrait; margin: 16mm; }
      ${clinicDocumentCss}
      * { box-sizing: border-box; }
      body { margin: 0; background: #f1f5f9; color: #111827; font-family: Arial, sans-serif; }
      .toolbar { position: sticky; top: 0; z-index: 5; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 20px; border-bottom:1px solid #dbe3e8; background:rgba(255,255,255,.97); }
      .toolbar strong { display:block; font-size:13px; }
      .toolbar span { color:#64748b; font-size:11px; }
      .toolbar button { border:0; border-radius:6px; background:#0f766e; color:white; padding:9px 13px; font-size:12px; font-weight:700; cursor:pointer; }
      main { position:relative; width:min(210mm, calc(100% - 32px)); min-height:297mm; margin:22px auto; border:1px solid #dbe3e8; background:white; padding:16mm; box-shadow:0 10px 30px rgb(15 23 42 / 8%); }
      .meta { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin:14px 0 22px; }
      .meta div { border:1px solid #e2e8f0; border-radius:5px; padding:8px; }
      .meta span { display:block; color:#64748b; font-size:8px; text-transform:uppercase; }
      .meta strong { display:block; margin-top:3px; font-size:10px; overflow-wrap:anywhere; }
      .document-content { min-height:180mm; color:#111827; font-family:Georgia, 'Times New Roman', serif; font-size:11.5pt; line-height:1.62; overflow-wrap:anywhere; }
      .watermark { position:absolute; inset:42% 0 auto; color:rgb(185 28 28 / 12%); font-size:64px; font-weight:800; text-align:center; transform:rotate(-24deg); pointer-events:none; }
      .cancel-note { margin:12px 0; border:1px solid #fecaca; background:#fef2f2; color:#991b1b; padding:9px; font-size:10px; }
      @media print { body { background:white; } .toolbar { display:none; } main { width:100%; min-height:auto; margin:0; border:0; padding:0; box-shadow:none; } }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <div><strong>${escapeHtml(document.document_number ?? "Documento em rascunho")}</strong><span>Revise antes de imprimir ou salvar como PDF.</span></div>
      <button onclick="window.print()">Imprimir / salvar PDF</button>
    </div>
    <main>
      ${cancelled ? '<div class="watermark">CANCELADO</div>' : ""}
      ${renderClinicDocumentHeader(branding, document.title)}
      <section class="meta">
        <div><span>Número</span><strong>${escapeHtml(document.document_number ?? "Rascunho")}</strong></div>
        <div><span>Emissão</span><strong>${escapeHtml(formatDate(document.issued_at ?? document.created_at, true))}</strong></div>
        <div><span>Paciente</span><strong>${escapeHtml(patient?.social_name || patient?.full_name || "Sem vínculo")}</strong></div>
        <div><span>Profissional</span><strong>${escapeHtml(professional?.profile?.full_name ?? "Sem vínculo")}</strong></div>
      </section>
      ${appointment ? `<div class="cancel-note" style="border-color:#dbe3e8;background:#f8fafc;color:#475569">Contexto: ${escapeHtml(appointment.appointment_type ?? "Atendimento")} em ${escapeHtml(formatDate(appointment.starts_at, true))} | Modelo: ${escapeHtml(template?.name ?? "Livre")}</div>` : ""}
      ${cancelled ? `<div class="cancel-note"><strong>Documento cancelado em ${escapeHtml(formatDate(document.cancelled_at, true))}.</strong><br />Motivo: ${escapeHtml(document.cancellation_reason ?? "Não informado")}</div>` : ""}
      <article class="document-content">${content}</article>
      ${renderClinicDocumentFooter(branding, `Documento ${document.document_number ?? document.id}. Emissão e acesso rastreados em auditoria.`)}
    </main>
    <script>
      window.addEventListener('afterprint', function () {
        fetch(window.location.href, { method: 'POST', keepalive: true }).catch(function () {});
      });
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const [{ documentId }, { activeClinic }, supabase] = await Promise.all([
    params,
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !activeClinic) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const access = await getDocumentsAccess(activeClinic.id);
  if (!access.canView || (!access.canExport && !access.canManage)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: document } = await admin
    .from("generated_documents")
    .select("id, document_number, status")
    .eq("id", documentId)
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .neq("status", "draft")
    .maybeSingle();
  if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  const now = new Date().toISOString();
  await Promise.all([
    admin
      .from("generated_documents")
      .update({ printed_at: now, printed_by: user.id, updated_by: user.id })
      .eq("id", document.id)
      .eq("clinic_id", activeClinic.id),
    admin.from("generated_document_events").insert({
      clinic_id: activeClinic.id,
      document_id: document.id,
      event_type: "printed",
      details: { source: "browser_afterprint", document_number: document.document_number },
      created_by: user.id,
      updated_by: user.id,
    }),
    logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "document_printed",
      module: "documents",
      recordTable: "generated_documents",
      recordId: document.id,
      level: "security",
      notes: "Impressão ou salvamento em PDF concluído pelo usuário.",
    }),
  ]);

  return NextResponse.json({ ok: true });
}
