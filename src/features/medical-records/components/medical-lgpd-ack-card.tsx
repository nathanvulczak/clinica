"use client";

import { useActionState, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { MEDICAL_RECORD_LGPD_ACK_TEXT } from "@/features/medical-records/config";
import {
  acknowledgeMedicalLgpdAction,
  type MedicalRecordActionState,
} from "@/features/medical-records/actions";

export function MedicalLgpdAckCard({ acceptedAt }: { acceptedAt?: string | null }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<MedicalRecordActionState, FormData>(
    acknowledgeMedicalLgpdAction,
    {},
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) {
      toast({ title: "Ciencia LGPD nao registrada", description: state.error, variant: "destructive" });
    }
    if (state.success) {
      toast({ title: "LGPD", description: state.success });
      setOpen(false);
    }
  }, [state.error, state.success, toast]);

  if (acceptedAt) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-emerald-500/5 p-4 text-sm text-emerald-800">
        <ShieldCheck className="size-5" />
        Ciencia LGPD registrada para acesso a dados clinicos sensiveis.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="font-medium">Ciencia LGPD pendente</p>
          <p className="mt-1">
            Antes de manipular prontuarios, confirme a ciencia sobre sigilo, finalidade e rastreabilidade.
          </p>
        </div>
        <Button type="button" onClick={() => setOpen(true)}>
          <ShieldCheck />
          Ler e confirmar
        </Button>
      </div>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Ciencia sobre dados clinicos sensiveis"
        description="Modelo operacional de ciencia interna. A clinica deve validar juridicamente seus termos finais."
        className="max-w-2xl"
      >
        <form action={formAction} className="grid gap-4">
          <div className="rounded-md border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
            {MEDICAL_RECORD_LGPD_ACK_TEXT}
          </div>
          <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
            Observacao: este modelo nao substitui assessoria juridica. Ele serve para registrar ciencia,
            finalidade assistencial, sigilo e auditoria no uso do sistema.
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={pending}>
              <ShieldCheck />
              {pending ? "Registrando..." : "Confirmo ciencia"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
