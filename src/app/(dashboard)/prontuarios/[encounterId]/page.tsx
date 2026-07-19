import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye, LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { RealtimeClinicSync } from "@/components/app/realtime-clinic-sync";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { InventoryConsumptionPanel } from "@/features/inventory/components/inventory-consumption-panel";
import { MedicalRecordForm } from "@/features/medical-records/components/medical-record-form";
import { getEncounterClinicalProtocolRun } from "@/repositories/clinical-protocols";
import { getClinicalWorkflowAccess } from "@/repositories/clinical-workflow";
import { getInventoryCareConsumption } from "@/repositories/inventory";
import { getEncounterClinicalFormWorkspace } from "@/repositories/clinical-forms";
import { getEncounterDiagnosticSummary } from "@/repositories/diagnostics";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import { logAuditEvent } from "@/services/audit/audit-service";
import { getClinicDocumentBranding } from "@/services/documents/clinic-document-branding";
import {
  getMedicalRecordEncounterDetail,
  getMedicalRecordPreferences,
} from "@/repositories/medical-records";

export default async function MedicalRecordPage({
  params,
}: {
  params: Promise<{ encounterId: string }>;
}) {
  const { encounterId } = await params;
  const { activeClinic } = await getActiveClinicContext();

  if (!activeClinic) redirect("/dashboard?clinic=required");

  const access = await getClinicalWorkflowAccess(activeClinic.id);
  if (!access.canViewAll && !access.canViewOwn) {
    return (
      <>
        <PageHeader title="Prontuário" description="Ficha clínica do atendimento." />
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Seu perfil não possui acesso ao módulo de Prontuários.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
              <LockKeyhole className="size-5 text-primary" />
              Solicite a liberação de acesso ao prontuário ao responsável pela clínica.
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const [detail, preferences, documentBranding, inventoryCare, clinicalFormWorkspace, diagnosticSummary, protocolRun] = await Promise.all([
    getMedicalRecordEncounterDetail(activeClinic.id, encounterId),
    getMedicalRecordPreferences(activeClinic.id),
    getClinicDocumentBranding(activeClinic.id),
    getInventoryCareConsumption(activeClinic.id, encounterId),
    getEncounterClinicalFormWorkspace(activeClinic.id, encounterId),
    getEncounterDiagnosticSummary(activeClinic.id, encounterId),
    getEncounterClinicalProtocolRun(activeClinic.id, encounterId),
  ]);

  if (!detail) notFound();

  const authorization = await getClinicAuthorization(activeClinic.id);
  if (authorization.userId) {
    await logAuditEvent({
      clinicId: activeClinic.id,
      userId: authorization.userId,
      actionType: "medical_record_viewed",
      module: "medical_records",
      recordTable: detail.medical_record ? "medical_records" : "clinical_encounters",
      recordId: detail.medical_record?.id ?? detail.id,
      newValues: {
        encounter_id: detail.id,
        patient_id: detail.patient_id,
        encounter_status: detail.status,
      },
      level: "security",
      notes: "Prontuário do atendimento aberto para consulta clínica autorizada.",
    });
  }

  return (
    <>
      <PageHeader
        title="Prontuário do atendimento"
        description="Evolução clínica, conduta, prescrições e fechamento da consulta."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/prontuarios">
                <ArrowLeft />
                Voltar aos prontuários
              </Link>
            </Button>
            <Button asChild>
              <a
                href={`/api/prontuarios/${detail.id}/resumo`}
                target="_blank"
                rel="noreferrer"
              >
                <Eye />
                Visualizar PDF
              </a>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4">
        <RealtimeClinicSync clinicId={activeClinic.id} tables={["clinical_encounters"]} />
        <MedicalRecordForm detail={detail} preferences={preferences} documentBranding={documentBranding} clinicalFormWorkspace={clinicalFormWorkspace} diagnosticSummary={diagnosticSummary} protocolRun={protocolRun} />
        <InventoryConsumptionPanel
          items={inventoryCare.items}
          locations={inventoryCare.locations}
          batches={inventoryCare.batches}
          movements={inventoryCare.movements}
          encounterId={detail.id}
          medicalRecordId={detail.medical_record?.id}
        />
      </div>
    </>
  );
}
