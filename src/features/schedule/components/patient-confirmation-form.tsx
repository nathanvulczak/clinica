"use client";

import { useActionState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { confirmPatientAppointmentAction } from "@/features/schedule/actions";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

export function PatientConfirmationForm({
  token,
  disabled,
}: {
  token: string;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState(confirmPatientAppointmentAction, {});

  useEffect(() => {
    if (state.success) {
      toast({ title: state.success, description: "A clínica já pode visualizar sua confirmação." });
    }

    if (state.error) {
      toast({ title: "Confirmação não concluída", description: state.error, variant: "destructive" });
    }
  }, [state.error, state.success, toast]);

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-primary">{state.success}</p> : null}
      <Button size="lg" disabled={disabled || pending}>
        <CheckCircle2 />
        {pending ? "Confirmando..." : "Confirmar consulta"}
      </Button>
    </form>
  );
}
