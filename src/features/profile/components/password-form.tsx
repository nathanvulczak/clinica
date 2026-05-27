"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { updatePasswordAction } from "@/features/profile/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, {});

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="password">Nova senha</Label>
        <PasswordInput id="password" name="password" minLength={8} required />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-primary">{state.success}</p> : null}
      <Button disabled={pending}>
        <KeyRound />
        {pending ? "Alterando..." : "Alterar senha"}
      </Button>
    </form>
  );
}
