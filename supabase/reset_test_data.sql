-- CliniCore - Reset de dados de teste.
-- Use apenas em ambiente de desenvolvimento/teste.
-- Mantém estrutura, planos, catálogo de permissões e role_permissions globais.
-- Remove usuários, clínicas, assinaturas, invoices, auditoria e convites.
--
-- Importante: isto não apaga clientes/assinaturas no painel da Stripe.
-- Para um teste 100% limpo, cancele/remova também os clientes de teste na Stripe
-- ou use um novo e-mail de teste.
--
-- Este SQL também não apaga arquivos do Supabase Storage, porque o Supabase
-- bloqueia delete direto em storage.objects. Para limpar avatars, use a tela
-- Storage do Supabase ou a Storage API.

begin;

do $$
declare
  agenda_table text;
begin
  foreach agenda_table in array array[
    'appointment_workflow_events',
    'appointments',
    'schedule_blocks',
    'schedule_professional_settings',
    'patients'
  ]
  loop
    if to_regclass(format('public.%I', agenda_table)) is not null then
      execute format('delete from public.%I', agenda_table);
    end if;
  end loop;
end $$;

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
