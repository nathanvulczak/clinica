import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { ACTIVE_CARE_STATUSES } from "@/config/clinical-workflow";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { ClinicalQueue } from "@/features/clinical-workflow/components/clinical-queue";
import { MedicalLgpdAckCard } from "@/features/medical-records/components/medical-lgpd-ack-card";
import { medicalRecordStatusLabel } from "@/features/medical-records/labels";
import { MedicalRecordPreferencesForm } from "@/features/medical-records/components/medical-record-preferences-form";
import {
  MedicalRecordSectionNav,
  type MedicalRecordSection,
} from "@/features/medical-records/components/medical-record-section-nav";
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

function normalizeSection(value?: string): MedicalRecordSection {
  return ["queue", "records", "patients", "reports", "preferences"].includes(value ?? "")
    ? (value as MedicalRecordSection)
    : "queue";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Data nao informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
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
        title="Prontuarios"
        description="Evolucao clinica, documentos, comentarios por paciente e fechamento do atendimento."
      />

      {!activeClinic ? (
        <Card>
          <CardHeader>
            <CardTitle>Clinica ativa necessaria</CardTitle>
            <CardDescription>Selecione uma clinica para acessar os prontuarios.</CardDescription>
          </CardHeader>
        </Card>
      ) : !canView ? (
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Seu perfil nao possui acesso ao modulo de Prontuarios.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
              <LockKeyhole className="size-5 text-primary" />
              Solicite a permissao de acesso ao prontuario ao responsavel pela clinica.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5">
          <MedicalLgpdAckCard acceptedAt={lgpdAck?.accepted_at} />
          <MedicalRecordSectionNav activeSection={section} />

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm font-medium">Liberados para consulta</p>
              <p className="mt-1 text-xs text-muted-foreground">Aguardando abertura do prontuario</p>
              <p className="mt-3 text-2xl font-semibold">{readyCount}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm font-medium">Em atendimento</p>
              <p className="mt-1 text-xs text-muted-foreground">Prontuario em andamento</p>
              <p className="mt-3 text-2xl font-semibold">{activeCount}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm font-medium">Concluidos</p>
              <p className="mt-1 text-xs text-muted-foreground">Registros clinicos fechados</p>
              <p className="mt-3 text-2xl font-semibold">{completedCount}</p>
            </div>
          </div>

          {section === "queue" ? (
            <>
              <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                <strong className="font-medium text-foreground">Fluxo:</strong> pacientes liberados
                pela Enfermagem ou atendimento direto aparecem aqui. Ao abrir a ficha, o atendimento
                inicia; ao finalizar, ele sai da fila operacional.
              </div>
              <ClinicalQueue encounters={encounters} access={access} mode="care" />
            </>
          ) : null}

          {section === "records" ? (
            <div className="grid gap-3">
              {records.length ? (
                records.map((record) => (
                  <article key={record.id} className="rounded-lg border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {record.patient?.social_name || record.patient?.full_name || "Paciente"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {record.professional?.profile?.full_name || "Profissional"} |{" "}
                          {formatDateTime(record.updated_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge>{medicalRecordStatusLabel(record.status)}</Badge>
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/prontuarios/${record.encounter_id}`}>Abrir</Link>
                        </Button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
                  Nenhum prontuario registrado ainda.
                </div>
              )}
            </div>
          ) : null}

          {section === "patients" ? <PatientMedicalOverviewPanel overviews={patientOverviews} /> : null}

          {section === "reports" && reports ? (
            <div className="grid gap-4">
              <div className="grid gap-3 lg:grid-cols-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Prontuarios</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">{reports.totalRecords}</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Concluidos</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">{reports.completedRecords}</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Rascunhos</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">{reports.draftRecords}</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Documentos emitidos</CardTitle>
                  </CardHeader>
                  <CardContent className="text-2xl font-semibold">{reports.issuedDocuments}</CardContent>
                </Card>
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
