import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ConfirmarEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const plan = params.plan ?? "singular";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-3 flex size-12 items-center justify-center rounded-md bg-accent text-primary">
            <MailCheck className="size-6" />
          </div>
          <CardTitle>Confirme seu e-mail</CardTitle>
          <CardDescription>
            Enviamos um link de confirmação para {params.email ?? "o e-mail cadastrado"}. Depois de confirmar,
            você será direcionado para escolher e assinar o plano.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button asChild>
            <Link href={`/login?next=/planos?selected=${plan}`}>Ir para login</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/planos?selected=${plan}`}>Ver planos</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
