"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  ClipboardCheck,
  HeartPulse,
  Play,
  RotateCcw,
  Stethoscope,
} from "lucide-react";
import { CLINICAL_ENCOUNTER_STATUS_LABELS } from "@/config/clinical-workflow";
import {
  completeConsultationAction,
  completePreconsultationAction,
  routeClinicalEncounterAction,
  startConsultationAction,
  startPreconsultationAction,
  type ClinicalWorkflowActionState,
} from "@/features/clinical-workflow/actions";
import type {
  ClinicalEncounterStatus,
  ClinicalEncounterSummary,
} from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type QueueAccess = {
  canOperateNursing: boolean;
  canRoute: boolean;
  canViewAll: boolean;
  currentMemberId: string | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Horário não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function statusTone(status: ClinicalEncounterStatus) {
  if (status === "waiting_triage" || status === "ready_for_consultation") {
    return "bg-amber-500/10 text-amber-700";
  }
  if (status === "triage_in_progress" || status === "consultation_in_progress") {
    return "bg-cyan-500/10 text-cyan-700";
  }
  if (status === "consultation_completed" || status === "billed") {
    return "bg-emerald-500/10 text-emerald-700";
  }
  if (status === "cancelled") return "bg-destructive/10 text-destructive";
  return "bg-primary/10 text-primary";
}

function workflowStage(status: ClinicalEncounterStatus) {
  if (status === "awaiting_preconsultation_decision") return 0;
  if (status === "waiting_triage" || status === "triage_in_progress") return 1;
  if (status === "ready_for_consultation" || status === "consultation_in_progress") return 2;
  return 3;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function EncounterProgress({ encounter }: { encounter: ClinicalEncounterSummary }) {
  const currentStage = workflowStage(encounter.status);
  const steps = [
    "Chegada",
    encounter.preconsultation_required === false ? "Pré-consulta dispensada" : "Pré-consulta",
    "Consulta",
    "Conclusão",
  ];

  return (
    <div className="mt-3 grid grid-cols-4 gap-1" aria-label="Etapas do atendimento">
      {steps.map((step, index) => (
        <div key={step} className="min-w-0">
          <div
            className={`h-1 rounded-full ${
              index <= currentStage ? "bg-primary" : "bg-muted"
            }`}
          />
          <p
            className={`mt-1 truncate text-[11px] ${
              index === currentStage ? "font-medium text-foreground" : "text-muted-foreground"
            }`}
            title={step}
          >
            {step}
          </p>
        </div>
      ))}
    </div>
  );
}

function useWorkflowFeedback(
  state: ClinicalWorkflowActionState,
  onCompleted?: () => void,
) {
  const { toast } = useToast();
  const handledMessageRef = useRef<string | null>(null);

  useEffect(() => {
    const messageKey = state.error
      ? `error:${state.error}`
      : state.success
        ? `success:${state.success}`
        : null;
    if (!messageKey || handledMessageRef.current === messageKey) return;
    handledMessageRef.current = messageKey;

    if (state.error) {
      toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
    }

    if (state.success) {
      toast({ title: "Fluxo atualizado", description: state.success });
      onCompleted?.();
    }
  }, [onCompleted, state.error, state.success, toast]);
}

function ConfirmedWorkflowAction({
  encounterId,
  targetStatus,
  requiresPreconsultation,
  label,
  title,
  description,
  icon: Icon,
  variant = "default",
}: {
  encounterId: string;
  targetStatus?: ClinicalEncounterStatus;
  requiresPreconsultation?: boolean;
  label: string;
  title: string;
  description: string;
  icon: typeof Play;
  variant?: "default" | "outline";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const action =
    requiresPreconsultation !== undefined
      ? routeClinicalEncounterAction
      : targetStatus === "triage_in_progress"
        ? startPreconsultationAction
        : targetStatus === "ready_for_consultation"
          ? completePreconsultationAction
          : targetStatus === "consultation_in_progress"
            ? startConsultationAction
            : completeConsultationAction;
  const [state, formAction, pending] = useActionState(action, {});

  useWorkflowFeedback(state, () => setOpen(false));

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="encounter_id" value={encounterId} />
      {requiresPreconsultation !== undefined ? (
        <input
          type="hidden"
          name="requires_preconsultation"
          value={String(requiresPreconsultation)}
        />
      ) : null}
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        <Icon />
        {pending ? "Processando..." : label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={label}
        onConfirm={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

function CorrectRouteButton({
  encounterId,
  requiresPreconsultation,
}: {
  encounterId: string;
  requiresPreconsultation: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(routeClinicalEncounterAction, {});

  useWorkflowFeedback(state, () => setOpen(false));

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <RotateCcw />
        Corrigir fluxo
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Corrigir encaminhamento"
        description="A correção não apaga a decisão anterior e ficará registrada na auditoria."
        className="max-w-lg"
      >
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="encounter_id" value={encounterId} />
          <input
            type="hidden"
            name="requires_preconsultation"
            value={String(requiresPreconsultation)}
          />
          <label className="grid gap-2 text-sm font-medium">
            Motivo da correção
            <textarea
              name="reason"
              required
              maxLength={500}
              className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={pending}>
              <RotateCcw />
              {pending ? "Salvando..." : "Confirmar correção"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function EncounterActions({
  encounter,
  access,
  mode,
}: {
  encounter: ClinicalEncounterSummary;
  access: QueueAccess;
  mode: "care" | "nursing";
}) {
  const isAssigned = encounter.professional_member_id === access.currentMemberId;

  if (!isUuid(encounter.id)) {
    return (
      <div className="max-w-sm rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
        Fluxo assistencial não inicializado. Registre a chegada na Agenda ou atualize a fila.
      </div>
    );
  }

  if (encounter.status === "awaiting_preconsultation_decision" && access.canRoute) {
    return (
      <div className="flex flex-wrap gap-2">
        <ConfirmedWorkflowAction
          encounterId={encounter.id}
          requiresPreconsultation
          label="Enviar à enfermagem"
          title="Encaminhar para pré-consulta?"
          description="O paciente passará a aparecer na fila de Enfermagem."
          icon={HeartPulse}
        />
        <ConfirmedWorkflowAction
          encounterId={encounter.id}
          requiresPreconsultation={false}
          label="Atendimento direto"
          title="Liberar para atendimento?"
          description="O paciente será disponibilizado diretamente ao profissional responsável."
          icon={Stethoscope}
          variant="outline"
        />
      </div>
    );
  }

  if (mode === "nursing" && encounter.status === "waiting_triage" && access.canOperateNursing) {
    return (
      <ConfirmedWorkflowAction
        encounterId={encounter.id}
        targetStatus="triage_in_progress"
        label="Iniciar pré-consulta"
        title="Iniciar pré-consulta?"
        description="O horário e o usuário responsável serão registrados."
        icon={Play}
      />
    );
  }

  if (
    mode === "nursing" &&
    encounter.status === "triage_in_progress" &&
    access.canOperateNursing
  ) {
    return (
      <ConfirmedWorkflowAction
        encounterId={encounter.id}
        targetStatus="ready_for_consultation"
        label="Liberar para consulta"
        title="Concluir esta etapa?"
        description="O paciente será liberado para o profissional responsável."
        icon={ClipboardCheck}
      />
    );
  }

  if (
    mode === "care" &&
    encounter.status === "ready_for_consultation" &&
    isAssigned
  ) {
    return (
      <ConfirmedWorkflowAction
        encounterId={encounter.id}
        targetStatus="consultation_in_progress"
        label="Iniciar atendimento"
        title="Iniciar atendimento?"
        description="O início será registrado com data, hora e profissional responsável."
        icon={Play}
      />
    );
  }

  if (
    mode === "care" &&
    encounter.status === "consultation_in_progress" &&
    isAssigned
  ) {
    return (
      <ConfirmedWorkflowAction
        encounterId={encounter.id}
        targetStatus="consultation_completed"
        label="Finalizar atendimento"
        title="Finalizar atendimento?"
        description="A consulta será encerrada e ficará pronta para as próximas decisões clínicas e financeiras."
        icon={ClipboardCheck}
      />
    );
  }

  if (
    access.canRoute &&
    (encounter.status === "waiting_triage" || encounter.status === "ready_for_consultation")
  ) {
    return (
      <CorrectRouteButton
        encounterId={encounter.id}
        requiresPreconsultation={encounter.status === "ready_for_consultation"}
      />
    );
  }

  return null;
}

export function ClinicalQueue({
  encounters,
  access,
  mode,
}: {
  encounters: ClinicalEncounterSummary[];
  access: QueueAccess;
  mode: "care" | "nursing";
}) {
  if (encounters.length === 0) {
    const Icon = mode === "nursing" ? HeartPulse : Stethoscope;

    return (
      <div className="rounded-lg border border-dashed px-6 py-14 text-center">
        <Icon className="mx-auto size-9 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">Nenhum paciente nesta fila</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Os atendimentos aparecerão aqui conforme avançarem na Agenda.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {encounters.map((encounter) => (
        <article key={encounter.id} className="rounded-lg border bg-card p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.8fr)_auto] xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">
                  {encounter.patient?.social_name || encounter.patient?.full_name || "Paciente"}
                </p>
                <Badge className={statusTone(encounter.status)}>
                  {CLINICAL_ENCOUNTER_STATUS_LABELS[encounter.status]}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDateTime(encounter.appointment?.starts_at)} ·{" "}
                {encounter.service?.name || encounter.appointment?.appointment_type || "Consulta"}
              </p>
              {encounter.patient?.clinical_alerts ? (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  Alerta clínico cadastrado
                </p>
              ) : null}
              <EncounterProgress encounter={encounter} />
            </div>

            <dl className="grid gap-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Profissional:</dt>
                <dd className="truncate font-medium">
                  {encounter.professional?.profile?.full_name || "Não informado"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Local:</dt>
                <dd className="truncate">{encounter.room?.name || "Não definido"}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
              <EncounterActions encounter={encounter} access={access} mode={mode} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
