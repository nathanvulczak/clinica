"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FileText, Pill, Save, Stethoscope, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  PRESCRIPTION_TEMPLATES,
  type MedicalRecordFieldKey,
} from "@/features/medical-records/config";
import {
  saveMedicalRecordAction,
  type MedicalRecordActionState,
} from "@/features/medical-records/actions";
import type {
  MedicalPrescription,
  MedicalRecordEncounterDetail,
  MedicalRecordPreferences,
} from "@/repositories/medical-records";

function formatDate(value: string | null | undefined) {
  if (!value) return "Data nao informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function Field({
  label,
  name,
  defaultValue,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span className="flex items-center gap-2">
        {label}
        {required ? <span className="text-xs font-normal text-primary">Obrigatorio</span> : null}
      </span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        aria-required={required}
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
  minHeight = "min-h-28",
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  minHeight?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      <span className="flex items-center gap-2">
        {label}
        {required ? <span className="text-xs font-normal text-primary">Obrigatorio</span> : null}
      </span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-required={required}
        className={`${minHeight} rounded-md border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      />
    </label>
  );
}

function fillTemplate(template: string, detail: MedicalRecordEncounterDetail) {
  const patientName = detail.patient?.social_name || detail.patient?.full_name || "Paciente";
  const professionalName = detail.professional?.profile?.full_name || "Profissional";
  const date = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  return template
    .replaceAll("{{patient_name}}", patientName)
    .replaceAll("{{professional_name}}", professionalName)
    .replaceAll("{{date}}", date);
}

function NursingSummary({ detail }: { detail: MedicalRecordEncounterDetail }) {
  const assessment = detail.nursing_assessment;

  if (!assessment) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="size-5 text-primary" />
          <div>
            <p className="font-medium">Resumo da Enfermagem</p>
            <p className="text-sm text-muted-foreground">
              Esta consulta nao possui pre-consulta registrada.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const vitals = [
    assessment.systolic_bp && assessment.diastolic_bp
      ? `PA ${assessment.systolic_bp}/${assessment.diastolic_bp} mmHg`
      : null,
    assessment.heart_rate ? `FC ${assessment.heart_rate} bpm` : null,
    assessment.respiratory_rate ? `FR ${assessment.respiratory_rate} irpm` : null,
    assessment.temperature_c ? `Temp. ${assessment.temperature_c} C` : null,
    assessment.oxygen_saturation ? `SpO2 ${assessment.oxygen_saturation}%` : null,
    assessment.capillary_glucose ? `HGT ${assessment.capillary_glucose} mg/dL` : null,
  ].filter(Boolean);

  return (
    <section className="grid gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="size-5 text-primary" />
        <div>
          <p className="font-medium">Resumo da Enfermagem</p>
          <p className="text-sm text-muted-foreground">
            Encerrada em {formatDate(assessment.completed_at)}.
          </p>
        </div>
      </div>
      <div className="grid gap-3 text-sm lg:grid-cols-2">
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Queixa</p>
          <p className="mt-1">{assessment.chief_complaint ?? "Nao informada"}</p>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Sinais vitais</p>
          <p className="mt-1">{vitals.length ? vitals.join(" | ") : "Nao informados"}</p>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Alergias / medicacoes</p>
          <p className="mt-1">
            {[assessment.allergies, assessment.current_medications].filter(Boolean).join(" | ") ||
              "Nao informado"}
          </p>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-medium uppercase text-muted-foreground">Recomendacoes</p>
          <p className="mt-1">{assessment.recommendations ?? "Sem recomendacoes registradas"}</p>
        </div>
      </div>
    </section>
  );
}

export function MedicalRecordForm({
  detail,
  preferences,
}: {
  detail: MedicalRecordEncounterDetail;
  preferences: MedicalRecordPreferences;
}) {
  const record = detail.medical_record;
  const latestPrescription: MedicalPrescription | undefined = detail.prescriptions[0];
  const requiredFields = new Set<MedicalRecordFieldKey>(preferences.required_fields);
  const formRef = useRef<HTMLFormElement>(null);
  const modeRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [templateKey, setTemplateKey] = useState(latestPrescription?.template_key ?? "");
  const [prescriptionTitle, setPrescriptionTitle] = useState(latestPrescription?.title ?? "");
  const [prescriptionContent, setPrescriptionContent] = useState(latestPrescription?.content ?? "");
  const [state, formAction, pending] = useActionState<MedicalRecordActionState, FormData>(
    saveMedicalRecordAction,
    {},
  );
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (state.error) {
      toast({ title: "Acao nao concluida", description: state.error, variant: "destructive" });
    }
    if (state.success) {
      toast({ title: "Prontuario", description: state.success });
      if (state.redirectTo) router.push(state.redirectTo);
    }
  }, [router, state.error, state.redirectTo, state.success, toast]);

  const canComplete = ["ready_for_consultation", "consultation_in_progress"].includes(detail.status);
  const patientName = detail.patient?.social_name || detail.patient?.full_name || "Paciente";

  const selectedTemplate = useMemo(
    () => PRESCRIPTION_TEMPLATES.find((template) => template.key === templateKey),
    [templateKey],
  );

  function applyTemplate(key: string) {
    const template = PRESCRIPTION_TEMPLATES.find((item) => item.key === key);
    setTemplateKey(key);
    if (!template) return;
    setPrescriptionTitle(template.title);
    setPrescriptionContent(fillTemplate(template.content, detail));
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-5">
      <input type="hidden" name="encounter_id" value={detail.id} />
      <input ref={modeRef} type="hidden" name="mode" value="draft" />
      <input type="hidden" name="prescription_id" value={latestPrescription?.id ?? ""} />
      <input type="hidden" name="prescription_template_key" value={templateKey} />

      <section className="grid gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <UserRound className="size-5" />
          </div>
          <div>
            <p className="font-medium">{patientName}</p>
            <p className="text-sm text-muted-foreground">
              {detail.professional?.profile?.full_name || "Profissional nao informado"} |{" "}
              {formatDate(detail.appointment?.starts_at)}
            </p>
          </div>
        </div>
        {detail.patient?.clinical_alerts ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Alerta clinico cadastrado: {detail.patient.clinical_alerts}
          </div>
        ) : null}
        {record?.status === "completed" && preferences.require_correction_reason ? (
          <TextArea
            label="Motivo da correcao"
            name="correction_reason"
            defaultValue={record.correction_reason}
            required
            minHeight="min-h-20"
          />
        ) : null}
      </section>

      {preferences.show_nursing_summary ? <NursingSummary detail={detail} /> : null}

      <section className="grid gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <Stethoscope className="size-5 text-primary" />
          <div>
            <p className="font-medium">Evolucao clinica</p>
            <p className="text-sm text-muted-foreground">
              Registre avaliacao, exame, hipotese diagnostica e conduta.
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <TextArea
            label="Queixa principal"
            name="chief_complaint"
            defaultValue={record?.chief_complaint ?? detail.nursing_assessment?.chief_complaint}
            required={requiredFields.has("chief_complaint")}
          />
          <TextArea
            label="Historia clinica"
            name="history"
            defaultValue={record?.history}
            required={requiredFields.has("history")}
          />
          <TextArea
            label="Exame fisico"
            name="physical_exam"
            defaultValue={record?.physical_exam}
            required={requiredFields.has("physical_exam")}
          />
          <TextArea
            label="Avaliacao / hipotese"
            name="assessment"
            defaultValue={record?.assessment}
            required={requiredFields.has("assessment")}
          />
          <Field
            label="Diagnostico"
            name="diagnosis"
            defaultValue={record?.diagnosis}
            required={requiredFields.has("diagnosis")}
          />
          <Field
            label="CID-10"
            name="cid10"
            defaultValue={record?.cid10}
            required={requiredFields.has("cid10")}
            placeholder="Ex.: J00"
          />
        </div>
        <TextArea
          label="Plano terapeutico / conduta"
          name="plan"
          defaultValue={record?.plan}
          required={requiredFields.has("plan")}
        />
        <TextArea
          label="Orientacoes ao paciente"
          name="patient_guidance"
          defaultValue={record?.patient_guidance}
          required={requiredFields.has("patient_guidance")}
        />
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm font-medium">
            <input
              type="checkbox"
              name="follow_up_required"
              defaultChecked={record?.follow_up_required ?? false}
              className="size-4"
            />
            Solicitar retorno
          </label>
          <Field
            label="Observacao de retorno"
            name="follow_up_notes"
            defaultValue={record?.follow_up_notes}
            required={requiredFields.has("follow_up_notes")}
          />
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <Pill className="size-5 text-primary" />
          <div>
            <p className="font-medium">Receitas e documentos</p>
            <p className="text-sm text-muted-foreground">
              Use um modelo inicial e ajuste o conteudo antes de salvar.
            </p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
          <label className="grid gap-2 text-sm font-medium">
            Modelo
            <Select value={templateKey} onChange={(event) => applyTemplate(event.target.value)}>
              <option value="">Selecionar modelo</option>
              {PRESCRIPTION_TEMPLATES.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.title}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Titulo
            <input
              name="prescription_title"
              value={prescriptionTitle}
              onChange={(event) => setPrescriptionTitle(event.target.value)}
              placeholder="Ex.: Prescricao simples"
              className="h-10 rounded-md border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>
        {selectedTemplate ? (
          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
            {selectedTemplate.description}
          </div>
        ) : null}
        <textarea
          name="prescription_content"
          value={prescriptionContent}
          onChange={(event) => setPrescriptionContent(event.target.value)}
          className="min-h-60 rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Selecione um modelo ou escreva uma prescricao/orientacao."
        />
      </section>

      <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-2 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur">
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (modeRef.current) modeRef.current.value = "draft";
          }}
        >
          <Save />
          {pending ? "Salvando..." : "Salvar rascunho"}
        </Button>
        <Button
          type="button"
          disabled={pending || !canComplete}
          onClick={() => setConfirmOpen(true)}
        >
          <FileText />
          Finalizar consulta
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Finalizar consulta?"
        description="O prontuario sera salvo, o atendimento sera encerrado e a acao ficara registrada na auditoria."
        confirmLabel="Finalizar consulta"
        onConfirm={() => {
          if (modeRef.current) modeRef.current.value = "complete";
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}
