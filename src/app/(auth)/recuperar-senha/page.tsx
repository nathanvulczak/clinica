import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { PasswordRecoveryRequestForm } from "@/features/auth/components/password-recovery-request-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function RecoverPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ recovery?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next === "/console/login" ? params.next : undefined;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Button asChild variant="ghost" className="mb-2 w-fit px-0">
            <Link href={next ?? "/login"}><ArrowLeft />Voltar ao login</Link>
          </Button>
          <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary"><KeyRound className="size-5" /></div>
          <CardTitle>Redefinir senha</CardTitle>
          <CardDescription>Informe seu e-mail e enviaremos um link temporario para criar uma nova senha.</CardDescription>
        </CardHeader>
        <CardContent>
          {params.recovery === "expired" ? <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800">O link de recuperacao expirou. Solicite um novo link.</p> : null}
          <PasswordRecoveryRequestForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}
