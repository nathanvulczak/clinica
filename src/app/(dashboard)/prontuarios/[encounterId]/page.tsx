import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ClipboardCheck, LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { MedicalRecordForm } from "@/features/medical-records/components/medical-record-form";
import { getClinicalWorkflowAccess } from "@/repositories/clinical-workflow";
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
        <PageHeader title="Prontuario" description="Ficha clinica do atendimento." />
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Seu perfil nao possui acesso ao modulo de Prontuarios.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
              <LockKeyhole className="size-5 text-primary" />
              Solicite a liberacao de acesso ao prontuario ao responsavel pela clinica.
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  const [detail, preferences] = await Promise.all([
    getMedicalRecordEncounterDetail(activeClinic.id, encounterId),
    getMedicalRecordPreferences(activeClinic.id),
  ]);

  if (!detail) notFound();

  return (
    <>
      <PageHeader
        title="Prontuario do atendimento"
        description="Evolucao medica, conduta, prescricoes e fechamento da consulta."
        action={
          <Button asChild variant="outline">
            <Link href="/prontuarios">
              <ArrowLeft />
              Voltar aos prontuarios
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5">
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-medium">Registro clinico auditavel</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Salve rascunhos durante a consulta. Ao finalizar, o atendimento sera concluido e
              ficara pronto para os proximos fluxos administrativos e financeiros.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="size-4 text-primary" />
            Auditoria ativa
          </div>
        </div>

        {detail.status === "consultation_completed" ? (
          <Card>
            <CardHeader>
              <CardTitle>Consulta concluida</CardTitle>
              <CardDescription>
                Correcoes continuam disponiveis conforme permissao e preferencias da clinica, com
                motivo registrado em auditoria.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <MedicalRecordForm detail={detail} preferences={preferences} />
      </div>
    </>
  );
}
