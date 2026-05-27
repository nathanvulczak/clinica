import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SignupForm } from "@/features/auth/components/signup-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <Button asChild variant="ghost" className="mb-2 w-fit px-0">
            <Link href="/">
              <ArrowLeft />
              Voltar para o início
            </Link>
          </Button>
          <CardTitle>Criar conta</CardTitle>
          <CardDescription>
            O primeiro usuário da clínica será proprietário e poderá gerenciar membros e permissões.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm selectedPlan={params.plan} />
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link className="font-medium text-primary" href="/login">
              Entrar
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
