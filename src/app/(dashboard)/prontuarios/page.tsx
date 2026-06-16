import Link from "next/link";
import { BarChart3, FileText, LockKeyhole, Settings2, Stethoscope } from "lucide-react";
import { ACTIVE_CARE_STATUSES } from "@/config/clinical-workflow";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveClinicContext } from "@/features/clinics/context";
import { ClinicalQueue } from "@/features/clinical-workflow/components/clinical-queue";
import {
  getClinicalWorkflowAccess,
  listClinicalEncounters,
} from "@/repositories/clinical-workflow";
import { listMedicalRecords } from "@/repositories/medical-records";
import type { LucideIcon } from "lucide-react";

function normalizeSection(value?: string) {
  return ["queue", "records", "reports", "preferences"].includes(value ?? "")
    ? value
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

const sections: Array<{
  key: "queue" | "records" | "reports" | "preferences";
  label: string;
  icon: LucideIcon;
}> = [
  { key: "queue", label: "Fila clinica", icon: Stethoscope },
  { key: "records", label: "Registros", icon: FileText },
  { key: "reports", label: "Relatorios", icon: BarChart3 },
  { key: "preferences", label: "Preferencias", icon: Settings2 },
];

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
    activeClinic && canView && section === "records"
      ? await listMedicalRecords(activeClinic.id)
      : [];

  const readyCount = encounters.filter((encounter) => encounter.status === "ready_for_consultation").length;
  const activeCount = encounters.filter(
    (encounter) => encounter.status === "consultation_in_progress",
  ).length;
  const completedCount = records.filter((record) => record.status === "completed").length;

  return (
    <>
      <PageHeader
        title="Prontuarios"
        description="Evolucao clinica, prescricoes e fechamento do atendimento com rastreabilidade."
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
          <div className="flex flex-wrap gap-2 rounded-lg border bg-card p-2">
            {sections.map(({ key, label, icon: Icon }) => (
              <Button
                key={key as string}
                asChild
                size="sm"
                variant={section === key ? "secondary" : "ghost"}
              >
                <Link href={`/prontuarios?section=${key}`}>
                  <Icon className="size-4" />
                  {label}
                </Link>
              </Button>
            ))}
          </div>

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
                        <Badge>{record.status}</Badge>
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

          {section === "reports" ? (
            <Card>
              <CardHeader>
                <CardTitle>Relatorios clinicos</CardTitle>
                <CardDescription>
                  Base preparada para indicadores por profissional, paciente, periodo, CID e status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Badge>Proxima etapa</Badge>
              </CardContent>
            </Card>
          ) : null}

          {section === "preferences" ? (
            <Card>
              <CardHeader>
                <CardTitle>Preferencias do prontuario</CardTitle>
                <CardDescription>
                  Campos obrigatorios, correcao de registros e exibicao da Enfermagem ja possuem
                  estrutura no banco para evoluirmos com painel de configuracao.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
