import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { NewPasswordForm } from "@/features/auth/components/new-password-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
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
          <CardTitle>Crie sua nova senha</CardTitle>
          <CardDescription>Escolha uma senha pessoal. O link de recuperacao e temporario e de uso unico.</CardDescription>
        </CardHeader>
        <CardContent><NewPasswordForm next={next} /></CardContent>
      </Card>
    </main>
  );
}
