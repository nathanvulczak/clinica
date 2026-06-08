-- CliniCore - Reset de dados de teste.
-- Use apenas em ambiente de desenvolvimento/teste.
-- Mantém estrutura, planos, catálogo de permissões e role_permissions globais.
-- Remove usuários, clínicas, assinaturas, invoices, auditoria, convites e avatars.
--
-- Importante: isto não apaga clientes/assinaturas no painel da Stripe.
-- Para um teste 100% limpo, cancele/remova também os clientes de teste na Stripe
-- ou use um novo e-mail de teste.

begin;

delete from storage.objects
where bucket_id = 'avatars';

delete from public.member_permissions;
delete from public.clinic_invitations;
delete from public.clinic_members;
delete from public.audit_logs;
delete from public.billing_events;
delete from public.invoices;
delete from public.subscriptions;
delete from public.clinics;
delete from public.profiles;
delete from auth.users;

insert into public.clinic_plans (slug, name, amount_cents, currency, max_clinics, active)
values
  ('singular', 'Singular', 10990, 'brl', 1, true),
  ('duo', 'Duo', 15990, 'brl', 2, true),
  ('master', 'Master', 20990, 'brl', 3, true)
on conflict (slug) do update
set name = excluded.name,
    amount_cents = excluded.amount_cents,
    currency = excluded.currency,
    max_clinics = excluded.max_clinics,
    active = excluded.active,
    updated_at = now();

commit;
