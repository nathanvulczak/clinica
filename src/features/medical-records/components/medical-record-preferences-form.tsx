"use client";

import { useActionState, useEffect } from "react";
import { Layers3, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MEDICAL_RECORD_FIELD_OPTIONS } from "@/features/medical-records/config";
import {
  upsertMedicalRecordPreferencesAction,
  type MedicalRecordActionState,
} from "@/features/medical-records/actions";
import type { MedicalRecordPreferences } from "@/repositories/medical-records";
import type { ClinicalFormTemplate } from "@/repositories/clinical-forms";

export function MedicalRecordPreferencesForm({
  preferences,
  canEdit,
  templates,
}: {
  preferences: MedicalRecordPreferences;
  canEdit: boolean;
  templates: ClinicalFormTemplate[];
}) {
  const [state, formAction, pending] = useActionState<MedicalRecordActionState, FormData>(
    upsertMedicalRecordPreferencesAction,
    {},
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) {
      toast({ title: "Preferencias nao salvas", description: state.error, variant: "destructive" });
    }
    if (state.success) {
      toast({ title: "Prontuarios", description: state.success });
    }
  }, [state.error, state.success, toast]);

  return (
    <form action={formAction} className="grid gap-5 rounded-md border bg-card p-4">
      <section className="grid gap-4 border-b pb-5">
        <div className="flex items-start gap-3">
          <div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><Layers3 className="size-4" /></div>
          <div><p className="text-sm font-semibold">Pacotes por especialidade</p><p className="mt-1 text-xs text-muted-foreground">Defina quais layouts clínicos ficam disponíveis e qual será usado quando não houver regra para o profissional ou serviço.</p></div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
          <div className="grid content-start gap-3">
            <label className="grid gap-1.5 text-xs font-medium">
              Especialidade padrão
              <select name="default_specialty_slug" defaultValue={preferences.default_specialty_slug} disabled={!canEdit || pending} className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {templates.map((template) => <option key={template.id} value={template.specialty_slug}>{template.name}</option>)}
              </select>
            </label>
            <label className="flex items-start gap-3 rounded-md border bg-background p-3 text-xs">
              <input type="checkbox" name="allow_professional_template_choice" defaultChecked={preferences.allow_professional_template_choice} disabled={!canEdit || pending} className="mt-0.5" />
              <span><span className="block font-medium">Permitir troca no rascunho</span><span className="mt-1 block text-muted-foreground">O profissional pode escolher outro layout antes de concluir o atendimento.</span></span>
            </label>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {templates.map((template) => (
              <label key={template.id} className="flex items-start gap-3 rounded-md border bg-background p-3 text-xs">
                <input type="checkbox" name="active_specialty_slugs" value={template.specialty_slug} defaultChecked={template.active} disabled={!canEdit || pending} className="mt-0.5" />
                <span><span className="block font-medium">{template.name}</span><span className="mt-1 line-clamp-2 block text-muted-foreground">{template.description}</span></span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <div>
        <p className="text-sm font-medium">Campos obrigatorios para finalizar consulta</p>
        <p className="mt-1 text-sm text-muted-foreground">
          O sistema permite rascunho livre, mas valida estes campos ao concluir o atendimento.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {MEDICAL_RECORD_FIELD_OPTIONS.map((field) => (
          <label key={field.key} className="flex items-start gap-3 rounded-md border bg-background p-3 text-sm">
            <input
              type="checkbox"
              name="required_fields"
              value={field.key}
              defaultChecked={preferences.required_fields.includes(field.key)}
              disabled={!canEdit || pending}
              className="mt-1"
            />
            <span>
              <span className="block font-medium">{field.label}</span>
              <span className="text-xs text-muted-foreground">{field.group}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="grid gap-3 border-t pt-4 lg:grid-cols-3">
        <label className="flex items-start gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="allow_completed_corrections"
            defaultChecked={preferences.allow_completed_corrections}
            disabled={!canEdit || pending}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">Permitir correcoes</span>
            <span className="text-xs text-muted-foreground">
              Profissionais autorizados podem corrigir prontuarios concluidos.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="require_correction_reason"
            defaultChecked={preferences.require_correction_reason}
            disabled={!canEdit || pending}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">Exigir motivo</span>
            <span className="text-xs text-muted-foreground">
              Correcoes de prontuarios concluidos precisam de justificativa.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="show_nursing_summary"
            defaultChecked={preferences.show_nursing_summary}
            disabled={!canEdit || pending}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">Resumo da Enfermagem</span>
            <span className="text-xs text-muted-foreground">
              Exibe dados da pre-consulta dentro do prontuario.
            </span>
          </span>
        </label>
      </div>

      <div className="flex justify-end">
        <Button disabled={!canEdit || pending}>
          <Save />
          {pending ? "Salvando..." : "Salvar preferencias"}
        </Button>
      </div>
    </form>
  );
}
