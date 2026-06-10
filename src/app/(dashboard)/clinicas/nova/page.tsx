import Link from "next/link";
import { redirect } from "next/navigation";
import { PLAN_LIMITS } from "@/config/plans";
import { getActiveClinicContext } from "@/features/clinics/context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClinicForm } from "@/features/clinics/components/clinic-form";
import { getCurrentSubscription } from "@/repositories/subscriptions";
import type { PlanSlug } from "@/types/domain";
import { getBillingAuthorization } from "@/services/billing/authorization";

export default async function NovaClinicaPage() {
  const { clinics } = await getActiveClinicContext();
  const billingAuthorization = await getBillingAuthorization();

  if (!billingAuthorization.canManage || !billingAuthorization.ownerUserId) {
    redirect("/dashboard?access=denied&module=clinics");
  }

  const subscription = await getCurrentSubscription(billingAuthorization.ownerUserId);
  const limit = subscription?.plan_slug ? PLAN_LIMITS[subscription.plan_slug as PlanSlug] : 0;
  const hasActiveSubscription = Boolean(subscription && ["active", "trialing"].includes(subscription.status));
  const reachedLimit = hasActiveSubscription && clinics.length >= limit;

  return (
    <>
      <PageHeader
        title="Cadastrar clínica"
        description="A assinatura e o limite do plano são validados antes da gravação e também pelo RLS do banco."
      />
      {!hasActiveSubscription ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Assinatura necessária</CardTitle>
            <CardDescription>
              Para cadastrar clínicas, sua assinatura precisa estar ativa ou em trial. Se você acabou de pagar,
              aguarde o webhook do Stripe processar ou confira a página de assinatura.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/assinatura">Ver assinatura</Link>
            </Button>
          </CardContent>
        </Card>
      ) : reachedLimit ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Limite do plano atingido</CardTitle>
            <CardDescription>
              Seu plano atual permite até {limit} clínica{limit > 1 ? "s" : ""}. Faça upgrade para cadastrar
              uma nova unidade.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/assinatura">Fazer upgrade</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Dados principais</CardTitle>
            <CardDescription>O primeiro usuário vinculado à clínica será criado como proprietário.</CardDescription>
          </CardHeader>
          <CardContent>
            <ClinicForm />
          </CardContent>
        </Card>
      )}
    </>
  );
}
