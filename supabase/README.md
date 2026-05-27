# Supabase

Execute os arquivos em ordem no SQL Editor do Supabase:

1. `migrations/001_initial_enterprise_foundation.sql`
2. `migrations/002_clinic_context_members_foundation.sql`
3. `migrations/003_billing_profile_hardening.sql`
4. `migrations/004_clinic_creation_policy_fix.sql`

Depois configure:

- Auth: habilite e-mail/senha.
- Site URL: `http://localhost:3000` em desenvolvimento e a URL Vercel em produção.
- Redirect URLs: `http://localhost:3000/auth/callback`, `http://localhost:3000/dashboard`, `http://localhost:3000/login`.
- Stripe webhook: aponte para `/api/stripe/webhook`.

As tabelas tenant-scoped usam `clinic_id`. `profiles`, `clinic_plans` e parte do billing ficam globais por design para manter autenticação e vínculo com clínicas desacoplados.
