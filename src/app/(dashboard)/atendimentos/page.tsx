import { LockKeyhole, Stethoscope } from "lucide-react";
import { ACTIVE_CARE_STATUSES } from "@/config/clinical-workflow";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { ClinicalQueue } from "@/features/clinical-workflow/components/clinical-queue";
import {
  getClinicalWorkflowAccess,
  listClinicalEncounters,
} from "@/repositories/clinical-workflow";

export default async function AtendimentosPage() {
  const { activeClinic } = await getActiveClinicContext();
  const access = await getClinicalWorkflowAccess(activeClinic?.id);
  const canView = access.canViewAll || access.canViewOwn;
  const encounters =
    activeClinic && canView
      ? await listClinicalEncounters(activeClinic.id, { statuses: ACTIVE_CARE_STATUSES })
      : [];

  return (
    <>
      <PageHeader
        title="Atendimentos"
        description="Fila assistencial da chegada ao atendimento, respeitando profissional responsável e permissões."
      />

      {!activeClinic ? (
        <Card>
          <CardHeader>
            <CardTitle>Clínica ativa necessária</CardTitle>
            <CardDescription>Selecione uma clínica para acessar os atendimentos.</CardDescription>
          </CardHeader>
        </Card>
      ) : !canView ? (
        <Card>
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
            <CardDescription>Seu perfil não possui acesso ao fluxo de atendimentos.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
              <LockKeyhole className="size-5 text-primary" />
              Solicite a permissão sensível de acesso ao prontuário.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5">
          <div className="flex items-center gap-3 border-b pb-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Stethoscope className="size-5" />
            </div>
            <div>
              <p className="font-medium">Fila da clínica</p>
              <p className="text-sm text-muted-foreground">{activeClinic.trade_name}</p>
            </div>
          </div>
          <ClinicalQueue encounters={encounters} access={access} mode="care" />
        </div>
      )}
    </>
  );
}
