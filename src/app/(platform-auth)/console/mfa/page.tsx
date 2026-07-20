import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformMfaForm } from "@/features/platform/components/platform-mfa-form";
import { getPlatformAccess } from "@/services/authorization/platform-access";

export default async function PlatformMfaPage({ searchParams }: { searchParams: Promise<{ setup?: string; verify?: string }> }) {
  const access = await getPlatformAccess();
  if (!access.allowed) redirect("/console/login");
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <Card className="w-full max-w-lg border-slate-800 bg-slate-900 text-slate-100 shadow-2xl">
        <CardHeader><div className="flex size-10 items-center justify-center rounded-md bg-cyan-400/15 text-cyan-300"><ShieldCheck className="size-5" /></div><CardTitle className="mt-3 text-xl">Verificação de segurança</CardTitle><CardDescription className="text-slate-400">O Console exige autenticação multifator. O código nunca é armazenado pelo CliniCore.</CardDescription></CardHeader>
        <CardContent><PlatformMfaForm setup={params.setup === "required"} /></CardContent>
      </Card>
    </main>
  );
}
