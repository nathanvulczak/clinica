import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Eye, LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { RealtimeClinicSync } from "@/components/app/realtime-clinic-sync";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { InventoryConsumptionPanel } from "@/features/inventory/components/inventory-consumption-panel";
import { MedicalRecordForm } from "@/features/medical-records/components/medical-record-form";
import { getClinicalWorkflowAccess } from "@/repositories/clinical-workflow";
import { getInventoryCareConsumption } from "@/repositories/inventory";
import { getEncounterClinicalFormWorkspace } from "@/repositories/clinical-forms";
import { getEncounterDiagnosticSummary } from "@/repositories/diagnostics";
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

  const [detail, preferences, documentBranding, inventoryCare, clinicalFormWorkspace, diagnosticSummary] = await Promise.all([
    getMedicalRecordEncounterDetail(activeClinic.id, encounterId),
    getMedicalRecordPreferences(activeClinic.id),
    getClinicDocumentBranding(activeClinic.id),
    getInventoryCareConsumption(activeClinic.id, encounterId),
    getEncounterClinicalFormWorkspace(activeClinic.id, encounterId),
    getEncounterDiagnosticSummary(activeClinic.id, encounterId),
  ]);

  if (!detail) notFound();

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

      <div className="grid gap-5">
        <div className="grid gap-3 rounded-lg border bg-muted/20 px-4 py-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-medium">Registro clínico auditável</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Salve rascunhos durante a consulta. Ao finalizar, o atendimento será concluído e
              seguirá para os próximos fluxos administrativos e financeiros.
            </p>
          </div>
          <div className="grid justify-items-end gap-1.5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ClipboardCheck className="size-4 text-primary" />Auditoria ativa</div><RealtimeClinicSync clinicId={activeClinic.id} tables={["clinical_encounters"]} /></div>
        </div>

        {detail.status === "consultation_completed" ? (
          <section className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3"><p className="text-sm font-medium text-emerald-900">Consulta concluída</p><p className="mt-1 text-sm text-emerald-800">Correções permanecem disponíveis conforme permissão, sempre com motivo e auditoria.</p></section>
        ) : null}

        <MedicalRecordForm detail={detail} preferences={preferences} documentBranding={documentBranding} clinicalFormWorkspace={clinicalFormWorkspace} diagnosticSummary={diagnosticSummary} />
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
