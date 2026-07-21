"use client";

import { useActionState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { updateRecoveredPasswordAction } from "@/features/auth/password-recovery";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export function NewPasswordForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(updateRecoveredPasswordAction, {});

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="next" value={next ?? "/login"} />
      <div className="grid gap-2">
        <Label htmlFor="new-password">Nova senha</Label>
        <PasswordInput id="new-password" name="password" autoComplete="new-password" minLength={8} disabled={pending} required />
        <p className="text-xs text-muted-foreground">Use pelo menos 8 caracteres, com maiuscula, minuscula e numero.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-password-confirm">Confirmar nova senha</Label>
        <PasswordInput id="new-password-confirm" name="password_confirm" autoComplete="new-password" minLength={8} disabled={pending} required />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
        {pending ? "Atualizando..." : "Criar nova senha"}
      </Button>
    </form>
  );
}
