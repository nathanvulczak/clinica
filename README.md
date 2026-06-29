# CliniCore

SaaS multi-tenant para clínicas de saúde, construído com Next.js 15,
TypeScript, Tailwind CSS, Supabase, PostgreSQL, RLS e Stripe.

## Stack

- Frontend: Next.js 15, TypeScript, Tailwind CSS e shadcn/ui.
- Backend: Supabase, PostgreSQL, Supabase Auth e RLS.
- Billing: Stripe Checkout, Customer Portal e Webhooks.
- Deploy: Vercel.

## Desenvolvimento local

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## Ambiente

Crie `.env.local` com base em `.env.example`.

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_SINGULAR=price_xxx
STRIPE_PRICE_DUO=price_xxx
STRIPE_PRICE_MASTER=price_xxx

RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL="CliniCore <agenda@seu-dominio.com.br>"
```

## Banco

As migrations devem ser aplicadas na ordem numérica. A lista completa,
orientações de implantação e os testes de RLS estão em
[`supabase/README.md`](supabase/README.md).

O banco inclui:

- perfis, clínicas, membros e permissões por clínica;
- assinatura, pagamentos e histórico Stripe;
- auditoria e rastreabilidade;
- pacientes, profissionais, serviços e consultórios;
- agenda, disponibilidade, bloqueios e fluxo operacional;
- notificações de confirmação;
- RLS, índices, soft delete e isolamento multi-tenant.

## Fluxo inicial

1. O usuário cria a conta.
2. Contrata um plano pelo Stripe Checkout.
3. O webhook sincroniza a assinatura.
4. O usuário acessa o sistema e cadastra a primeira clínica.
5. O criador é vinculado como `clinic_owner`.
6. Convites, RBAC e RLS controlam os demais acessos.

## Qualidade

```bash
npm run lint
npm run typecheck
npm run build
npm run db:migration:check
npm run db:health
npm run stripe:health
```

O processo de migrations, testes transacionais, segurança e recuperação está
documentado em [`docs/quality-security.md`](docs/quality-security.md).
