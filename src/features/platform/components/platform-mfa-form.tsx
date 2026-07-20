"use client";

import { useActionState } from "react";
import Image from "next/image";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { preparePlatformMfaAction, verifyPlatformMfaAction, type PlatformMfaState } from "@/features/platform/actions";

const initialState: PlatformMfaState = {};

export function PlatformMfaForm({ setup }: { setup: boolean }) {
  const [prepared, prepareAction, preparing] = useActionState(preparePlatformMfaAction, initialState);
  const [state, verifyAction, verifying] = useActionState(verifyPlatformMfaAction, initialState);
  const data = state.mode ? state : prepared;

  return (
    <div className="grid gap-4">
      {!data.mode ? <form action={prepareAction}><Button type="submit" disabled={preparing} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><KeyRound />{preparing ? "Preparando..." : setup ? "Configurar autenticador" : "Continuar"}</Button></form> : null}
      {data.mode === "setup" && data.qrCode ? <div className="grid gap-3 rounded-md border border-slate-700 bg-slate-950 p-4 text-center"><p className="text-sm text-slate-300">Leia o QR Code no seu aplicativo autenticador.</p><Image src={data.qrCode} alt="QR Code para configurar MFA" width={176} height={176} unoptimized className="mx-auto rounded bg-white p-2" /><p className="break-all text-[11px] text-slate-500">Chave manual: {data.secret}</p></div> : null}
      {data.mode ? <form action={verifyAction} className="grid gap-3"><input type="hidden" name="factor_id" value={data.factorId} /><div className="grid gap-2"><Label htmlFor="platform-mfa-code">Código de 6 dígitos</Label><Input id="platform-mfa-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" className="border-slate-700 bg-slate-950 text-center text-lg tracking-[0.35em] text-slate-100" required /></div>{state.error ? <p className="text-sm text-rose-300">{state.error}</p> : null}<Button type="submit" disabled={verifying} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"><ShieldCheck />{verifying ? "Validando..." : "Confirmar código"}</Button></form> : null}
      {prepared.error && !state.error ? <p className="text-sm text-rose-300">{prepared.error}</p> : null}
    </div>
  );
}
