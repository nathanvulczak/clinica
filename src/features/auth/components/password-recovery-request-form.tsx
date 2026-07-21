"use client";

import { useActionState, useEffect, useState } from "react";
import { LoaderCircle, Mail } from "lucide-react";
import { requestPasswordResetAction } from "@/features/auth/password-recovery";
import { normalizeEmail } from "@/lib/formatters";
import { isValidEmail } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordRecoveryRequestForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, {});
  const [email, setEmail] = useState("");
  const invalidEmail = email.length > 0 && !isValidEmail(email);

  useEffect(() => {
    if (state.success) setEmail("");
  }, [state.success]);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="next" value={next ?? "/login"} />
      <div className="grid gap-2">
        <Label htmlFor="recovery-email">E-mail</Label>
        <Input id="recovery-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(normalizeEmail(event.target.value))} aria-invalid={invalidEmail} required />
        {invalidEmail ? <p className="text-xs text-destructive">Informe um e-mail valido.</p> : null}
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm leading-6 text-primary">{state.success}</p> : null}
      <Button type="submit" disabled={pending || invalidEmail}>
        {pending ? <LoaderCircle className="animate-spin" /> : <Mail />}
        {pending ? "Enviando..." : "Enviar link de recuperacao"}
      </Button>
    </form>
  );
}
