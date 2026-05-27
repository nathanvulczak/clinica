import Link from "next/link";
import { ArrowRight, CalendarDays, LockKeyhole, ShieldCheck, Stethoscope } from "lucide-react";
import { PlanCards } from "@/features/billing/components/plan-cards";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const capabilities = [
  "Multi-tenant com isolamento por clínica",
  "RBAC por módulo e ação",
  "Stripe Checkout e Customer Portal",
  "Auditoria completa para LGPD",
];

export default function Home() {
  return (
    <main>
      <section className="border-b bg-[linear-gradient(135deg,#fbfbfa_0%,#e4f2ee_45%,#fff7ed_100%)]">
        <div className="mx-auto grid min-h-[88vh] max-w-7xl items-center gap-10 px-4 py-12 lg:grid-cols-[1fr_440px] lg:px-8">
          <div className="max-w-3xl">
            <Badge>Next.js 15 + Supabase + Stripe</Badge>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-normal sm:text-6xl">
              CliniCore
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Plataforma SaaS para clínicas de saúde com gestão multi-clínica, permissões granulares,
              assinatura recorrente e auditoria pronta para operação profissional.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/cadastro">
                  Começar agora
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Acessar conta</Link>
              </Button>
            </div>
            <div className="mt-8 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              {capabilities.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <div className="grid gap-4">
              <div className="flex items-center justify-between rounded-md border bg-background p-4">
                <div>
                  <p className="text-sm text-muted-foreground">Operação de hoje</p>
                  <p className="text-2xl font-semibold">128 atendimentos</p>
                </div>
                <CalendarDays className="size-8 text-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-md border bg-background p-4">
                  <Stethoscope className="mb-3 size-5 text-primary" />
                  <p className="text-xl font-semibold">24</p>
                  <p className="text-sm text-muted-foreground">profissionais</p>
                </div>
                <div className="rounded-md border bg-background p-4">
                  <LockKeyhole className="mb-3 size-5 text-primary" />
                  <p className="text-xl font-semibold">RLS</p>
                  <p className="text-sm text-muted-foreground">isolamento total</p>
                </div>
              </div>
              <div className="rounded-md border bg-background p-4">
                <p className="text-sm font-medium">Auditoria crítica</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Login, permissões, prontuário, faturamento e alterações clínicas com IP,
                  dispositivo, valores antigos e novos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8" id="planos">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">Planos mensais</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Limites por quantidade de clínicas, com upgrade e downgrade preparados no billing.
          </p>
        </div>
        <PlanCards />
      </section>
    </main>
  );
}
