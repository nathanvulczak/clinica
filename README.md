# CliniCore

SaaS multi-tenant para clínicas de saúde, com Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Supabase, PostgreSQL, Supabase Auth, RLS e Stripe.

## Stack

- Frontend: Next.js 15, TypeScript, Tailwind CSS, shadcn/ui.
- Backend: Supabase, PostgreSQL, Supabase Auth, RLS.
- Billing: Stripe Checkout, Stripe Customer Portal e Webhooks.
- Deploy: Vercel.

## Rodar local

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Variáveis de ambiente

Crie `.env.local` com base em `.env.example`.

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_PRICE_SINGULAR=price_xxx
STRIPE_PRICE_DUO=price_xxx
STRIPE_PRICE_MASTER=price_xxx
```

## Banco

Execute no Supabase, nesta ordem:

```text
supabase/migrations/001_initial_enterprise_foundation.sql
supabase/migrations/002_clinic_context_members_foundation.sql
supabase/migrations/003_billing_profile_hardening.sql
supabase/migrations/004_clinic_creation_policy_fix.sql
```

A migration cria:

- `profiles`, `clinics`, `clinic_members`
- planos, assinaturas, invoices e eventos de billing
- catálogo de permissões, permissões por role e por membro
- convites
- `audit_logs`
- funções RBAC e multi-tenant
- triggers de perfil, owner da primeira clínica e `updated_at`
- policies RLS e índices

## Fluxo inicial

1. Usuário cria conta com nome, CPF, e-mail, telefone, senha e plano desejado.
2. Usuário assina pelo Stripe Checkout.
3. Webhook salva assinatura, customer, subscription, status e invoices.
4. Usuário faz login.
5. Usuário cadastra a primeira clínica.
6. Trigger cria o vínculo `clinic_owner`.
7. RLS limita acesso por vínculo em `clinic_members`.

Com confirmação de e-mail ativa no Supabase, o cadastro redireciona para `/confirmar-email`.
O link do e-mail deve apontar para `/auth/callback`, que troca o `code` por sessão e envia o usuário para `/planos`.

## Qualidade

```bash
npm run lint
npm run build
```
"# clinica" 
