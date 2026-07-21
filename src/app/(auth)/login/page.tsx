import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LoginForm } from "@/features/auth/components/login-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; invite?: string; password?: string }>;
}) {
  const params = await searchParams;
  const inviteMessage =
    params.invite === "expired"
      ? "O link do convite expirou. Solicite um novo acesso ao administrador da clínica."
      : params.invite === "invalid"
        ? "Este convite não está mais disponível ou não pertence ao usuário autenticado."
        : null;
  const passwordMessage = params.password === "updated" ? "Senha atualizada. Entre com sua nova senha." : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Button asChild variant="ghost" className="mb-2 w-fit px-0">
            <Link href="/">
              <ArrowLeft />
              Voltar para o início
            </Link>
          </Button>
          <CardTitle>Entrar</CardTitle>
          <CardDescription>Acesse o painel da sua clínica.</CardDescription>
        </CardHeader>
        <CardContent>
          {inviteMessage ? (
            <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800">
              {inviteMessage}
            </div>
          ) : null}
          {passwordMessage ? (
            <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary">{passwordMessage}</div>
          ) : null}
          <LoginForm next={params.next} />
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Ainda não tem conta?{" "}
            <Link className="font-medium text-primary" href="/cadastro">
              Cadastre-se
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
