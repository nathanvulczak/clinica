"use client";

import { useActionState, useEffect } from "react";
import { KeyRound } from "lucide-react";
import { updatePasswordAction } from "@/features/profile/actions";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, {});
  const { toast } = useToast();

  useEffect(() => {
    if (state.success) {
      toast({ title: state.success, description: "Use a nova senha no próximo acesso." });
    }

    if (state.error) {
      toast({ title: "Senha não alterada", description: state.error, variant: "destructive" });
    }
  }, [state.error, state.success, toast]);

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
