"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Calculator, CheckCircle2, Save, Thermometer, UserRound } from "lucide-react";
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
  value,
  onChange,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const valueProps = value === undefined
    ? { defaultValue: defaultValue ?? "" }
    : { value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange?.(event.target.value) };
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}{required ? <span className="ml-2 text-[11px] font-normal text-primary">Obrigatório</span> : null}</span>
      <input
        name={name}
        type={type}
        min={min}
        max={max}
        step={step}
        aria-required={required}
        {...valueProps}
        className="h-9 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}{required ? <span className="ml-2 text-[11px] font-normal text-primary">Obrigatório</span> : null}</span>
      <textarea
        name={name}
        aria-required={required}
        defaultValue={defaultValue ?? ""}
        className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function calculateAge(birthDate?: string | null) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function bmiStatus(value: number | null, age: number | null) {
  if (!value) return { label: "Aguardando medidas", detail: "Informe peso e altura.", className: "bg-muted text-muted-foreground" };
  if (age !== null && age < 20) return { label: "Avaliação pediátrica", detail: "Interpretar pela curva de IMC por idade e sexo.", className: "bg-sky-50 text-sky-800" };
  if (value < 18.5) return { label: "Baixo peso", detail: "Referência adulta. Correlacionar clinicamente.", className: "bg-amber-50 text-amber-800" };
  if (value < 25) return { label: "Faixa adequada", detail: "Referência adulta entre 18,5 e 24,9.", className: "bg-emerald-50 text-emerald-800" };
  if (value < 30) return { label: "Sobrepeso", detail: "Referência adulta. Avaliar contexto clínico.", className: "bg-amber-50 text-amber-800" };
  if (value < 35) return { label: "Obesidade grau I", detail: "Referência adulta. Requer avaliação profissional.", className: "bg-orange-50 text-orange-800" };
  if (value < 40) return { label: "Obesidade grau II", detail: "Referência adulta. Requer avaliação profissional.", className: "bg-orange-50 text-orange-800" };
  return { label: "Obesidade grau III", detail: "Referência adulta. Requer avaliação profissional.", className: "bg-red-50 text-red-800" };
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
  const [weight, setWeight] = useState(assessment?.weight_kg?.toString() ?? "");
  const [height, setHeight] = useState(assessment?.height_cm?.toString() ?? "");
  const [vitals, setVitals] = useState({
    systolic: assessment?.systolic_bp?.toString() ?? "",
    diastolic: assessment?.diastolic_bp?.toString() ?? "",
    heartRate: assessment?.heart_rate?.toString() ?? "",
    temperature: assessment?.temperature_c?.toString() ?? "",
    saturation: assessment?.oxygen_saturation?.toString() ?? "",
    pain: assessment?.pain_score?.toString() ?? "",
  });
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
  const weightValue = Number(weight.replace(",", "."));
  const heightValue = Number(height.replace(",", "."));
  const calculatedBmi = weightValue > 0 && heightValue > 0
    ? Number((weightValue / ((heightValue / 100) ** 2)).toFixed(2))
    : null;
  const bmiReference = bmiStatus(calculatedBmi, calculateAge(detail.patient?.birth_date));
  const systolic = Number(vitals.systolic);
  const diastolic = Number(vitals.diastolic);
  const saturation = Number(vitals.saturation);
  const temperature = Number(vitals.temperature);
  const pain = Number(vitals.pain);
  const clinicalSignals = [
    {
      label: "Pressão arterial",
      value: systolic && diastolic ? `${systolic}/${diastolic}` : "--/--",
      status: !systolic || !diastolic ? "Aguardando" : systolic >= 180 || diastolic >= 120 ? "Valor crítico" : systolic >= 140 || diastolic >= 90 ? "Atenção" : "Registrada",
      tone: systolic >= 180 || diastolic >= 120 ? "critical" : systolic >= 140 || diastolic >= 90 ? "warning" : "normal",
    },
    {
      label: "Saturação",
      value: saturation ? `${saturation}%` : "--",
      status: !saturation ? "Aguardando" : saturation < 90 ? "Valor crítico" : saturation < 95 ? "Atenção" : "Faixa esperada",
      tone: saturation && saturation < 90 ? "critical" : saturation && saturation < 95 ? "warning" : "normal",
    },
    {
      label: "Temperatura",
      value: temperature ? `${temperature.toFixed(1)} °C` : "--",
      status: !temperature ? "Aguardando" : temperature >= 39 || temperature < 35 ? "Valor crítico" : temperature >= 37.8 ? "Atenção" : "Registrada",
      tone: temperature && (temperature >= 39 || temperature < 35) ? "critical" : temperature >= 37.8 ? "warning" : "normal",
    },
    {
      label: "Escala de dor",
      value: vitals.pain ? `${pain}/10` : "--",
      status: !vitals.pain ? "Aguardando" : pain >= 8 ? "Dor intensa" : pain >= 4 ? "Dor moderada" : "Dor leve",
      tone: pain >= 8 ? "critical" : pain >= 4 ? "warning" : "normal",
    },
  ];

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
        <div className="grid gap-2 lg:grid-cols-4">
          {clinicalSignals.map((signal) => <div key={signal.label} className="rounded-md border bg-muted/15 px-3 py-2"><div className="flex items-center justify-between gap-2"><p className="text-[11px] text-muted-foreground">{signal.label}</p><span className={`size-2 rounded-full ${signal.tone === "critical" ? "bg-red-500" : signal.tone === "warning" ? "bg-amber-500" : "bg-emerald-500"}`} /></div><p className="mt-1 text-base font-semibold tabular-nums">{signal.value}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{signal.status}</p></div>)}
        </div>
        <p className="text-[11px] text-muted-foreground">Indicadores de apoio à triagem. A interpretação deve considerar idade, condição clínica e protocolo institucional.</p>
        <div className="grid gap-3 lg:grid-cols-4">
          <Field label="PA sistólica" name="systolic_bp" type="number" min={40} max={260} required={requiredFields.has("systolic_bp")} value={vitals.systolic} onChange={(value) => setVitals((current) => ({ ...current, systolic: value }))} />
          <Field label="PA diastólica" name="diastolic_bp" type="number" min={20} max={180} required={requiredFields.has("diastolic_bp")} value={vitals.diastolic} onChange={(value) => setVitals((current) => ({ ...current, diastolic: value }))} />
          <Field label="FC" name="heart_rate" type="number" min={20} max={240} required={requiredFields.has("heart_rate")} value={vitals.heartRate} onChange={(value) => setVitals((current) => ({ ...current, heartRate: value }))} />
          <Field label="FR" name="respiratory_rate" type="number" min={5} max={80} required={requiredFields.has("respiratory_rate")} defaultValue={assessment?.respiratory_rate} />
          <Field label="Temperatura °C" name="temperature_c" type="number" min={30} max={45} step={0.1} required={requiredFields.has("temperature_c")} value={vitals.temperature} onChange={(value) => setVitals((current) => ({ ...current, temperature: value }))} />
          <Field label="SpO2 %" name="oxygen_saturation" type="number" min={50} max={100} required={requiredFields.has("oxygen_saturation")} value={vitals.saturation} onChange={(value) => setVitals((current) => ({ ...current, saturation: value }))} />
          <Field label="Glicemia mg/dL" name="capillary_glucose" type="number" min={20} max={600} required={requiredFields.has("capillary_glucose")} defaultValue={assessment?.capillary_glucose} />
          <Field label="Dor 0-10" name="pain_score" type="number" min={0} max={10} required={requiredFields.has("pain_score")} value={vitals.pain} onChange={(value) => setVitals((current) => ({ ...current, pain: value }))} />
          <Field label="Peso kg" name="weight_kg" type="number" min={0} max={500} step={0.01} required={requiredFields.has("weight_kg")} value={weight} onChange={setWeight} />
          <Field label="Altura cm" name="height_cm" type="number" min={20} max={260} step={0.01} required={requiredFields.has("height_cm")} value={height} onChange={setHeight} />
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
        <div className="grid gap-3 rounded-md border bg-muted/15 p-3 lg:grid-cols-[180px_1fr_auto] lg:items-center">
          <div className="flex items-center gap-2"><Calculator className="size-4 text-primary" /><div><p className="text-xs text-muted-foreground">IMC calculado</p><p className="text-lg font-semibold tabular-nums">{calculatedBmi?.toFixed(2) ?? "--"}</p></div></div>
          <div><p className="text-sm font-medium">{bmiReference.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{bmiReference.detail}</p></div>
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${bmiReference.className}`}>
            {calculatedBmi && (calculatedBmi < 18.5 || calculatedBmi >= 25) ? <AlertTriangle className="size-3.5" /> : <Activity className="size-3.5" />}
            Apoio à triagem
          </span>
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
