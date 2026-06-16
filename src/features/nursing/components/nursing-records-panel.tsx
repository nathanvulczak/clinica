import Link from "next/link";
import { FileText } from "lucide-react";
import { formatDateTimeBr } from "@/lib/dates";
import { CLINICAL_ENCOUNTER_STATUS_LABELS } from "@/config/clinical-workflow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { NursingAssessmentListItem } from "@/repositories/nursing";

const assessmentStatusLabels: Record<string, string> = {
  draft: "Rascunho",
  completed: "Encerrada",
  corrected: "Corrigida",
};

export function NursingRecordsPanel({
  records,
  canEdit,
}: {
  records: NursingAssessmentListItem[];
  canEdit: boolean;
}) {
  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-14 text-center">
        <FileText className="mx-auto size-9 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">Nenhum registro de pré-consulta</p>
        <p className="mt-1 text-sm text-muted-foreground">
          As fichas preenchidas aparecerão aqui com vínculo ao paciente, atendimento e auditoria.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-[minmax(220px,1fr)_160px_160px_180px_auto] gap-3 border-b bg-muted/30 px-4 py-3 text-xs font-medium text-muted-foreground">
        <span>Paciente</span>
        <span>Status</span>
        <span>Risco</span>
        <span>Atualizado em</span>
        <span className="text-right">Ação</span>
      </div>
      <div className="divide-y">
        {records.map((record) => (
          <div
            key={record.id}
            className="grid grid-cols-[minmax(220px,1fr)_160px_160px_180px_auto] items-center gap-3 px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {record.patient?.social_name || record.patient?.full_name || "Paciente"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {record.professional?.profile?.full_name || "Profissional não informado"}
              </p>
            </div>
            <div>
              <Badge className="bg-muted text-muted-foreground">
                {assessmentStatusLabels[record.status] ?? record.status}
              </Badge>
              {record.encounter ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {CLINICAL_ENCOUNTER_STATUS_LABELS[record.encounter.status]}
                </p>
              ) : null}
            </div>
            <span className="text-muted-foreground">
              {record.risk_level === "urgent"
                ? "Urgente"
                : record.risk_level === "attention"
                  ? "Atenção"
                  : "Rotina"}
            </span>
            <span className="text-muted-foreground">{formatDateTimeBr(record.updated_at)}</span>
            <div className="flex justify-end">
              {record.encounter ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/enfermagem/${record.encounter.id}`}>
                    {canEdit ? "Abrir/editar" : "Visualizar"}
                  </Link>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Sem atendimento</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
