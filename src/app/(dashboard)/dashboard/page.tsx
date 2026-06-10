import Link from "next/link";
import { Building2, CreditCard, ShieldCheck, Users } from "lucide-react";
import { PLAN_LIMITS } from "@/config/plans";
import { getActiveClinicContext } from "@/features/clinics/context";
import { AccessDeniedToast } from "@/components/app/access-denied-toast";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listClinicMembers } from "@/repositories/clinics";
import { getCurrentSubscription } from "@/repositories/subscriptions";
import { getClinicAuthorization } from "@/services/authorization/clinic-access";
import { getBillingAuthorization } from "@/services/billing/authorization";
import type { PlanSlug } from "@/types/domain";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string; module?: string }>;
}) {
  const params = await searchParams;
  const { clinics, activeClinic } = await getActiveClinicContext();
  const [authorization, billingAuthorization] = await Promise.all([
    getClinicAuthorization(activeClinic?.id),
    getBillingAuthorization(activeClinic),
  ]);
  const [subscription, members] = await Promise.all([
    billingAuthorization.canView && billingAuthorization.ownerUserId
      ? getCurrentSubscription(billingAuthorization.ownerUserId)
      : Promise.resolve(null),
    authorization.can("members", "view") || authorization.can("members", "manage")
      ? listClinicMembers(activeClinic?.id)
      : Promise.resolve([]),
  ]);
  const planLimit = subscription?.plan_slug ? PLAN_LIMITS[subscription.plan_slug as PlanSlug] : 0;
  const canCreateClinic =
    billingAuthorization.initialSignup || authorization.can("clinics", "create");

  return (
    <>
      <AccessDeniedToast denied={params.access === "denied"} module={params.module} />
      <PageHeader
        title="Painel operacional"
        description="Contexto por clínica, acesso por função e operação segura em uma base multi-tenant."
        action={
          canCreateClinic ? (
            <Button asChild>
              <Link href="/clinicas/nova">Nova clínica</Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clínica ativa</CardTitle>
            <Building2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="truncate text-2xl font-semibold">{activeClinic?.trade_name ?? "Pendente"}</p>
            <p className="text-xs text-muted-foreground">
              {billingAuthorization.canView
                ? `${clinics.length} de ${planLimit || "-"} clínicas no plano`
                : "contexto aplicado ao seu acesso"}
            </p>
          </CardContent>
        </Card>

        {billingAuthorization.canView ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Plano</CardTitle>
              <CreditCard className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold capitalize">{subscription?.plan_slug ?? "pendente"}</p>
              <p className="text-xs text-muted-foreground">{subscription?.status ?? "sem assinatura ativa"}</p>
            </CardContent>
          </Card>
        ) : null}

        {authorization.can("members", "view") || authorization.can("members", "manage") ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Membros</CardTitle>
              <Users className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{members.length}</p>
              <p className="text-xs text-muted-foreground">na clínica ativa</p>
            </CardContent>
          </Card>
        ) : null}

        {authorization.can("audit", "view") ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Auditoria</CardTitle>
              <ShieldCheck className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">LGPD</p>
              <p className="text-xs text-muted-foreground">rastreabilidade crítica</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
