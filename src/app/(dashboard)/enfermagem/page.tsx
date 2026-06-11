import { HeartPulse, LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { ClinicalQueue } from "@/features/clinical-workflow/components/clinical-queue";
import {
  getClinicalWorkflowAccess,
  listClinicalEncounters,
} from "@/repositories/clinical-workflow";

export default async function EnfermagemPage() {
  const { activeClinic } = await getActiveClinicContext();
  const access = await getClinicalWorkflowAccess(activeClinic?.id);
  const encounters =
    activeClinic && (access.canViewNursing || access.canViewAll)
      ? await listClinicalEncounters(activeClinic.id, { queue: "nursing" })
      : [];

  return (
    <>
      <PageHeader
        title="Enfermagem"
        description="Fila segura de pré-consulta com registro de início, conclusão e responsável."
      />

      {!activeClinic ? (
        <Card>
          <CardHeader>
            <CardTitle>Clínica ativa necessária</CardTitle>
            <CardDescription>Selecione uma clínica para acessar a fila assistencial.</CardDescription>
          </CardHeader>
        </Card>
      ) : !access.canViewNursing && !access.canViewAll ? (
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
      ) : (
        <div className="grid gap-5">
          <div className="flex items-center gap-3 border-b pb-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <HeartPulse className="size-5" />
            </div>
            <div>
              <p className="font-medium">Pré-consultas</p>
              <p className="text-sm text-muted-foreground">{activeClinic.trade_name}</p>
            </div>
          </div>
          <ClinicalQueue encounters={encounters} access={access} mode="nursing" />
        </div>
      )}
    </>
  );
}
