import { PlanCards } from "@/features/billing/components/plan-cards";

export default async function PlanosPage({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string; signup?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-10 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Escolha seu plano</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {params.signup
            ? "Conta criada. Se a confirmação de e-mail estiver ativa no Supabase, confirme o e-mail antes do pagamento."
            : "Assine com Stripe Checkout e gerencie upgrades ou downgrades pelo portal do cliente."}
        </p>
      </div>
      <PlanCards selected={params.selected} />
    </main>
  );
}
