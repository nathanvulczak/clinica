"use client";

import { useActionState, useEffect } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MEDICAL_RECORD_FIELD_OPTIONS } from "@/features/medical-records/config";
import {
  upsertMedicalRecordPreferencesAction,
  type MedicalRecordActionState,
} from "@/features/medical-records/actions";
import type { MedicalRecordPreferences } from "@/repositories/medical-records";

export function MedicalRecordPreferencesForm({
  preferences,
  canEdit,
}: {
  preferences: MedicalRecordPreferences;
  canEdit: boolean;
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
    <form action={formAction} className="grid gap-5 rounded-lg border bg-card p-4">
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
