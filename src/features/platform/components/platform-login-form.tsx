"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { platformLoginAction, type PlatformLoginState } from "@/features/platform/actions";

const initialState: PlatformLoginState = {};

export function PlatformLoginForm() {
  const [state, formAction, pending] = useActionState(platformLoginAction, initialState);
  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="console-email">E-mail do proprietário</Label><Input id="console-email" name="email" type="email" autoComplete="username" className="border-slate-700 bg-slate-950 text-slate-100" required /></div>
      <div className="grid gap-2"><Label htmlFor="console-password">Senha</Label><PasswordInput id="console-password" name="password" autoComplete="current-password" className="border-slate-700 bg-slate-950 text-slate-100" required /><div className="flex justify-end"><Link href="/recuperar-senha?next=%2Fconsole%2Flogin" className="text-xs text-cyan-300 hover:underline">Esqueci minha senha</Link></div></div>
      {state.error ? <p className="text-sm text-rose-300">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><LogIn />{pending ? "Validando..." : "Entrar no console"}</Button>
      <p className="text-center text-[11px] text-slate-500">O acesso é concedido por uma conta técnica cadastrada em `platform_operators`.</p>
    </form>
  );
}
