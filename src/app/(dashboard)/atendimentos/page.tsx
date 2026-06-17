import { LockKeyhole, Stethoscope } from "lucide-react";
import { ACTIVE_CARE_STATUSES } from "@/config/clinical-workflow";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { ClinicalQueue } from "@/features/clinical-workflow/components/clinical-queue";
import { PendingEncounterChargesPanel } from "@/features/financial/components/financial-workspace";
import {
  getClinicalWorkflowAccess,
  listClinicalEncounters,
} from "@/repositories/clinical-workflow";
import { getFinancialWorkspace } from "@/repositories/financial";
import { getRegistrationPreferences } from "@/repositories/registrations";

export default async function AtendimentosPage() {
  const { activeClinic } = await getActiveClinicContext();
  const access = await getClinicalWorkflowAccess(activeClinic?.id);
  const canView = access.canViewAll || access.canViewOwn;
  const [encounters, preferences, financialData] =
    activeClinic && canView
      ? await Promise.all([
          listClinicalEncounters(activeClinic.id, { statuses: ACTIVE_CARE_STATUSES }),
          getRegistrationPreferences(activeClinic.id),
          getFinancialWorkspace(activeClinic.id),
        ])
      : [[], null, null];

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
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-medium">Fluxo assistencial configurado</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Chegada →{" "}
                {preferences?.preconsultation_mode === "required"
                  ? "pré-consulta obrigatória"
                  : preferences?.preconsultation_mode === "disabled"
                    ? "atendimento direto"
                    : "decisão na chegada"}{" "}
                → consulta → conclusão.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Serviços podem substituir a regra padrão da clínica.
            </p>
          </div>
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
          {financialData?.pendingEncounterCharges.length ? (
            <PendingEncounterChargesPanel data={financialData} />
          ) : null}
        </div>
      )}
    </>
  );
}
