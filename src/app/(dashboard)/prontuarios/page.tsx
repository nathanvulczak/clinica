import Link from "next/link";
import { Activity, FileCheck2, History, LockKeyhole } from "lucide-react";
import { ACTIVE_CARE_STATUSES } from "@/config/clinical-workflow";
import { PageHeader } from "@/components/app/page-header";
import { RealtimeClinicSync } from "@/components/app/realtime-clinic-sync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { ClinicalQueue } from "@/features/clinical-workflow/components/clinical-queue";
import { MedicalLgpdAckCard } from "@/features/medical-records/components/medical-lgpd-ack-card";
import { medicalDocumentStatusLabel, medicalRecordStatusLabel } from "@/features/medical-records/labels";
import { MedicalRecordPreferencesForm } from "@/features/medical-records/components/medical-record-preferences-form";
import { PatientMedicalOverviewPanel } from "@/features/medical-records/components/patient-medical-overview-panel";
import {
  getClinicalWorkflowAccess,
  listClinicalEncounters,
} from "@/repositories/clinical-workflow";
import {
  getMedicalLgpdAcknowledgement,
  getMedicalRecordPreferences,
  getMedicalRecordReports,
  listMedicalRecords,
  listPatientMedicalOverviews,
} from "@/repositories/medical-records";
import { getClinicalFormTemplates } from "@/repositories/clinical-forms";

type MedicalRecordSection = "queue" | "records" | "patients" | "reports" | "preferences";

