-- CliniCore - Ciclo de vida seguro dos convites e recuperação de acesso.

alter table public.clinic_invitations
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer not null default 0,
  add column if not exists canceled_at timestamptz,
  add column if not exists canceled_by uuid references public.profiles(id),
  add column if not exists accepted_by uuid references public.profiles(id),
  add column if not exists failure_reason text,
  add column if not exists token_hash text;

alter table public.registration_preferences
  add column if not exists invitation_ttl_hours integer not null default 72
    check (invitation_ttl_hours between 24 and 168);

update public.clinic_invitations
set status = 'sent'
where status = 'pending'
  and expires_at > now()
  and deleted_at is null
  and token is not null;

update public.clinic_invitations
set status = 'expired'
where status in ('pending', 'sent')
  and expires_at <= now()
  and deleted_at is null;

with ranked as (
  select
    id,
    row_number() over (
      partition by clinic_id, lower(email::text)
      order by coalesce(last_sent_at, created_at) desc, created_at desc
    ) as row_number
  from public.clinic_invitations
  where status in ('pending', 'sent')
    and deleted_at is null
)
update public.clinic_invitations invitation
set status = 'canceled',
    canceled_at = coalesce(canceled_at, now()),
    failure_reason = coalesce(failure_reason, 'Convite substituído por uma nova emissão.')
from ranked
where invitation.id = ranked.id
  and ranked.row_number > 1;

alter table public.clinic_invitations
  drop constraint if exists clinic_invitations_status_check;

alter table public.clinic_invitations
  add constraint clinic_invitations_status_check
  check (status in ('pending', 'sent', 'accepted', 'expired', 'canceled', 'failed'));

alter table public.clinic_invitations
  drop constraint if exists clinic_invitations_send_count_check;

alter table public.clinic_invitations
  add constraint clinic_invitations_send_count_check
  check (send_count >= 0 and send_count <= 10);

create unique index if not exists clinic_invitations_one_open_per_email
on public.clinic_invitations(clinic_id, lower(email::text))
where deleted_at is null and status in ('pending', 'sent');

create index if not exists idx_clinic_invitations_lifecycle
on public.clinic_invitations(clinic_id, status, expires_at desc)
where deleted_at is null;

create index if not exists idx_clinic_invitations_user
on public.clinic_invitations(user_id, created_at desc)
where deleted_at is null;

create or replace function public.expire_clinic_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.clinic_invitations
  set status = 'expired',
      updated_at = now(),
      failure_reason = coalesce(failure_reason, 'O prazo de validade do convite foi atingido.')
  where status in ('pending', 'sent')
    and expires_at <= now()
    and deleted_at is null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.expire_clinic_invitations() from public, anon, authenticated;
grant execute on function public.expire_clinic_invitations() to service_role;

insert into public.app_migration_history(migration_name, description, source, notes)
values (
  '055_secure_invitation_lifecycle.sql',
  'Ciclo de vida seguro de convites, expiração, reenvio, cancelamento e recuperação de acesso.',
  'supabase_sql_editor',
  'Convites preservam histórico, não apagam contas Auth e mantêm apenas metadados operacionais.'
)
on conflict (migration_name) do nothing;
