import { NextResponse } from "next/server";
import { getActiveClinicContext } from "@/features/clinics/context";
import {
  clinicalStatusLabel,
  medicalDocumentStatusLabel,
  medicalRecordStatusLabel,
} from "@/features/medical-records/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMedicalRecordEncounterDetail } from "@/repositories/medical-records";
import { logAuditEvent } from "@/services/audit/audit-service";
import {
  clinicDocumentCss,
  escapeDocumentHtml as escapeHtml,
  getClinicDocumentBranding,
  renderClinicDocumentFooter,
  renderClinicDocumentHeader,
} from "@/services/documents/clinic-document-branding";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Nao informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Nao informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function paragraph(value: string | number | null | undefined, fallback = "Nao informado") {
  return `<p>${escapeHtml(value ?? fallback)}</p>`;
}

function clinicalList(items: Array<string | null | undefined>) {
  const values = items.filter(Boolean);
  return values.length ? values.join(" | ") : "Nao informado";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ encounterId: string }> },
) {
  const { encounterId } = await context.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", _request.url));
  }

  const { activeClinic } = await getActiveClinicContext();
  if (!activeClinic) {
    return new NextResponse("Clinica ativa nao encontrada.", { status: 404 });
  }

  const detail = await getMedicalRecordEncounterDetail(activeClinic.id, encounterId);
  if (!detail) {
    return new NextResponse("Prontuario nao encontrado ou sem permissao de acesso.", { status: 404 });
  }
  const branding = await getClinicDocumentBranding(activeClinic.id, { embedLogo: true });

  await logAuditEvent({
    clinicId: activeClinic.id,
    userId: user.id,
    actionType: "medical_record_summary_viewed",
    module: "medical_records",
    recordTable: "clinical_encounters",
    recordId: detail.id,
    level: "security",
    notes: "Resumo clinico do prontuario visualizado para impressao/PDF.",
  });

  const patientName = detail.patient?.social_name || detail.patient?.full_name || "Paciente";
  const professionalName = detail.professional?.profile?.full_name || "Profissional nao informado";
  const registry = detail.professional_profile?.council_number
    ? [
        detail.professional_profile.council_type,
        detail.professional_profile.council_number,
        detail.professional_profile.council_state,
      ]
        .filter(Boolean)
        .join(" ")
    : "Registro profissional nao informado";
  const assessment = detail.nursing_assessment;
  const record = detail.medical_record;
  const vitals = assessment
    ? clinicalList([
        assessment.systolic_bp && assessment.diastolic_bp
          ? `PA ${assessment.systolic_bp}/${assessment.diastolic_bp} mmHg`
          : null,
        assessment.heart_rate ? `FC ${assessment.heart_rate} bpm` : null,
        assessment.respiratory_rate ? `FR ${assessment.respiratory_rate} irpm` : null,
        assessment.temperature_c ? `Temp. ${assessment.temperature_c} C` : null,
        assessment.oxygen_saturation ? `SpO2 ${assessment.oxygen_saturation}%` : null,
        assessment.capillary_glucose ? `HGT ${assessment.capillary_glucose} mg/dL` : null,
        assessment.weight_kg ? `Peso ${assessment.weight_kg} kg` : null,
        assessment.height_cm ? `Altura ${assessment.height_cm} cm` : null,
        assessment.bmi ? `IMC ${assessment.bmi}` : null,
      ])
    : "Pre-consulta nao registrada";

  const documents = detail.prescriptions
    .slice(0, 20)
    .map(
      (document) => `
        <article class="item">
          <strong>${escapeHtml(document.title)}</strong>
          <span>${escapeHtml(medicalDocumentStatusLabel(document.status))} - atualizado em ${escapeHtml(formatDateTime(document.updated_at))}</span>
          <pre>${escapeHtml(document.content)}</pre>
          ${
            document.deleted_reason
              ? `<em>Excluido do uso operacional. Motivo: ${escapeHtml(document.deleted_reason)}</em>`
              : ""
          }
        </article>
      `,
    )
    .join("");

  const timeline = detail.timeline
    .slice(0, 20)
    .map(
      (event) => `
        <li>
          <strong>${escapeHtml(formatDateTime(event.occurred_at))}</strong>
          <span>${escapeHtml(event.title)} - ${escapeHtml(event.description)}</span>
        </li>
      `,
    )
    .join("");

  const comments = detail.patient_comments
    .slice(0, 10)
    .map(
      (comment) => `
        <article class="item">
          <strong>${escapeHtml(comment.author?.full_name ?? "Profissional")}</strong>
          <span>${escapeHtml(formatDateTime(comment.created_at))}</span>
          ${paragraph(comment.comment)}
        </article>
      `,
    )
    .join("");

  const attachments = detail.attachments
    .slice(0, 20)
    .map(
      (attachment) => `
        <li>
          <strong>${escapeHtml(attachment.title)}</strong>
          <span>${escapeHtml(attachment.category)} - ${escapeHtml(attachment.file_name)}${
            attachment.status === "deleted" ? " - excluido do uso operacional" : ""
          }</span>
        </li>
      `,
    )
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Resumo clinico - ${escapeHtml(patientName)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      ${clinicDocumentCss}
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f8fafc;
        color: #111827;
        font-family: Arial, sans-serif;
        line-height: 1.5;
      }
      .toolbar {
        position: sticky;
        top: 0;
        z-index: 2;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 22px;
        border-bottom: 1px solid #e5e7eb;
        background: rgba(255,255,255,.95);
        backdrop-filter: blur(10px);
      }
      button {
        border: 0;
        border-radius: 6px;
        background: #111827;
        color: white;
        padding: 10px 14px;
        font-weight: 600;
        cursor: pointer;
      }
      main {
        width: min(980px, calc(100% - 32px));
        margin: 24px auto;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        background: white;
        padding: 28px;
      }
      h1 { margin: 0; font-size: 20px; }
      h2 { margin: 20px 0 8px; font-size: 13px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
      h3 { margin: 18px 0 8px; font-size: 14px; }
      .muted { color: #6b7280; font-size: 12px; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .box, .item {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 9px;
        background: #f9fafb;
      }
      .box span, .item span { display: block; color: #6b7280; font-size: 12px; margin-top: 2px; }
      p { margin: 4px 0 0; white-space: pre-wrap; }
      pre { margin: 8px 0 0; white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 12px; }
      ul { margin: 8px 0 0; padding-left: 18px; }
      li { margin-bottom: 8px; }
      .clinical-section { break-inside: avoid; }
      @media print {
        body { background: white; }
        .toolbar { display: none; }
        main { width: 100%; margin: 0; border: 0; border-radius: 0; padding: 0; }
        .box, .item { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <div>
        <strong>Resumo clinico para PDF</strong>
        <div class="muted">Revise as informacoes antes de imprimir ou salvar como PDF.</div>
      </div>
      <button type="button" onclick="window.print()">Imprimir / salvar PDF</button>
    </div>
    <main>
      ${renderClinicDocumentHeader(branding, "Resumo clínico do atendimento")}
      <div class="muted" style="margin-top:8px">Gerado em ${escapeHtml(formatDateTime(new Date().toISOString()))}. Código de verificação: ${escapeHtml(detail.id.slice(0, 8).toUpperCase())}</div>

      <h2>Identificacao</h2>
      <div class="grid">
        <div class="box"><strong>Paciente</strong><span>${escapeHtml(patientName)}</span></div>
        <div class="box"><strong>Nascimento</strong><span>${escapeHtml(formatDate(detail.patient?.birth_date))}</span></div>
        <div class="box"><strong>Telefone</strong><span>${escapeHtml(detail.patient?.phone ?? "Nao informado")}</span></div>
        <div class="box"><strong>E-mail</strong><span>${escapeHtml(detail.patient?.email ?? "Nao informado")}</span></div>
        <div class="box"><strong>Profissional</strong><span>${escapeHtml(professionalName)} - ${escapeHtml(registry)}</span></div>
        <div class="box"><strong>Atendimento</strong><span>${escapeHtml(formatDateTime(detail.appointment?.starts_at))}</span></div>
        <div class="box"><strong>Status do fluxo</strong><span>${escapeHtml(clinicalStatusLabel(detail.status))}</span></div>
        <div class="box"><strong>Status do prontuario</strong><span>${escapeHtml(medicalRecordStatusLabel(record?.status))}</span></div>
      </div>

      <h2>Alertas e contexto</h2>
      ${paragraph(detail.patient?.clinical_alerts, "Sem alertas clinicos cadastrados.")}

      <section class="clinical-section"><h2>Pré-consulta / Enfermagem</h2>
      <div class="grid">
        <div class="box"><strong>Conclusao</strong><span>${escapeHtml(formatDateTime(assessment?.completed_at))}</span></div>
        <div class="box"><strong>Risco</strong><span>${escapeHtml(assessment?.risk_level ?? "Nao informado")}</span></div>
        <div class="box"><strong>Queixa</strong><span>${escapeHtml(assessment?.chief_complaint ?? "Nao informada")}</span></div>
        <div class="box"><strong>Sinais vitais</strong><span>${escapeHtml(vitals)}</span></div>
      </div>
      <h3>Alergias, medicacoes e antecedentes</h3>
      ${paragraph(clinicalList([assessment?.allergies, assessment?.current_medications, assessment?.comorbidities]))}
      <h3>Observacoes da enfermagem</h3>
      ${paragraph(assessment?.nursing_notes)}
      <h3>Recomendacoes da enfermagem</h3>
      ${paragraph(assessment?.recommendations, "Sem recomendações registradas.")}</section>

      <section class="clinical-section"><h2>Evolução clínica estruturada (SOAP)</h2>
      <h3>S - Subjetivo: queixa e história clínica</h3>${paragraph(clinicalList([record?.chief_complaint, record?.history]))}
      <h3>O - Objetivo: exame físico e achados</h3>${paragraph(record?.physical_exam)}
      <h3>A - Avaliação / hipótese</h3>${paragraph(record?.assessment)}
      <div class="grid">
        <div class="box"><strong>Diagnostico</strong><span>${escapeHtml(record?.diagnosis ?? "Nao informado")}</span></div>
        <div class="box"><strong>CID-10</strong><span>${escapeHtml(record?.cid10 ?? "Nao informado")}</span></div>
      </div>
      <h3>P - Plano terapêutico / conduta</h3>${paragraph(record?.plan)}
      <h3>Orientações ao paciente</h3>${paragraph(record?.patient_guidance)}
      <h3>Retorno</h3>${paragraph(record?.follow_up_required ? record.follow_up_notes ?? "Retorno solicitado." : "Retorno não solicitado.")}</section>

      <h2>Documentos e receitas</h2>
      ${documents || '<p class="muted">Nenhum documento registrado.</p>'}

      <h2>Anexos e exames</h2>
      ${attachments ? `<ul>${attachments}</ul>` : '<p class="muted">Nenhum anexo registrado.</p>'}

      <h2>Comentarios clinicos</h2>
      ${comments || '<p class="muted">Nenhum comentario clinico registrado.</p>'}

      <h2>Linha do tempo resumida</h2>
      ${timeline ? `<ul>${timeline}</ul>` : '<p class="muted">Nenhum evento registrado.</p>'}

      ${renderClinicDocumentFooter(branding, "Documento clínico. O acesso foi registrado em auditoria com usuário, data e contexto da clínica.")}
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
