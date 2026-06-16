import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ClipboardCheck, LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { NursingAssessmentForm } from "@/features/nursing/components/nursing-assessment-form";
import { getClinicalWorkflowAccess } from "@/repositories/clinical-workflow";
import { getNursingEncounterDetail, getNursingPreferences } from "@/repositories/nursing";

export default async function NursingAssessmentPage({
  params,
}: {
  params: Promise<{ encounterId: string }>;
}) {
  const { encounterId } = await params;
  const { activeClinic } = await getActiveClinicContext();

  if (!activeClinic) redirect("/dashboard?clinic=required");

  const access = await getClinicalWorkflowAccess(activeClinic.id);
  if (!access.canViewNursing && !access.canViewAll) {
    return (
      <>
        <PageHeader
          title="Pré-consulta"
          description="Ficha assistencial da Enfermagem."
        />
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Seu perfil não possui acesso ao módulo de Enfermagem.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
              <LockKeyhole className="size-5 text-primary" />
              Solicite a liberação do módulo ao responsável pela clínica.
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const [detail, preferences] = await Promise.all([
    getNursingEncounterDetail(activeClinic.id, encounterId),
    getNursingPreferences(activeClinic.id),
  ]);
  if (!detail) notFound();

  const canEdit =
    access.canOperateNursing &&
    ["waiting_triage", "triage_in_progress", "ready_for_consultation"].includes(detail.status);

  return (
    <>
      <PageHeader
        title="Pré-consulta de Enfermagem"
        description="Registre sinais vitais, queixa principal e observações que apoiarão a consulta."
        action={
          <Button asChild variant="outline">
            <Link href="/enfermagem">
              <ArrowLeft />
              Voltar à fila
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5">
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-medium">Fluxo seguro</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Salve rascunhos durante a coleta. Ao encerrar, o paciente será liberado para
              Atendimentos e a ficha ficará vinculada à consulta.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="size-4 text-primary" />
            Auditoria ativa
          </div>
        </div>

        {!canEdit ? (
          <Card>
            <CardHeader>
              <CardTitle>Ficha somente leitura</CardTitle>
              <CardDescription>
                Esta pré-consulta já saiu da etapa operacional de enfermagem. Correções continuam
                disponíveis para usuários autorizados quando houver motivo registrado.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <NursingAssessmentForm detail={detail} preferences={preferences} />
      </div>
    </>
  );
}
