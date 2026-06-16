import { BarChart3, ClipboardList, HeartPulse, History, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { ClinicalQueue } from "@/features/clinical-workflow/components/clinical-queue";
import { NursingPreferencesForm } from "@/features/nursing/components/nursing-preferences-form";
import { NursingRecordsPanel } from "@/features/nursing/components/nursing-records-panel";
import {
  NursingSectionNav,
  type NursingSection,
} from "@/features/nursing/components/nursing-section-nav";
import {
  getClinicalWorkflowAccess,
  listClinicalEncounters,
} from "@/repositories/clinical-workflow";
import {
  defaultNursingPreferences,
  getNursingPreferences,
  listNursingAssessments,
} from "@/repositories/nursing";

function normalizeSection(value?: string): NursingSection {
  return ["queue", "records", "preferences"].includes(value ?? "")
    ? (value as NursingSection)
    : "queue";
}

export default async function EnfermagemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const section = normalizeSection(params.section);
  const { activeClinic } = await getActiveClinicContext();
  const access = await getClinicalWorkflowAccess(activeClinic?.id);
  const encounters =
    activeClinic && (access.canViewNursing || access.canViewAll)
      ? await listClinicalEncounters(activeClinic.id, { queue: "nursing" })
      : [];
  const [records, preferences] =
    activeClinic && (access.canViewNursing || access.canViewAll)
      ? await Promise.all([
          section === "records" ? listNursingAssessments(activeClinic.id) : Promise.resolve([]),
          section === "preferences"
            ? getNursingPreferences(activeClinic.id)
            : Promise.resolve(defaultNursingPreferences(activeClinic.id)),
        ])
      : [[], defaultNursingPreferences(activeClinic?.id)];
  const waitingCount = encounters.filter((encounter) => encounter.status === "waiting_triage").length;
  const activeCount = encounters.filter(
    (encounter) => encounter.status === "triage_in_progress",
  ).length;
  const canEditPreferences = access.canOperateNursing || access.canViewAll;

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
          <NursingSectionNav activeSection={section} />

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Fila</p>
                  <p className="mt-1 text-xs text-muted-foreground">Aguardando início</p>
                </div>
                <ClipboardList className="size-5 text-primary" />
              </div>
              <p className="mt-3 text-2xl font-semibold">{waitingCount}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Em pré-consulta</p>
                  <p className="mt-1 text-xs text-muted-foreground">Coleta em andamento</p>
                </div>
                <HeartPulse className="size-5 text-primary" />
              </div>
              <p className="mt-3 text-2xl font-semibold">{activeCount}</p>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Histórico e relatórios</p>
                  <p className="mt-1 text-xs text-muted-foreground">Preparado para indicadores</p>
                </div>
                <BarChart3 className="size-5 text-primary" />
              </div>
              <Badge className="mt-3 bg-muted text-muted-foreground">
                Próxima etapa
              </Badge>
            </div>
          </div>

          {section === "queue" ? (
            <>
              <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
                <strong className="font-medium text-foreground">Fluxo:</strong> pacientes encaminhados
                aguardam início da pré-consulta. Ao concluir esta etapa, eles saem desta fila e são
                liberados em Atendimentos para o profissional responsável.
              </div>
              <div className="flex items-center gap-3 border-b pb-4">
                <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <HeartPulse className="size-5" />
                </div>
                <div>
                  <p className="font-medium">Pré-consultas</p>
                  <p className="text-sm text-muted-foreground">{activeClinic.trade_name}</p>
                </div>
                <div className="ml-auto hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
                  <History className="size-4" />
                  Histórico completo será vinculado à ficha do paciente.
                </div>
              </div>
              <ClinicalQueue encounters={encounters} access={access} mode="nursing" />
            </>
          ) : null}

          {section === "records" ? (
            <NursingRecordsPanel records={records} canEdit={access.canOperateNursing} />
          ) : null}

          {section === "preferences" ? (
            <NursingPreferencesForm preferences={preferences} canEdit={canEditPreferences} />
          ) : null}
        </div>
      )}
    </>
  );
}
