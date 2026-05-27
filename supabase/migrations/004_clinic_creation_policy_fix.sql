-- Fase 2.2 - Corrige regra de criação da primeira clínica.
-- A primeira clínica ainda não possui clinic_members antes do insert; por isso o limite deve contar clinics.created_by.

create or replace function public.can_create_clinic(user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with active_subscription as (
    select cp.max_clinics
    from public.subscriptions s
    join public.clinic_plans cp on cp.slug = s.plan_slug
    where s.owner_user_id = user_uuid
      and s.status in ('active', 'trialing')
      and s.deleted_at is null
    limit 1
  ),
  owned_clinics as (
    select count(*)::integer as total
    from public.clinics c
    where c.created_by = user_uuid
      and c.deleted_at is null
  )
  select public.is_platform_admin(user_uuid)
    or exists (
      select 1
      from active_subscription s, owned_clinics o
      where o.total < s.max_clinics
    );
$$;

-- Repara assinaturas que chegaram ativas sem período por causa de SDK/API Stripe nova.
-- O app passa a preencher isso no próximo sync/checkout/webhook.
