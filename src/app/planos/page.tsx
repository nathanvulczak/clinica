import Link from "next/link";
import { redirect } from "next/navigation";
import { PlanCards } from "@/features/billing/components/plan-cards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasBillableAccess } from "@/services/billing/access";
import { syncUserSubscriptionFromStripe } from "@/services/billing/stripe-sync";
import type { PlanSlug, SubscriptionStatus, SubscriptionSummary } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type PlanosSearchParams = {
  selected?: string;
  signup?: string;
  reason?: string;
  checkout?: string;
  checkout_error?: string;
  details?: string;
};

export default async function PlanosPage({
  searchParams,
}: {
  searchParams: Promise<PlanosSearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let subscription: SubscriptionSummary | null = null;

  if (user) {
    const { data } = await supabase
      .from("subscriptions")
      .select("plan_slug, status, current_period_end, stripe_customer_id, stripe_subscription_id, cancel_at_period_end")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    subscription = data as SubscriptionSummary | null;

    if (!hasBillableAccess(subscription)) {
      try {
        subscription = (await syncUserSubscriptionFromStripe({
          ownerUserId: user.id,
          email: user.email,
        })) as SubscriptionSummary | null;
      } catch {
        // The page still renders checkout options if Stripe repair is unavailable.
      }
    }

    if (params.reason === "subscription_required" && hasBillableAccess(subscription)) {
      redirect("/clinicas/nova?checkout=recovered");
    }
  }

  const checkoutErrorMessages: Record<string, string> = {
    missing_session: "Sessão de pagamento ausente. Escolha um plano para iniciar novamente.",
    sync_failed: "Pagamento confirmado, mas a sincronização automática falhou. Tente entrar novamente ou use o botão Sincronizar em Assinatura.",
    missing_stripe_secret_key: "Configure STRIPE_SECRET_KEY na Vercel e faça redeploy.",
    missing_supabase_service_role_key: "Configure SUPABASE_SERVICE_ROLE_KEY na Vercel e faça redeploy.",
    missing_stripe_price_singular: "Configure STRIPE_PRICE_SINGULAR na Vercel e faça redeploy.",
    missing_stripe_price_duo: "Configure STRIPE_PRICE_DUO na Vercel e faça redeploy.",
    missing_stripe_price_master: "Configure STRIPE_PRICE_MASTER na Vercel e faça redeploy.",
    stripe_customer_failed: "A Stripe recusou a criação do cliente. Confira a chave secreta e o modo teste.",
    stripe_checkout_failed: "A Stripe recusou a sessão de checkout. Confira se o price_id existe nessa conta Stripe.",
    stripe_portal_failed: "Não foi possível abrir o portal Stripe. Confira a configuração do Customer Portal.",
    stripe_subscription_sync_failed: "Não foi possível sincronizar a assinatura com a Stripe.",
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-10 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          {params.reason === "subscription_required" ? (
            <Badge className="mb-3">Assinatura necessária</Badge>
          ) : null}
          {!user ? <Badge className="mb-3">Cadastro necessário</Badge> : null}
          <h1 className="text-3xl font-semibold">Escolha seu plano</h1>
          {params.checkout_error ? (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {checkoutErrorMessages[params.checkout_error] ?? "Não foi possível iniciar o checkout."}
              {params.details ? (
                <p className="mt-2 text-xs opacity-80">Detalhe técnico: {decodeURIComponent(params.details)}</p>
              ) : null}
            </div>
          ) : null}
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {!user
              ? "Para assinar, primeiro crie sua conta ou entre com um usuário existente. Depois disso o checkout será aberto com segurança."
              : params.reason === "subscription_required"
                ? "Estamos verificando sua assinatura. Se o pagamento já foi aprovado, a sincronização será recuperada automaticamente; caso contrário, escolha um plano."
                : params.checkout === "cancelled"
                  ? "Checkout cancelado. Nenhum plano foi assinado; escolha um plano para continuar."
                  : params.signup
                    ? "Conta criada. Se a confirmação de e-mail estiver ativa no Supabase, confirme o e-mail antes do pagamento."
                    : "Assine com Stripe Checkout e gerencie upgrades ou downgrades pelo portal do cliente."}
          </p>
        </div>
        {!user ? (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/login?next=/api/billing/checkout?plan=${params.selected ?? "singular"}`}>Entrar</Link>
            </Button>
            <Button asChild>
              <Link href={`/cadastro?plan=${params.selected ?? "singular"}`}>Criar conta</Link>
            </Button>
          </div>
        ) : null}
      </div>
      <PlanCards
        selected={params.selected}
        currentPlan={subscription?.plan_slug as PlanSlug | undefined}
        subscriptionStatus={subscription?.status as SubscriptionStatus | undefined}
        isAuthenticated={Boolean(user)}
      />
    </main>
  );
}
