"use client";

import { useActionState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { acceptInvitationLifecycleAction } from "@/features/members/invitation-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export function AcceptInviteForm({ clinicId, invitationId }: { clinicId: string; invitationId?: string }) {
  const [state, formAction, pending] = useActionState(acceptInvitationLifecycleAction, {});

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="clinic_id" value={clinicId} />
      {invitationId ? <input type="hidden" name="invitation_id" value={invitationId} /> : null}
      <div className="grid gap-2">
        <Label htmlFor="invite-password">Crie sua senha</Label>
        <PasswordInput
          id="invite-password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          disabled={pending}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-password-confirm">Confirme sua senha</Label>
        <PasswordInput
          id="invite-password-confirm"
          name="password_confirm"
          autoComplete="new-password"
          minLength={8}
          disabled={pending}
          required
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button size="lg" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
        {pending ? "Ativando acesso..." : "Ativar meu acesso"}
      </Button>
    </form>
  );
}
