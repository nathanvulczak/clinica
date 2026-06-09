-- CliniCore - acesso de membros convidados pela assinatura da clínica.
-- Execute depois de 010_professional_registration.sql.

drop function if exists public.user_has_billable_access(uuid);

create or replace function public.user_has_billable_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin(auth.uid())
    or exists (
      select 1
      from public.subscriptions s
      where s.owner_user_id = auth.uid()
        and s.deleted_at is null
        and (
          s.status in ('active', 'trialing')
          or (
            s.status = 'past_due'
            and s.current_period_end is not null
            and s.current_period_end > now()
          )
        )
    )
    or exists (
      select 1
      from public.clinic_members cm
      join public.clinics c
        on c.id = cm.clinic_id
       and c.deleted_at is null
      join public.subscriptions s
        on s.owner_user_id = c.created_by
       and s.deleted_at is null
      where cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.deleted_at is null
        and (
          s.status in ('active', 'trialing')
          or (
            s.status = 'past_due'
            and s.current_period_end is not null
            and s.current_period_end > now()
          )
        )
    );
$$;

revoke all on function public.user_has_billable_access() from public;
grant execute on function public.user_has_billable_access() to authenticated;
