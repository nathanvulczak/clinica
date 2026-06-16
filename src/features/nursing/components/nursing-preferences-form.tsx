"use client";

import { useActionState, useEffect } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { NURSING_FIELD_OPTIONS } from "@/features/nursing/config";
import {
  upsertNursingPreferencesAction,
  type NursingActionState,
} from "@/features/nursing/actions";
import type { NursingPreferences } from "@/repositories/nursing";

export function NursingPreferencesForm({
  preferences,
  canEdit,
}: {
  preferences: NursingPreferences;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState<NursingActionState, FormData>(
    upsertNursingPreferencesAction,
    {},
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) {
      toast({ title: "Preferências não salvas", description: state.error, variant: "destructive" });
    }
    if (state.success) {
      toast({ title: "Enfermagem", description: state.success });
    }
  }, [state.error, state.success, toast]);

  return (
    <form action={formAction} className="grid gap-5 rounded-lg border bg-card p-4">
      <div>
        <p className="text-sm font-medium">Campos obrigatórios da pré-consulta</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ao salvar ou encerrar uma ficha, o sistema valida estes campos e informa exatamente o
          que ficou pendente.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {NURSING_FIELD_OPTIONS.map((field) => (
          <label
            key={field.key}
            className="flex items-start gap-3 rounded-md border bg-background p-3 text-sm"
          >
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
            <span className="block font-medium">Permitir correções</span>
            <span className="text-xs text-muted-foreground">
              Usuários autorizados podem corrigir fichas encerradas.
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
              Correções de fichas encerradas precisam de justificativa.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-md border bg-background p-3 text-sm">
          <input
            type="checkbox"
            name="show_required_field_alerts"
            defaultChecked={preferences.show_required_field_alerts}
            disabled={!canEdit || pending}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">Alertas na ficha</span>
            <span className="text-xs text-muted-foreground">
              Exibe aviso sobre campos obrigatórios antes do preenchimento.
            </span>
          </span>
        </label>
      </div>

      <div className="flex justify-end">
        <Button disabled={!canEdit || pending}>
          <Save />
          {pending ? "Salvando..." : "Salvar preferências"}
        </Button>
      </div>
    </form>
  );
}
