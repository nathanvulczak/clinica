"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Save, Thermometer, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { NursingFieldKey } from "@/features/nursing/config";
import { saveNursingAssessmentAction, type NursingActionState } from "@/features/nursing/actions";
import type { NursingEncounterDetail, NursingPreferences } from "@/repositories/nursing";

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  min,
  max,
  step,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      {required ? <span className="text-xs font-normal text-primary">Obrigatório</span> : null}
      <input
        name={name}
        type={type}
        min={min}
        max={max}
        step={step}
        aria-required={required}
        defaultValue={defaultValue ?? ""}
        className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      {required ? <span className="text-xs font-normal text-primary">Obrigatório</span> : null}
      <textarea
        name={name}
        aria-required={required}
        defaultValue={defaultValue ?? ""}
        className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

export function NursingAssessmentForm({
  detail,
  preferences,
}: {
  detail: NursingEncounterDetail;
  preferences: NursingPreferences;
}) {
  const assessment = detail.assessment;
  const requiredFields = new Set<NursingFieldKey>(preferences.required_fields);
  const formRef = useRef<HTMLFormElement>(null);
  const modeRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [state, formAction, pending] = useActionState<NursingActionState, FormData>(
    saveNursingAssessmentAction,
    {},
  );
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (state.error) {
      toast({ title: "Ação não concluída", description: state.error, variant: "destructive" });
    }
    if (state.success) {
      toast({ title: "Enfermagem", description: state.success });
      if (state.success.includes("liberado")) router.push("/enfermagem");
    }
  }, [router, state.error, state.success, toast]);

  const completeDisabled = !["waiting_triage", "triage_in_progress"].includes(detail.status);

  return (
    <form ref={formRef} action={formAction} className="grid gap-5">
      <input type="hidden" name="encounter_id" value={detail.id} />
      <input ref={modeRef} type="hidden" name="mode" value="draft" />

      <section className="grid gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <UserRound className="size-5" />
          </div>
          <div>
            <p className="font-medium">
              {detail.patient?.social_name || detail.patient?.full_name || "Paciente"}
            </p>
            <p className="text-sm text-muted-foreground">
              {detail.professional?.profile?.full_name || "Profissional não informado"}
            </p>
          </div>
        </div>
        {detail.patient?.clinical_alerts ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Alerta clínico cadastrado para este paciente.
          </div>
        ) : null}
        {detail.status === "waiting_triage" ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            Ao salvar ou encerrar esta ficha, a pré-consulta será assumida por você e ficará
            registrada na auditoria.
          </div>
        ) : null}
        {preferences.show_required_field_alerts && preferences.required_fields.length ? (
          <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
            Campos obrigatórios nesta clínica:{" "}
            <span className="font-medium text-foreground">
              {preferences.required_fields.length}
            </span>
            . Se algum ficar vazio, o sistema mostrará exatamente o que precisa ser preenchido.
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Anamnese breve de enfermagem</p>
          <p className="text-xs text-muted-foreground">
            Estas informações serão usadas como apoio para a consulta do profissional.
          </p>
        </div>
        <TextArea
          label="Queixa principal"
          name="chief_complaint"
          required={requiredFields.has("chief_complaint")}
          defaultValue={assessment?.chief_complaint}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <TextArea
            label="Alergias"
            name="allergies"
            required={requiredFields.has("allergies")}
            defaultValue={assessment?.allergies}
          />
          <TextArea
            label="Medicamentos em uso"
            name="current_medications"
            required={requiredFields.has("current_medications")}
            defaultValue={assessment?.current_medications}
          />
          <TextArea
            label="Comorbidades"
            name="comorbidities"
            required={requiredFields.has("comorbidities")}
            defaultValue={assessment?.comorbidities}
          />
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <Thermometer className="size-5 text-primary" />
          <div>
            <p className="text-sm font-medium">Sinais vitais e medidas</p>
            <p className="text-xs text-muted-foreground">
              Campos com faixas clínicas validadas para evitar registros inconsistentes.
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          <Field label="PA sistólica" name="systolic_bp" type="number" min={40} max={260} required={requiredFields.has("systolic_bp")} defaultValue={assessment?.systolic_bp} />
          <Field label="PA diastólica" name="diastolic_bp" type="number" min={20} max={180} required={requiredFields.has("diastolic_bp")} defaultValue={assessment?.diastolic_bp} />
          <Field label="FC" name="heart_rate" type="number" min={20} max={240} required={requiredFields.has("heart_rate")} defaultValue={assessment?.heart_rate} />
          <Field label="FR" name="respiratory_rate" type="number" min={5} max={80} required={requiredFields.has("respiratory_rate")} defaultValue={assessment?.respiratory_rate} />
          <Field label="Temperatura °C" name="temperature_c" type="number" min={30} max={45} step={0.1} required={requiredFields.has("temperature_c")} defaultValue={assessment?.temperature_c} />
          <Field label="SpO2 %" name="oxygen_saturation" type="number" min={50} max={100} required={requiredFields.has("oxygen_saturation")} defaultValue={assessment?.oxygen_saturation} />
          <Field label="Glicemia mg/dL" name="capillary_glucose" type="number" min={20} max={600} required={requiredFields.has("capillary_glucose")} defaultValue={assessment?.capillary_glucose} />
          <Field label="Dor 0-10" name="pain_score" type="number" min={0} max={10} required={requiredFields.has("pain_score")} defaultValue={assessment?.pain_score} />
          <Field label="Peso kg" name="weight_kg" type="number" min={0} max={500} step={0.01} required={requiredFields.has("weight_kg")} defaultValue={assessment?.weight_kg} />
          <Field label="Altura cm" name="height_cm" type="number" min={20} max={260} step={0.01} required={requiredFields.has("height_cm")} defaultValue={assessment?.height_cm} />
          <Field label="Local da dor" name="pain_location" required={requiredFields.has("pain_location")} defaultValue={assessment?.pain_location} />
          <label className="grid gap-2 text-sm font-medium">
            Classificação
            {requiredFields.has("risk_level") ? (
              <span className="text-xs font-normal text-primary">Obrigatório</span>
            ) : null}
            <select
              name="risk_level"
              defaultValue={assessment?.risk_level ?? "routine"}
              className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="routine">Rotina</option>
              <option value="attention">Atenção</option>
              <option value="urgent">Urgente</option>
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <TextArea
            label="Observações de enfermagem"
            name="nursing_notes"
            required={requiredFields.has("nursing_notes")}
            defaultValue={assessment?.nursing_notes}
          />
          <TextArea
            label="Recomendações ao profissional"
            name="recommendations"
            required={requiredFields.has("recommendations")}
            defaultValue={assessment?.recommendations}
          />
        </div>
        {assessment?.status === "completed" ? (
          <TextArea label="Motivo da correção" name="correction_reason" required />
        ) : null}
      </section>

      <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t bg-background/95 py-3">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (modeRef.current) modeRef.current.value = "draft";
            formRef.current?.requestSubmit();
          }}
        >
          <Save />
          {pending ? "Salvando..." : "Salvar rascunho"}
        </Button>
        <Button
          type="button"
          disabled={pending || completeDisabled}
          onClick={() => setConfirmOpen(true)}
        >
          <CheckCircle2 />
          {pending ? "Encerrando..." : "Encerrar pré-consulta"}
        </Button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Encerrar pré-consulta?"
          description="A ficha será salva, o paciente sairá da fila da Enfermagem e ficará liberado para Atendimentos."
          confirmLabel="Encerrar"
          onConfirm={() => {
            if (modeRef.current) modeRef.current.value = "complete";
            formRef.current?.requestSubmit();
          }}
        />
      </div>
    </form>
  );
}
