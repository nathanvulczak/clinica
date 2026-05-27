import Link from "next/link";
import { Building2, CreditCard, ShieldCheck, Users } from "lucide-react";
import { PLAN_LIMITS } from "@/config/plans";
import { getActiveClinicContext } from "@/features/clinics/context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listClinicMembers } from "@/repositories/clinics";
import { getCurrentSubscription } from "@/repositories/subscriptions";
import type { PlanSlug } from "@/types/domain";

export default async function DashboardPage() {
  const [{ clinics, activeClinic }, subscription] = await Promise.all([
    getActiveClinicContext(),
    getCurrentSubscription(),
  ]);
  const members = await listClinicMembers(activeClinic?.id);
  const planLimit = subscription?.plan_slug ? PLAN_LIMITS[subscription.plan_slug as PlanSlug] : 0;

  return (
    <>
      <PageHeader
        title="Painel operacional"
        description="Contexto por clínica, assinatura, membros e auditoria em uma base multi-tenant."
        action={
          <Button asChild>
            <Link href="/clinicas/nova">Nova clínica</Link>
          </Button>
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
            <p className="text-xs text-muted-foreground">{clinics.length} de {planLimit || "-"} clínicas no plano</p>
          </CardContent>
        </Card>
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
      </div>
    </>
  );
}