function normalizeSection(value?: string): MedicalRecordSection {
  return ["queue", "records", "patients", "reports", "preferences"].includes(value ?? "")
    ? (value as MedicalRecordSection)
    : "queue";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export default async function ProntuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const section = normalizeSection(params.section);
  const { activeClinic } = await getActiveClinicContext();
  const access = await getClinicalWorkflowAccess(activeClinic?.id);
  const canView = access.canViewAll || access.canViewOwn;
  const encounters =
    activeClinic && canView
      ? await listClinicalEncounters(activeClinic.id, { statuses: ACTIVE_CARE_STATUSES })
      : [];
  const records =
    activeClinic && canView && (section === "records" || section === "reports")
      ? await listMedicalRecords(activeClinic.id)
      : [];
  const reports =
    activeClinic && canView && section === "reports"
      ? await getMedicalRecordReports(activeClinic.id)
      : null;
  const preferences =
    activeClinic && canView && section === "preferences"
      ? await getMedicalRecordPreferences(activeClinic.id)
      : null;
  const clinicalFormTemplates =
    activeClinic && canView && section === "preferences"
      ? await getClinicalFormTemplates(activeClinic.id)
      : [];
  const patientOverviews =
    activeClinic && canView && section === "patients"
      ? await listPatientMedicalOverviews(activeClinic.id)
      : [];
  const lgpdAck = activeClinic && canView ? await getMedicalLgpdAcknowledgement(activeClinic.id) : null;

  const readyCount = encounters.filter((encounter) => encounter.status === "ready_for_consultation").length;
  const activeCount = encounters.filter(
    (encounter) => encounter.status === "consultation_in_progress",
  ).length;
  const completedCount = records.filter((record) => record.status === "completed").length;

  return (
    <>
      <PageHeader
        title="Prontuários"
        description="Evolução clínica, documentos, histórico por paciente e fechamento seguro do atendimento."
      />

      {!activeClinic ? (
        <Card>
          <CardHeader>
            <CardTitle>Clínica ativa necessária</CardTitle>
            <CardDescription>Selecione uma clínica para acessar os prontuários.</CardDescription>
          </CardHeader>
        </Card>
      ) : !canView ? (
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Seu perfil não possui acesso ao módulo de Prontuários.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
              <LockKeyhole className="size-5 text-primary" />
              Solicite a permissão de acesso ao prontuário ao responsável pela clínica.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5">
          <section className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex items-center gap-2 text-sm"><Activity className="size-4 text-primary" /><span className="font-medium">Operação clínica</span><span className="text-muted-foreground">dados restritos à clínica ativa</span></div>
            <RealtimeClinicSync clinicId={activeClinic.id} tables={["clinical_encounters"]} />
          </section>
          <MedicalLgpdAckCard acceptedAt={lgpdAck?.accepted_at} />
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border bg-card p-3.5">
              <div className="flex items-center justify-between"><p className="text-sm font-medium">Liberados</p><FileCheck2 className="size-4 text-emerald-600" /></div>
              <p className="mt-2 text-xl font-semibold tabular-nums">{readyCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Aguardando abertura do prontuário</p>
            </div>
            <div className="rounded-lg border bg-card p-3.5">
              <div className="flex items-center justify-between"><p className="text-sm font-medium">Em atendimento</p><Activity className="size-4 text-primary" /></div>
              <p className="mt-2 text-xl font-semibold tabular-nums">{activeCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Prontuários em andamento</p>
            </div>
            <div className="rounded-lg border bg-card p-3.5">
              <div className="flex items-center justify-between"><p className="text-sm font-medium">Concluídos</p><History className="size-4 text-muted-foreground" /></div>
              <p className="mt-2 text-xl font-semibold tabular-nums">{completedCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Registros clínicos fechados</p>
            </div>
          </div>

          {section === "queue" ? (
            <>
              <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <strong className="font-medium text-foreground">Fluxo:</strong> pacientes liberados
                pela Enfermagem ou atendimento direto aparecem aqui. Ao abrir a ficha, o atendimento
                inicia; ao finalizar, ele sai da fila operacional.
              </div>
              <ClinicalQueue encounters={encounters} access={access} mode="care" />
            </>
          ) : null}

          {section === "records" ? (
            <section className="overflow-hidden rounded-lg border bg-card">
              <div className="border-b px-4 py-3"><p className="text-sm font-medium">Registros clínicos</p><p className="mt-0.5 text-xs text-muted-foreground">Histórico por paciente, profissional e situação.</p></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-[13px]"><thead className="bg-muted/60 text-left text-[11px] uppercase text-muted-foreground"><tr><th className="min-w-56 px-3 py-2.5">Paciente</th><th className="min-w-48 px-3 py-2.5">Profissional</th><th className="w-40 px-3 py-2.5">Atualização</th><th className="w-28 px-3 py-2.5">Situação</th><th className="w-24 px-3 py-2.5 text-right">Ação</th></tr></thead><tbody>{records.length ? records.map((record) => <tr key={record.id} className="border-t"><td className="whitespace-normal break-words px-3 py-2.5 font-medium">{record.patient?.social_name || record.patient?.full_name || "Paciente"}</td><td className="whitespace-normal break-words px-3 py-2.5">{record.professional?.profile?.full_name || "Profissional"}</td><td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatDateTime(record.updated_at)}</td><td className="px-3 py-2.5"><Badge>{medicalRecordStatusLabel(record.status)}</Badge></td><td className="px-3 py-2.5 text-right"><Button asChild size="sm" variant="outline"><Link href={`/prontuarios/${record.encounter_id}`}>Abrir</Link></Button></td></tr>) : <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nenhum prontuário registrado ainda.</td></tr>}</tbody></table></div>
            </section>
          ) : null}

          {section === "patients" ? <PatientMedicalOverviewPanel overviews={patientOverviews} /> : null}

          {section === "reports" && reports ? (
            <div className="grid gap-4">
              <div className="grid gap-3 lg:grid-cols-5">
                {[
                  { label: "Prontuários", value: reports.totalRecords, hint: "registros no escopo" },
                  { label: "Concluídos", value: reports.completedRecords, hint: "fechados e protegidos" },
                  { label: "Cobertura", value: `${reports.averageFormCompletion}%`, hint: "média dos formulários" },
                  { label: "Exames", value: reports.recordsWithDiagnostics, hint: "pedidos vinculados" },
                  { label: "Correções", value: reports.correctionRequests, hint: "fluxo formal" },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border bg-card p-3">
                    <p className="text-[11px] font-medium uppercase text-muted-foreground">{item.label}</p>
                    <p className="mt-1.5 text-xl font-semibold tabular-nums">{item.value}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{item.hint}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
                <section className="overflow-hidden rounded-md border bg-card">
                  <div className="border-b px-4 py-3">
                    <p className="text-sm font-semibold">Performance por especialidade</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Visão para gestão clínica, qualidade de preenchimento e volume assistencial.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-[13px]">
                      <thead className="bg-muted/60 text-left text-[11px] uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2.5">Especialidade</th>
                          <th className="px-3 py-2.5 text-right">Prontuários</th>
                          <th className="px-3 py-2.5 text-right">Concluídos</th>
                          <th className="px-3 py-2.5 text-right">Formulário</th>
                          <th className="px-3 py-2.5 text-right">Exames</th>
                          <th className="px-3 py-2.5 text-right">Documentos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.specialtyPerformance.length ? reports.specialtyPerformance.map((item) => (
                          <tr key={item.specialty} className="border-t">
                            <td className="px-3 py-2.5 font-medium">{item.specialty}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{item.records}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{item.completed}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{item.averageFormCompletion}%</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{item.diagnostics}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{item.documents}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhuma especialidade com prontuário no período atual.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
                <Card>
                  <CardHeader>
                    <CardTitle>Status dos prontuários</CardTitle>
                    <CardDescription>Distribuição operacional da carteira clínica.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {reports.recordsByStatus.map((item) => (
                      <div key={item.status} className="flex justify-between rounded-md border bg-muted/20 p-3 text-sm">
                        <span>{medicalRecordStatusLabel(item.status)}</span>
                        <strong>{item.count}</strong>
                      </div>
                    ))}
                    {!reports.recordsByStatus.length ? <p className="text-sm text-muted-foreground">Sem registros para analisar.</p> : null}
                  </CardContent>
                </Card>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle>Por profissional</CardTitle>
                    <CardDescription>Volume de prontuários por responsável.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {reports.recordsByProfessional.map((item) => (
                      <div key={item.professional} className="flex justify-between rounded-md border bg-muted/20 p-3 text-sm">
                        <span>{item.professional}</span>
                        <strong>{item.count}</strong>
                      </div>
                    ))}
                    {!reports.recordsByProfessional.length ? <p className="text-sm text-muted-foreground">Nenhum profissional com prontuário.</p> : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Documentos clínicos</CardTitle>
                    <CardDescription>Histórico de emissão, exclusão e exportação.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {reports.documentsByStatus.length ? reports.documentsByStatus.map((item) => (
                      <div key={item.status} className="flex justify-between rounded-md border bg-muted/20 p-3 text-sm">
                        <span>{medicalDocumentStatusLabel(item.status)}</span>
                        <strong>{item.count}</strong>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">Nenhum documento clínico registrado.</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Qualidade assistencial</CardTitle>
                    <CardDescription>Indicadores rápidos para auditoria e melhoria contínua.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    <div className="flex justify-between rounded-md border bg-muted/20 p-3">
                      <span>Prontuários com formulário especializado</span>
                      <strong>{reports.recordsWithSpecialtyForm}</strong>
                    </div>
                    <div className="flex justify-between rounded-md border bg-muted/20 p-3">
                      <span>Rascunhos em aberto</span>
                      <strong>{reports.draftRecords}</strong>
                    </div>
                    <div className="flex justify-between rounded-md border bg-muted/20 p-3">
                      <span>Documentos excluídos auditáveis</span>
                      <strong>{reports.deletedDocuments}</strong>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}

          {section === "preferences" && preferences ? (
            <MedicalRecordPreferencesForm preferences={preferences} canEdit={access.canViewAll} templates={clinicalFormTemplates} />
          ) : null}
        </div>
      )}
    </>
  );
}
