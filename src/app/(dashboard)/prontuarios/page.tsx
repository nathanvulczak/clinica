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
import { medicalRecordStatusLabel } from "@/features/medical-records/labels";
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
            <RealtimeClinicSync clinicId={activeClinic.id} tables={["clinical_encounters"]} visible />
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
              <div className="grid gap-3 lg:grid-cols-4">
                {[{ label: "Prontuários", value: reports.totalRecords }, { label: "Concluídos", value: reports.completedRecords }, { label: "Rascunhos", value: reports.draftRecords }, { label: "Documentos emitidos", value: reports.issuedDocuments }].map((item) => <div key={item.label} className="rounded-lg border bg-card p-3.5"><p className="text-xs font-medium text-muted-foreground">{item.label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{item.value}</p></div>)}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Status dos prontuarios</CardTitle>
                    <CardDescription>Distribuicao operacional da carteira clinica.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {reports.recordsByStatus.map((item) => (
                      <div key={item.status} className="flex justify-between rounded-md border bg-muted/20 p-3 text-sm">
                        <span>{medicalRecordStatusLabel(item.status)}</span>
                        <strong>{item.count}</strong>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Por profissional</CardTitle>
                    <CardDescription>Volume de prontuarios por responsavel.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    {reports.recordsByProfessional.map((item) => (
                      <div key={item.professional} className="flex justify-between rounded-md border bg-muted/20 p-3 text-sm">
                        <span>{item.professional}</span>
                        <strong>{item.count}</strong>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}

          {section === "preferences" && preferences ? (
            <MedicalRecordPreferencesForm preferences={preferences} canEdit={access.canViewAll} />
          ) : null}
        </div>
      )}
    </>
  );
}
