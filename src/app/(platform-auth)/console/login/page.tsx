import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformLoginForm } from "@/features/platform/components/platform-login-form";

export default async function PlatformLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; password?: string }> }) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900 text-slate-100 shadow-2xl">
        <CardHeader className="gap-4">
          <Button asChild variant="ghost" className="w-fit px-0 text-slate-400 hover:bg-transparent hover:text-white">
            <Link href="/"><ArrowLeft />Voltar ao CliniCore</Link>
          </Button>
          <div className="flex size-10 items-center justify-center rounded-md bg-cyan-400/15 text-cyan-300"><ShieldCheck className="size-5" /></div>
          <div>
            <CardTitle className="text-xl">Console do Proprietário</CardTitle>
            <CardDescription className="mt-1 text-slate-400">Acesso técnico independente, sem clínica ativa e sem conteúdo assistencial.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {params.error === "access_denied" ? <p className="mb-4 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">Esta conta não está autorizada no Console do Proprietário.</p> : null}
          {params.password === "updated" ? <p className="mb-4 rounded-md border border-cyan-400/30 bg-cyan-400/10 p-3 text-xs text-cyan-200">Senha atualizada. Entre novamente e conclua a validação MFA.</p> : null}
          <PlatformLoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
