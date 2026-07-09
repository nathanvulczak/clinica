"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Clock3,
  ExternalLink,
  Mail,
  MessageSquarePlus,
  Phone,
  Search,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  addPatientClinicalCommentAction,
  type MedicalRecordActionState,
} from "@/features/medical-records/actions";
import { medicalRecordStatusLabel } from "@/features/medical-records/labels";
import { formatCpf, formatPhone } from "@/lib/formatters";
import type { PatientMedicalOverview } from "@/repositories/medical-records";

const VIEW_STORAGE_KEY = "clinicore.medical-records.patient-view";

function formatDate(value: string | null | undefined, withTime = true) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(withTime ? { timeStyle: "short" as const } : {}),
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function ageFromBirthDate(value?: string | null) {
  if (!value) return "Idade não informada";
  const birth = new Date(`${value}T12:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return `${age} anos`;
}

function PatientCommentForm({ overview }: { overview: PatientMedicalOverview }) {
  const latestRecord = overview.records[0];
  const [state, formAction, pending] = useActionState<MedicalRecordActionState, FormData>(
    addPatientClinicalCommentAction,
    {},
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: "Comentário não salvo", description: state.error, variant: "destructive" });
    if (state.success) toast({ title: "Comentário clínico", description: state.success });
  }, [state.error, state.success, toast]);

  return (
    <form action={formAction} className="grid gap-3 border-t pt-4">
      <input type="hidden" name="patient_id" value={latestRecord.patient_id} />
      <input type="hidden" name="encounter_id" value={latestRecord.encounter_id} />
      <input type="hidden" name="medical_record_id" value={latestRecord.id} />
      <div className="grid gap-2 lg:grid-cols-[1fr_150px_auto] lg:items-end">
        <label className="grid gap-1.5 text-xs font-medium">
          Nota clínica interna
          <textarea name="comment" placeholder="Registre uma observação relevante para a continuidade assistencial..." className="min-h-16 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <label className="grid gap-1.5 text-xs font-medium">Visibilidade<Select name="visibility" defaultValue="clinical"><option value="clinical">Equipe clínica</option><option value="private">Privado</option></Select></label>
        <Button size="sm" disabled={pending}><MessageSquarePlus />{pending ? "Salvando..." : "Adicionar nota"}</Button>
      </div>
    </form>
  );
}

function PatientSummarySheet({ overview }: { overview: PatientMedicalOverview }) {
  const patient = overview.patient;
  const latestRecord = overview.records[0];
  const assessment = overview.nursing_assessments[0];
  const diagnoses = overview.records.filter((record) => record.diagnosis || record.cid10).slice(0, 6);
  const recentDiagnostics = overview.diagnostic_results.slice(0, 6);
  const vitals = assessment
    ? [
        assessment.systolic_bp && assessment.diastolic_bp ? `PA ${assessment.systolic_bp}/${assessment.diastolic_bp} mmHg` : null,
        assessment.heart_rate ? `FC ${assessment.heart_rate} bpm` : null,
        assessment.temperature_c ? `Temp. ${assessment.temperature_c} °C` : null,
        assessment.oxygen_saturation ? `SpO2 ${assessment.oxygen_saturation}%` : null,
        assessment.weight_kg ? `Peso ${assessment.weight_kg} kg` : null,
        assessment.bmi ? `IMC ${assessment.bmi}` : null,
      ].filter(Boolean).join(" · ")
    : "Sem triagem registrada";

  return (
    <div className="rounded-md border bg-muted/25 p-4">
      <article className="selectable mx-auto min-h-[620px] max-w-[820px] bg-white px-10 py-8 text-slate-900 shadow-[0_8px_24px_rgb(15_23_42/0.07)]">
        <header className="flex items-start justify-between gap-4 border-b-2 border-primary pb-4">
          <div><p className="text-[11px] font-semibold uppercase text-primary">Resumo longitudinal</p><h2 className="mt-1 text-lg font-semibold">{patient?.social_name || patient?.full_name}</h2><p className="mt-1 text-xs text-slate-500">Atualizado em {formatDate(latestRecord.updated_at)}</p></div>
          <div className="text-right text-xs text-slate-500"><p>{ageFromBirthDate(patient?.birth_date)}</p><p>{patient?.cpf ? formatCpf(patient.cpf) : "CPF não informado"}</p></div>
        </header>
        {patient?.clinical_alerts ? <div className="mt-4 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"><strong>Alerta clínico:</strong> {patient.clinical_alerts}</div> : null}
        <section className="mt-5"><h3 className="border-l-2 border-primary bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase">Situação assistencial</h3><div className="mt-2 grid grid-cols-4 border-l border-t text-xs"><div className="border-b border-r p-2"><span className="block text-[9px] uppercase text-slate-500">Prontuários</span><strong>{overview.records.length}</strong></div><div className="border-b border-r p-2"><span className="block text-[9px] uppercase text-slate-500">Exames</span><strong>{overview.diagnostic_count}</strong></div><div className="border-b border-r p-2"><span className="block text-[9px] uppercase text-slate-500">Documentos</span><strong>{overview.document_count}</strong></div><div className="border-b border-r p-2"><span className="block text-[9px] uppercase text-slate-500">Último status</span><strong>{medicalRecordStatusLabel(latestRecord.status)}</strong></div></div></section>
        <section className="mt-5"><h3 className="border-l-2 border-primary bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase">Última triagem</h3><p className="mt-2 border px-3 py-2 text-xs leading-5">{vitals}</p></section>
        <section className="mt-5"><h3 className="border-l-2 border-primary bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase">Diagnósticos registrados</h3>{diagnoses.length ? <div className="mt-2 divide-y border">{diagnoses.map((record) => <div key={record.id} className="grid grid-cols-[100px_1fr_auto] gap-3 px-3 py-2 text-xs"><span>{record.cid10 || "Sem CID"}</span><span>{record.diagnosis}</span><span className="text-slate-500">{formatDate(record.completed_at || record.updated_at, false)}</span></div>)}</div> : <p className="mt-2 border px-3 py-2 text-xs text-slate-500">Nenhum diagnóstico estruturado registrado.</p>}</section>
        <section className="mt-5"><h3 className="border-l-2 border-primary bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase">Resultados diagnósticos recentes</h3>{recentDiagnostics.length ? <div className="mt-2 divide-y border">{recentDiagnostics.map((result) => <div key={result.id} className="grid grid-cols-[1fr_120px_auto] gap-3 px-3 py-2 text-xs"><span>{result.exam_name}</span><span>{result.value_numeric !== null ? `${result.value_numeric} ${result.unit ?? ""}` : result.value_text ?? "Resultado textual"}</span><span className="text-slate-500">{formatDate(result.resulted_at, false)}</span></div>)}</div> : <p className="mt-2 border px-3 py-2 text-xs text-slate-500">Nenhum resultado diagnóstico registrado.</p>}</section>
        <section className="mt-5"><h3 className="border-l-2 border-primary bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase">Última conduta</h3><p className="mt-2 min-h-16 whitespace-pre-wrap border px-3 py-2 text-xs leading-5">{latestRecord.plan || "Não informada"}</p></section>
      </article>
    </div>
  );
}

export function PatientMedicalOverviewPanel({ overviews }: { overviews: PatientMedicalOverview[] }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(overviews[0]?.patient?.id ?? "");
  const [view, setView] = useState<"timeline" | "summary">("timeline");

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "summary" || stored === "timeline") setView(stored);
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return overviews;
    return overviews.filter((overview) => [overview.patient?.full_name, overview.patient?.social_name, overview.patient?.cpf, overview.patient?.phone].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
  }, [overviews, search]);
  const selected = overviews.find((overview) => overview.patient?.id === selectedId) ?? filtered[0] ?? overviews[0];

  if (!overviews.length || !selected) return <div className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">Nenhum paciente com prontuário registrado ainda.</div>;

  const patient = selected.patient;
  const latestRecord = selected.records[0];
  const timeline = [
    ...selected.records.map((record) => ({ id: `record-${record.id}`, date: record.completed_at || record.updated_at, title: "Atendimento clínico", description: `${record.diagnosis || "Evolução registrada"}${record.cid10 ? ` · CID ${record.cid10}` : ""}`, tone: "care" })),
    ...selected.nursing_assessments.map((item) => ({ id: `nursing-${item.id}`, date: item.completed_at || item.created_at, title: "Pré-consulta de Enfermagem", description: `Classificação ${item.risk_level} · ${item.bmi ? `IMC ${item.bmi}` : "medidas registradas"}`, tone: "nursing" })),
    ...selected.diagnostic_results.map((result) => ({ id: `diagnostic-${result.id}`, date: result.resulted_at, title: "Resultado de exame", description: `${result.exam_name}: ${result.value_numeric !== null ? `${result.value_numeric} ${result.unit ?? ""}` : result.value_text ?? "resultado textual"}${result.flag !== "normal" ? ` · ${result.flag}` : ""}`, tone: result.flag === "critical" ? "warning" : "diagnostic" })),
    ...selected.comments.map((comment) => ({ id: `comment-${comment.id}`, date: comment.created_at, title: "Nota clínica", description: comment.comment, tone: "note" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  function changeView(next: "timeline" | "summary") {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  }

  return (
    <div className="grid min-h-[680px] overflow-hidden rounded-lg border bg-card lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="border-r bg-muted/10">
        <div className="border-b p-3"><label className="relative block"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, CPF ou telefone" className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label><p className="mt-2 text-[11px] text-muted-foreground">{filtered.length} paciente(s) no seu escopo clínico</p></div>
        <div className="max-h-[620px] overflow-y-auto p-1.5">{filtered.map((overview) => { const item = overview.patient; const active = item?.id === selected.patient?.id; return <button key={item?.id ?? overview.records[0].patient_id} type="button" onClick={() => setSelectedId(item?.id ?? overview.records[0].patient_id)} className={`mb-1 w-full rounded-md px-3 py-2.5 text-left transition-colors duration-150 ${active ? "bg-primary/10 text-foreground" : "hover:bg-muted/50"}`}><div className="flex items-center gap-2"><span className={`grid size-7 shrink-0 place-items-center rounded-md ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><UserRound className="size-3.5" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{item?.social_name || item?.full_name}</span><span className="block truncate text-[11px] text-muted-foreground">{overview.records.length} atendimento(s) · {formatDate(overview.records[0].updated_at, false)}</span></span></div></button>; })}</div>
      </aside>

      <section className="min-w-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-[17px] font-semibold">{patient?.social_name || patient?.full_name}</h2><span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{ageFromBirthDate(patient?.birth_date)}</span></div><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{patient?.phone ? <span className="flex items-center gap-1"><Phone className="size-3" />{formatPhone(patient.phone)}</span> : null}{patient?.email ? <span className="flex items-center gap-1"><Mail className="size-3" />{patient.email}</span> : null}</div></div>
          <div className="flex items-center gap-2"><div className="flex rounded-md border bg-muted/20 p-0.5"><button type="button" onClick={() => changeView("timeline")} className={`h-8 rounded px-3 text-xs font-medium ${view === "timeline" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Linha do tempo</button><button type="button" onClick={() => changeView("summary")} className={`h-8 rounded px-3 text-xs font-medium ${view === "summary" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Resumo clínico</button></div><Button asChild size="sm" variant="outline"><a href={`/api/prontuarios/${latestRecord.encounter_id}/resumo`} target="_blank" rel="noreferrer"><ExternalLink />PDF completo</a></Button></div>
        </header>

        <div className="grid grid-cols-5 border-b bg-muted/10"><div className="px-4 py-2.5"><p className="text-[10px] uppercase text-muted-foreground">Atendimentos</p><p className="mt-1 text-lg font-semibold tabular-nums">{selected.records.length}</p></div><div className="border-l px-4 py-2.5"><p className="text-[10px] uppercase text-muted-foreground">Triagens</p><p className="mt-1 text-lg font-semibold tabular-nums">{selected.nursing_assessments.length}</p></div><div className="border-l px-4 py-2.5"><p className="text-[10px] uppercase text-muted-foreground">Exames</p><p className="mt-1 text-lg font-semibold tabular-nums">{selected.diagnostic_count}</p></div><div className="border-l px-4 py-2.5"><p className="text-[10px] uppercase text-muted-foreground">Documentos</p><p className="mt-1 text-lg font-semibold tabular-nums">{selected.document_count}</p></div><div className="border-l px-4 py-2.5"><p className="text-[10px] uppercase text-muted-foreground">Arquivos</p><p className="mt-1 text-lg font-semibold tabular-nums">{selected.attachment_count}</p></div></div>
        {patient?.clinical_alerts ? <div className="mx-4 mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="size-4 shrink-0" /><span className="selectable">{patient.clinical_alerts}</span></div> : null}

        <div className="p-4">
          {view === "summary" ? <PatientSummarySheet overview={selected} /> : (
            <div className="grid gap-4">
              <section><div className="mb-3 flex items-center gap-2"><Clock3 className="size-4 text-primary" /><h3 className="text-sm font-semibold">Linha do tempo longitudinal</h3></div><div className="grid gap-0">{timeline.slice(0, 30).map((event, index) => <div key={event.id} className="grid grid-cols-[20px_1fr] gap-3"><div className="relative flex justify-center"><span className={`mt-1 size-2.5 rounded-full ${event.tone === "nursing" ? "bg-sky-500" : event.tone === "note" ? "bg-amber-500" : event.tone === "warning" ? "bg-destructive" : event.tone === "diagnostic" ? "bg-violet-500" : "bg-primary"}`} />{index < Math.min(timeline.length, 30) - 1 ? <span className="absolute top-4 h-full w-px bg-border" /> : null}</div><div className="pb-3"><div className="rounded-md border bg-background px-3 py-2"><div className="flex justify-between gap-3"><p className="text-sm font-medium">{event.title}</p><span className="text-[11px] text-muted-foreground">{formatDate(event.date)}</span></div><p className="selectable mt-1 text-xs leading-5 text-muted-foreground">{event.description}</p></div></div></div>)}</div></section>
              <section className="overflow-hidden rounded-md border"><div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2"><Activity className="size-4 text-primary" /><h3 className="text-sm font-semibold">Histórico de atendimentos</h3></div><div className="overflow-x-auto"><table className="min-w-[720px] text-[13px]"><thead><tr><th>Data</th><th>Profissional</th><th>Diagnóstico</th><th>Status</th><th className="text-right">Ação</th></tr></thead><tbody>{selected.records.map((record) => <tr key={record.id} className="border-t"><td>{formatDate(record.completed_at || record.updated_at)}</td><td>{record.professional?.profile?.full_name || "Profissional"}</td><td>{record.diagnosis || "Não informado"}{record.cid10 ? <span className="ml-1 text-xs text-muted-foreground">({record.cid10})</span> : null}</td><td>{medicalRecordStatusLabel(record.status)}</td><td className="text-right"><Button asChild size="sm" variant="ghost"><Link href={`/prontuarios/${record.encounter_id}`}>Abrir</Link></Button></td></tr>)}</tbody></table></div></section>
            </div>
          )}
          <div className="mt-4"><PatientCommentForm overview={selected} /></div>
        </div>
      </section>
    </div>
  );
}
