import Link from "next/link";
import { Building2 } from "lucide-react";
import { PLAN_LIMITS } from "@/config/plans";
import { getActiveClinicContext } from "@/features/clinics/context";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentSubscription } from "@/repositories/subscriptions";
import type { PlanSlug } from "@/types/domain";

export default async function ClinicasPage() {
  const [{ clinics, activeClinic }, subscription] = await Promise.all([
    getActiveClinicContext(),
    getCurrentSubscription(),
  ]);
  const limit = subscription?.plan_slug ? PLAN_LIMITS[subscription.plan_slug as PlanSlug] : 0;
  const canCreate = Boolean(subscription && ["active", "trialing"].includes(subscription.status) && clinics.length < limit);

  return (
    <>
      <PageHeader
        title="Gerenciar clínicas"
        description="Cadastro e operação multi-clínica respeitando limite do plano contratado."
        action={
          <Button asChild disabled={!canCreate}>
            <Link href="/clinicas/nova">Cadastrar clínica</Link>
          </Button>
        }
      />
      <div className="mb-4 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Plano atual: <span className="font-medium text-foreground capitalize">{subscription?.plan_slug ?? "pendente"}</span>.
        Uso: <span className="font-medium text-foreground">{clinics.length}</span> de{" "}
        <span className="font-medium text-foreground">{limit || "-"}</span> clínicas.
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {clinics.map((clinic) => (
          <Card key={clinic.id} className={clinic.id === activeClinic?.id ? "border-primary" : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-lg">
                <span className="flex items-center gap-2">
                  <Building2 className="size-5 text-primary" />
                  {clinic.trade_name}
                </span>
                {clinic.id === activeClinic?.id ? <Badge>Ativa</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-muted-foreground">
              <p>{clinic.legal_name}</p>
              <p>{[clinic.city, clinic.state].filter(Boolean).join(" / ") || "Endereço não informado"}</p>
              <p>{clinic.email ?? "E-mail administrativo não informado"}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {clinics.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="font-medium">Nenhuma clínica cadastrada.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Após a assinatura ficar ativa, cadastre a primeira clínica para iniciar a operação.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
