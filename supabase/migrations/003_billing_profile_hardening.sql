-- Fase 2.1 - Hardening de billing, perfil e dados legados.

alter table public.profiles
add column if not exists avatar_url text;

alter table public.profiles
add column if not exists last_login_at timestamptz;

create index if not exists idx_subscriptions_stripe_customer
on public.subscriptions(stripe_customer_id)
where deleted_at is null and stripe_customer_id is not null;

create index if not exists idx_subscriptions_stripe_subscription
on public.subscriptions(stripe_subscription_id)
where deleted_at is null and stripe_subscription_id is not null;

-- IDs de assinatura Stripe válidos começam com sub_. Valores si_ são subscription items e quebram o Customer Portal.
update public.subscriptions
set stripe_subscription_id = null,
    status = case when status in ('active', 'trialing', 'past_due') then 'inactive'::public.subscription_status else status end,
    updated_at = now()
where stripe_subscription_id is not null
  and stripe_subscription_id not like 'sub_%';

create or replace function public.mark_login_from_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.action_type = 'login' and new.user_id is not null then
    update public.profiles
    set last_login_at = new.created_at,
        updated_at = now()
    where id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists mark_login_from_audit_after_insert on public.audit_logs;
create trigger mark_login_from_audit_after_insert
after insert on public.audit_logs
for each row execute function public.mark_login_from_audit();

drop policy if exists "audit_logs_read_own_security_events" on public.audit_logs;
create policy "audit_logs_read_own_security_events"
on public.audit_logs for select
to authenticated
using (
  user_id = auth.uid()
  and action_type in ('login', 'logout', 'password_changed')
);
