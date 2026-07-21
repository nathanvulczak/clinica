"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { signInAction } from "@/features/auth/actions";
import { normalizeEmail } from "@/lib/formatters";
import { isValidEmail } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, {});
  const [email, setEmail] = useState("");
  const showEmailError = email.length > 0 && !isValidEmail(email);

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(normalizeEmail(event.target.value))}
          aria-invalid={showEmailError}
          required
        />
        {showEmailError ? <p className="text-xs text-destructive">Informe um e-mail válido.</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Senha</Label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
        <div className="flex justify-end">
          <Link href="/recuperar-senha" className="text-xs font-medium text-primary hover:underline">Esqueci minha senha</Link>
        </div>
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        <LogIn />
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
