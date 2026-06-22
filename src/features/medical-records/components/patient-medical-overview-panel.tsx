"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  addPatientClinicalCommentAction,
  type MedicalRecordActionState,
} from "@/features/medical-records/actions";
import type { PatientMedicalOverview } from "@/repositories/medical-records";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function PatientCommentForm({
  patientId,
  encounterId,
  medicalRecordId,
}: {
  patientId: string;
  encounterId?: string;
  medicalRecordId?: string;
}) {
  const [state, formAction, pending] = useActionState<MedicalRecordActionState, FormData>(
    addPatientClinicalCommentAction,
    {},
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) {
      toast({ title: "Comentário não salvo", description: state.error, variant: "destructive" });
    }
    if (state.success) {
      toast({ title: "Comentário clínico", description: state.success });
    }
  }, [state.error, state.success, toast]);

  return (
    <form action={formAction} className="grid gap-3 rounded-md border bg-muted/20 p-3">
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="encounter_id" value={encounterId ?? ""} />
      <input type="hidden" name="medical_record_id" value={medicalRecordId ?? ""} />
      <div className="grid gap-3 lg:grid-cols-[1fr_180px_auto]">
        <textarea
          name="comment"
          placeholder="Adicionar comentário clínico interno sobre este paciente..."
          className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Select name="visibility" defaultValue="clinical">
          <option value="clinical">Equipe clínica</option>
          <option value="private">Privado</option>
        </Select>
        <Button disabled={pending}>
          <MessageSquarePlus />
          {pending ? "Salvando..." : "Comentar"}
        </Button>
      </div>
    </form>
  );
}

export function PatientMedicalOverviewPanel({ overviews }: { overviews: PatientMedicalOverview[] }) {
  if (!overviews.length) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
        Nenhum paciente com prontuário registrado ainda.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {overviews.map((overview) => {
        const latestRecord = overview.records[0];
        const patientName = overview.patient?.social_name || overview.patient?.full_name || "Paciente";

        return (
          <article key={overview.patient?.id ?? latestRecord.patient_id} className="grid gap-3 rounded-lg border bg-card p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{patientName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {overview.records.length} prontuário(s) | último registro {formatDate(latestRecord.updated_at)}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={`/prontuarios/${latestRecord.encounter_id}`}>Abrir último prontuário</Link>
              </Button>
            </div>

            <div className="grid gap-2">
              <p className="text-sm font-medium">Comentários recentes</p>
              {overview.comments.length ? (
                overview.comments.slice(0, 3).map((comment) => (
                  <div key={comment.id} className="rounded-md border bg-background p-3 text-sm">
                    <p>{comment.comment}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {comment.author?.full_name ?? "Usuário"} | {formatDate(comment.created_at)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum comentário clínico registrado.</p>
              )}
            </div>

            <PatientCommentForm
              patientId={latestRecord.patient_id}
              encounterId={latestRecord.encounter_id}
              medicalRecordId={latestRecord.id}
            />
          </article>
        );
      })}
    </div>
  );
}
