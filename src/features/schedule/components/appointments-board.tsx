"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Link2, RefreshCw, UserRound } from "lucide-react";
import {
  APPOINTMENT_STATUS_HELP,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUSES,
  SCHEDULE_BLOCK_TYPE_LABELS,
} from "@/config/schedule";
import { updateAppointmentStatusAction } from "@/features/schedule/actions";
import { formatDateTimeBr, formatTimeBr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AppointmentSummary, ScheduleBlock, ScheduleProfessional } from "@/types/domain";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

function professionalName(professionals: ScheduleProfessional[], professionalId: string) {
  return (
    professionals.find((professional) => professional.id === professionalId)?.profile?.full_name ??
    "Profissional não localizado"
  );
}

function statusBadgeClass(status: AppointmentSummary["status"]) {
  return cn(
    status === "scheduled" && "bg-muted text-muted-foreground",
    status === "confirmed" && "bg-primary/10 text-primary",
    status === "checked_in" && "bg-emerald-500/10 text-emerald-700",
    status === "in_triage" && "bg-cyan-500/10 text-cyan-700",
    status === "in_progress" && "bg-blue-500/10 text-blue-700",
    status === "completed" && "bg-slate-500/10 text-slate-700",
    status === "billing_pending" && "bg-amber-500/10 text-amber-700",
    status === "billed" && "bg-emerald-600/10 text-emerald-700",
    ["cancelled", "no_show", "rescheduled"].includes(status) && "bg-destructive/10 text-destructive",
  );
}

export function AppointmentsBoard({
  appointments,
  blocks,
  professionals,
  canManage,
  canUpdateStatus,
  confirmationUrlBase,
}: {
  appointments: AppointmentSummary[];
  blocks: ScheduleBlock[];
  professionals: ScheduleProfessional[];
  canManage: boolean;
  canUpdateStatus: boolean;
  confirmationUrlBase: string;
}) {
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        {appointments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Nenhum compromisso encontrado para os filtros atuais.
          </div>
        ) : (
          appointments.map((appointment) => (
            <article key={appointment.id} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="grid gap-4 xl:grid-cols-[180px_1fr_360px] xl:items-start">
                <div className="grid gap-2">
                  <div className="flex items-center gap-2 text-2xl font-semibold">
                    <Clock className="size-5 text-primary" />
                    {formatTimeBr(appointment.starts_at)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    até {formatTimeBr(appointment.ends_at)}
                  </p>
                  <Badge className={statusBadgeClass(appointment.status)}>
                    {APPOINTMENT_STATUS_LABELS[appointment.status]}
                  </Badge>
                </div>

                <div className="grid min-w-0 gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <UserRound className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{appointment.patient?.full_name ?? "Paciente não localizado"}</p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {appointment.appointment_type} • {appointment.channel}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-md border bg-background p-3 text-sm md:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Profissional</p>
                      <p className="mt-1">{appointment.professional?.profile?.full_name ?? "Não informado"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Confirmação</p>
                      <p className="mt-1">
                        {appointment.confirmed_at ? formatDateTimeBr(appointment.confirmed_at) : "Aguardando paciente"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Serviço</p>
                      <p className="mt-1">{appointment.service?.name ?? appointment.appointment_type}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Consultório</p>
                      <p className="mt-1">{appointment.room?.name ?? "A definir"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Telefone</p>
                      <p className="mt-1">{appointment.patient?.phone ?? "Não informado"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">E-mail</p>
                      <p className="mt-1 break-words">{appointment.patient?.email ?? "Não informado"}</p>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {appointment.notes || APPOINTMENT_STATUS_HELP[appointment.status]}
                  </p>

                  <CopyConfirmationLink
                    url={`${confirmationUrlBase}/${appointment.confirmation_token}`}
                    disabled={!canManage}
                  />
                </div>

                <AppointmentStatusForm appointment={appointment} disabled={!canUpdateStatus} />
              </div>
            </article>
          ))
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bloqueios do dia</h2>
          <Badge>{blocks.length}</Badge>
        </div>
        {blocks.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nenhum bloqueio cadastrado para os filtros atuais.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {blocks.map((block) => (
              <div key={block.id} className="rounded-lg border bg-card p-4 text-sm shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {formatTimeBr(block.starts_at)} até {formatTimeBr(block.ends_at)}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {professionalName(professionals, block.professional_member_id)}
                    </p>
                  </div>
                  <Badge>{SCHEDULE_BLOCK_TYPE_LABELS[block.block_type]}</Badge>
                </div>
                {block.reason ? <p className="mt-3 text-muted-foreground">{block.reason}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CopyConfirmationLink({ url, disabled }: { url: string; disabled?: boolean }) {
  const { toast } = useToast();

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase text-muted-foreground">Link do paciente</p>
        <p className="mt-1 truncate text-sm text-muted-foreground">{url}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          toast({ title: "Link copiado", description: "Envie ao paciente para confirmação da consulta." });
        }}
      >
        <Link2 />
        Copiar
      </Button>
    </div>
  );
}

function AppointmentStatusForm({
  appointment,
  disabled,
}: {
  appointment: AppointmentSummary;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateAppointmentStatusAction, {});

  useEffect(() => {
    if (state.success) {
      toast({ title: state.success, description: "O fluxo operacional foi atualizado e auditado." });
    }

    if (state.error) {
      toast({ title: "Status não atualizado", description: state.error, variant: "destructive" });
    }
  }, [state.error, state.success, toast]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-3 rounded-md border bg-background p-3">
      <input type="hidden" name="appointment_id" value={appointment.id} />
      <div className="grid gap-2">
        <Label htmlFor={`status-${appointment.id}`}>Atualizar etapa</Label>
        <Select
          id={`status-${appointment.id}`}
          name="status"
          defaultValue={appointment.status}
          disabled={disabled || pending}
        >
          {APPOINTMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {APPOINTMENT_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`notes-${appointment.id}`}>Observação da etapa</Label>
        <textarea
          id={`notes-${appointment.id}`}
          name="notes"
          className="min-h-20 rounded-md border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={disabled || pending}
          placeholder="Motivo de cancelamento, orientação ou observação interna"
        />
      </div>
      <Button type="button" variant="outline" disabled={disabled || pending} onClick={() => setOpen(true)}>
        {pending ? <RefreshCw /> : <CheckCircle2 />}
        {pending ? "Atualizando..." : "Aplicar etapa"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Atualizar etapa da consulta?"
        description="A alteração será registrada na auditoria e poderá liberar os próximos fluxos operacionais."
        confirmLabel="Atualizar etapa"
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}
