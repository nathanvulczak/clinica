import { NextResponse } from "next/server";
import { getActiveClinicContext } from "@/features/clinics/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDiagnosticsAccess } from "@/repositories/diagnostics";
import { logAuditEvent } from "@/services/audit/audit-service";
import {
  clinicDocumentCss,
  escapeDocumentHtml as escapeHtml,
  getClinicDocumentBranding,
  renderClinicDocumentFooter,
  renderClinicDocumentHeader,
} from "@/services/documents/clinic-document-branding";

function formatDate(value?: string | null, includeTime = false) {
  if (!value) return "Nao informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

const categoryLabels: Record<string, string> = {
  laboratory: "Laboratorio",
  imaging: "Imagem",
  pathology: "Patologia",
  functional: "Funcional",
  other: "Outro",
};

const priorityLabels: Record<string, string> = {
  routine: "Rotina",
  urgent: "Urgente",
  stat: "Imediato",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const [{ orderId }, { activeClinic }, supabase] = await Promise.all([
    params,
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!activeClinic) return new NextResponse("Clinica ativa nao encontrada.", { status: 404 });

  const access = await getDiagnosticsAccess(activeClinic.id);
  if (!access.canView || (!access.canExport && !access.canCreate && !access.canManage)) {
    return new NextResponse("Acesso ao pedido diagnostico nao autorizado.", { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const [{ data: order }, branding] = await Promise.all([
    admin
      .from("diagnostic_orders")
      .select("id, clinic_id, order_number, category, priority, status, clinical_indication, fasting_instructions, scheduled_at, created_at, patient:patients(full_name, social_name, cpf, birth_date, phone), professional:clinic_members(profile:profiles!clinic_members_user_id_fkey(full_name)), appointment:appointments(starts_at, appointment_type), items:diagnostic_order_items(code_system, procedure_code, name, specimen, instructions, sort_order)")
      .eq("id", orderId)
      .eq("clinic_id", activeClinic.id)
      .is("deleted_at", null)
      .maybeSingle(),
    getClinicDocumentBranding(activeClinic.id, { embedLogo: true }),
  ]);
  if (!order) return new NextResponse("Pedido diagnostico nao encontrado.", { status: 404 });

  await Promise.all([
    admin.from("diagnostic_order_events").insert({
      clinic_id: activeClinic.id,
      order_id: order.id,
      event_type: "request_opened_for_print",
      previous_status: order.status,
      next_status: order.status,
      details: { order_number: order.order_number, source: "print_view" },
      created_by: user.id,
    }),
    logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "diagnostic_request_opened_for_print",
      module: "diagnostics",
      recordTable: "diagnostic_orders",
      recordId: order.id,
      level: "security",
      notes: "Solicitacao diagnostica aberta para impressao/PDF.",
    }),
  ]);

  const patient = order.patient as unknown as {
    full_name?: string;
    social_name?: string | null;
    cpf?: string | null;
    birth_date?: string | null;
    phone?: string | null;
  } | null;
  const professional = order.professional as unknown as { profile?: { full_name?: string } | null } | null;
  const appointment = order.appointment as unknown as { starts_at?: string; appointment_type?: string } | null;
  const items = [...((order.items ?? []) as Array<{
    code_system?: string;
    procedure_code?: string | null;
    name?: string;
    specimen?: string | null;
    instructions?: string | null;
    sort_order?: number;
  }>)]
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));

  const rows = items.map((item, index) => `<tr>
    <td>${index + 1}</td>
    <td><strong>${escapeHtml(item.name ?? "Exame")}</strong>${item.instructions ? `<small>${escapeHtml(item.instructions)}</small>` : ""}</td>
    <td>${escapeHtml(item.specimen ?? "-")}</td>
    <td>${escapeHtml(item.procedure_code ? `${item.code_system?.toUpperCase() ?? "COD"} ${item.procedure_code}` : "-")}</td>
  </tr>`).join("");

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(order.order_number)} - solicitacao de exames</title>
    <style>
      @page { size: A4 portrait; margin: 14mm; }
      ${clinicDocumentCss}
      * { box-sizing:border-box; }
      body { margin:0; background:#f1f5f9; color:#111827; font-family:Arial, sans-serif; }
      .toolbar { position:sticky; top:0; z-index:5; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 20px; border-bottom:1px solid #dbe3e8; background:rgba(255,255,255,.98); }
      .toolbar strong { display:block; font-size:13px; }
      .toolbar span { color:#64748b; font-size:11px; }
      .toolbar button { border:0; border-radius:6px; background:#0f766e; color:white; padding:9px 13px; font-size:12px; font-weight:700; cursor:pointer; }
      main { width:min(210mm, calc(100% - 32px)); min-height:297mm; margin:22px auto; border:1px solid #dbe3e8; background:white; padding:14mm; box-shadow:0 10px 30px rgb(15 23 42 / 8%); }
      .meta { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin:14px 0 18px; }
      .meta div { border:1px solid #e2e8f0; border-radius:5px; padding:8px; }
      .meta span { display:block; color:#64748b; font-size:8px; text-transform:uppercase; }
      .meta strong { display:block; margin-top:3px; font-size:10px; overflow-wrap:anywhere; }
      h2 { margin:18px 0 8px; border-left:2px solid ${escapeHtml(branding.primary_color)}; background:#f8fafc; padding:6px 8px; font-size:11px; text-transform:uppercase; letter-spacing:.02em; }
      p { margin:0; font-size:11px; line-height:1.55; white-space:pre-wrap; }
      table { width:100%; border-collapse:collapse; font-size:10px; }
      th { background:#f8fafc; color:#475569; font-size:8.5px; text-align:left; text-transform:uppercase; }
      th, td { border:1px solid #dbe3e8; padding:7px; vertical-align:top; }
      td:first-child { width:28px; text-align:center; color:#64748b; }
      small { display:block; margin-top:3px; color:#64748b; font-size:9px; line-height:1.4; }
      .signature { display:grid; grid-template-columns:1fr 1fr; gap:30px; margin-top:30px; font-size:10px; }
      .signature div { border-top:1px solid #94a3b8; padding-top:6px; text-align:center; }
      @media print { body { background:white; } .toolbar { display:none; } main { width:100%; min-height:auto; margin:0; border:0; padding:0; box-shadow:none; } }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <div><strong>${escapeHtml(order.order_number)}</strong><span>Solicitacao pronta para imprimir ou salvar em PDF.</span></div>
      <button onclick="window.print()">Imprimir / salvar PDF</button>
    </div>
    <main>
      ${renderClinicDocumentHeader(branding, "Solicitacao de exames")}
      <section class="meta">
        <div><span>Pedido</span><strong>${escapeHtml(order.order_number)}</strong></div>
        <div><span>Emissao</span><strong>${escapeHtml(formatDate(order.created_at, true))}</strong></div>
        <div><span>Categoria</span><strong>${escapeHtml(categoryLabels[order.category] ?? order.category)}</strong></div>
        <div><span>Prioridade</span><strong>${escapeHtml(priorityLabels[order.priority] ?? order.priority)}</strong></div>
        <div><span>Paciente</span><strong>${escapeHtml(patient?.social_name || patient?.full_name || "Paciente")}</strong></div>
        <div><span>CPF</span><strong>${escapeHtml(patient?.cpf ?? "Nao informado")}</strong></div>
        <div><span>Telefone</span><strong>${escapeHtml(patient?.phone ?? "Nao informado")}</strong></div>
        <div><span>Profissional</span><strong>${escapeHtml(professional?.profile?.full_name ?? "Profissional")}</strong></div>
      </section>
      ${appointment ? `<p><strong>Atendimento relacionado:</strong> ${escapeHtml(appointment.appointment_type ?? "Atendimento")} em ${escapeHtml(formatDate(appointment.starts_at, true))}</p>` : ""}
      <h2>Indicacao clinica</h2>
      <p>${escapeHtml(order.clinical_indication ?? "Nao informada.")}</p>
      <h2>Preparo e orientacoes ao paciente</h2>
      <p>${escapeHtml(order.fasting_instructions ?? "Seguir orientacoes do laboratorio ou servico executor. Em caso de duvida, contatar a clinica antes da realizacao.")}</p>
      <h2>Exames solicitados</h2>
      <table>
        <thead><tr><th>#</th><th>Exame</th><th>Material/amostra</th><th>Codigo</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">Nenhum exame informado.</td></tr>'}</tbody>
      </table>
      <section class="signature">
        <div>Assinatura/carimbo do profissional</div>
        <div>Ciencia do paciente/responsavel</div>
      </section>
      ${renderClinicDocumentFooter(branding, `Pedido ${order.order_number}. Emissao e impressao rastreadas em auditoria.`)}
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
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const [{ orderId }, { activeClinic }, supabase] = await Promise.all([
    params,
    getActiveClinicContext(),
    createSupabaseServerClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !activeClinic) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  const access = await getDiagnosticsAccess(activeClinic.id);
  if (!access.canView || (!access.canExport && !access.canCreate && !access.canManage)) {
    return NextResponse.json({ error: "Acesso nao autorizado." }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: order } = await admin
    .from("diagnostic_orders")
    .select("id, order_number, status")
    .eq("id", orderId)
    .eq("clinic_id", activeClinic.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });

  const now = new Date().toISOString();
  await Promise.all([
    admin.from("diagnostic_orders").update({ request_printed_at: now, updated_by: user.id }).eq("id", order.id),
    admin.from("diagnostic_order_events").insert({
      clinic_id: activeClinic.id,
      order_id: order.id,
      event_type: "request_printed",
      previous_status: order.status,
      next_status: order.status,
      details: { order_number: order.order_number, source: "browser_afterprint" },
      created_by: user.id,
    }),
    logAuditEvent({
      clinicId: activeClinic.id,
      userId: user.id,
      actionType: "diagnostic_request_printed",
      module: "diagnostics",
      recordTable: "diagnostic_orders",
      recordId: order.id,
      level: "security",
      notes: "Solicitacao diagnostica impressa ou salva em PDF.",
    }),
  ]);

  return NextResponse.json({ ok: true });
}
