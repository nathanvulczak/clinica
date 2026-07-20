-- CliniCore - Console independente do proprietario da plataforma.
-- Esta migration separa a autoridade tecnica do RBAC de cada clinica.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_operator_role') then
    create type public.platform_operator_role as enum ('owner', 'support', 'billing', 'security');
  end if;
  if not exists (select 1 from pg_type where typname = 'platform_operator_status') then
    create type public.platform_operator_status as enum ('active', 'suspended', 'revoked');
  end if;
end $$;

alter table public.clinics
  add column if not exists platform_status text not null default 'active'
    check (platform_status in ('active', 'suspended')),
  add column if not exists platform_suspended_at timestamptz,
  add column if not exists platform_suspended_by uuid references public.profiles(id),
  add column if not exists platform_suspension_reason text;

create table if not exists public.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.platform_operator_role not null default 'owner',
  status public.platform_operator_status not null default 'active',
  display_name text not null,
  mfa_required boolean not null default true,
  mfa_enrolled boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create unique index if not exists platform_operators_active_owner_idx
on public.platform_operators(role)
where role = 'owner' and status = 'active';

create table if not exists public.platform_clinic_limits (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  max_active_users integer not null default 25 check (max_active_users between 1 and 10000),
  max_active_professionals integer not null default 10 check (max_active_professionals between 1 and 10000),
  max_active_patients integer not null default 10000 check (max_active_patients between 1 and 10000000),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.platform_error_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  source text not null check (length(btrim(source)) between 2 and 80),
  error_code text not null check (length(btrim(error_code)) between 2 and 120),
  severity text not null default 'error' check (severity in ('info', 'warning', 'error', 'critical')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'ignored')),
  message text not null check (length(btrim(message)) between 2 and 1000),
  route text,
  fingerprint text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint platform_error_events_no_clinical_content check (
    not (metadata ? 'patient_id')
    and not (metadata ? 'medical_record_id')
    and not (metadata ? 'encounter_id')
    and not (metadata ? 'cpf')
    and not (metadata ? 'laudo')
  )
);

create index if not exists platform_error_events_status_idx
on public.platform_error_events(status, severity, occurred_at desc);
create index if not exists platform_error_events_clinic_idx
on public.platform_error_events(clinic_id, occurred_at desc);

create table if not exists public.platform_usage_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'platform_console',
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  collected_at timestamptz not null default now(),
  collected_by uuid references public.profiles(id),
  constraint platform_usage_snapshots_no_clinical_content check (
    not (metrics ? 'patient_id')
    and not (metrics ? 'medical_record_id')
    and not (metrics ? 'cpf')
  )
);

create table if not exists public.platform_operations (
  id uuid primary key default gen_random_uuid(),
  operator_user_id uuid not null references auth.users(id),
  action_type text not null check (length(btrim(action_type)) between 2 and 100),
  target_clinic_id uuid references public.clinics(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  reason text not null check (length(btrim(reason)) between 10 and 1000),
  old_values jsonb,
  new_values jsonb,
  status text not null default 'completed' check (status in ('requested', 'completed', 'failed', 'reverted')),
  error_message text,
  created_at timestamptz not null default now(),
  constraint platform_operations_no_clinical_content check (
    not (coalesce(old_values, '{}'::jsonb) ? 'patient_id')
    and not (coalesce(old_values, '{}'::jsonb) ? 'medical_record_id')
    and not (coalesce(new_values, '{}'::jsonb) ? 'patient_id')
    and not (coalesce(new_values, '{}'::jsonb) ? 'medical_record_id')
  )
);

create index if not exists platform_operations_target_idx
on public.platform_operations(target_clinic_id, created_at desc);

create or replace function public.platform_operator_can(
  required_scope text,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_operators operator
    where operator.user_id = user_uuid
      and operator.status = 'active'
      and (
        operator.role = 'owner'
        or (operator.role = 'support' and required_scope in ('overview', 'health', 'errors'))
        or (operator.role = 'billing' and required_scope in ('overview', 'billing'))
        or (operator.role = 'security' and required_scope in ('overview', 'health', 'errors', 'break_glass'))
      )
  );
$$;

create or replace function public.platform_operator_is_owner(user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_operators operator
    where operator.user_id = user_uuid
      and operator.role = 'owner'
      and operator.status = 'active'
  );
$$;

revoke all on function public.platform_operator_can(text, uuid) from public, anon;
revoke all on function public.platform_operator_is_owner(uuid) from public, anon;
grant execute on function public.platform_operator_can(text, uuid) to authenticated, service_role;
grant execute on function public.platform_operator_is_owner(uuid) to authenticated, service_role;

-- A antiga excecao global por profiles.platform_role deixa de conceder acesso clinico.
-- O proprietario opera pelo console; clinicas continuam usando clinic_members e RBAC.
create or replace function public.is_platform_admin(user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;

create or replace function public.user_has_clinic_access(clinic_uuid uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_members cm
    join public.clinics c on c.id = cm.clinic_id
    where cm.clinic_id = clinic_uuid
      and cm.user_id = user_uuid
      and cm.status = 'active'
      and cm.deleted_at is null
      and c.platform_status = 'active'
      and c.deleted_at is null
  );
$$;

create or replace function public.user_has_clinic_role(
  clinic_uuid uuid,
  allowed_roles public.app_role[],
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_members cm
    join public.clinics c on c.id = cm.clinic_id
    where cm.clinic_id = clinic_uuid
      and cm.user_id = user_uuid
      and cm.role = any(allowed_roles)
      and cm.status = 'active'
      and cm.deleted_at is null
      and c.platform_status = 'active'
      and c.deleted_at is null
  );
$$;

create or replace function public.user_has_permission(
  clinic_uuid uuid,
  permission_module public.permission_module,
  permission_action public.permission_action,
  user_uuid uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  effective_user_uuid uuid;
begin
  effective_user_uuid := case
    when auth.role() = 'service_role' then coalesce(user_uuid, auth.uid())
    else auth.uid()
  end;

  if effective_user_uuid is null or clinic_uuid is null then
    return false;
  end if;

  return exists (
    select 1
    from public.clinic_members cm
    join public.clinics c on c.id = cm.clinic_id
    where cm.clinic_id = clinic_uuid
      and cm.user_id = effective_user_uuid
      and cm.status = 'active'
      and cm.deleted_at is null
      and c.platform_status = 'active'
      and c.deleted_at is null
      and (
        cm.role = 'clinic_owner'
        or coalesce(
          (select mp.allowed from public.member_permissions mp where mp.clinic_id = clinic_uuid and mp.member_id = cm.id and mp.module = permission_module and mp.action = permission_action and mp.deleted_at is null order by mp.updated_at desc limit 1),
          (select rp.allowed from public.role_permissions rp where rp.clinic_id = clinic_uuid and rp.role = cm.role and rp.module = permission_module and rp.action = permission_action and rp.deleted_at is null order by rp.updated_at desc limit 1),
          (select rp.allowed from public.role_permissions rp where rp.clinic_id is null and rp.role = cm.role and rp.module = permission_module and rp.action = permission_action and rp.deleted_at is null order by rp.updated_at desc limit 1),
          false
        )
      )
  );
end;
$$;

revoke execute on function public.user_has_clinic_access(uuid, uuid) from public, anon;
revoke execute on function public.user_has_clinic_role(uuid, public.app_role[], uuid) from public, anon;
grant execute on function public.user_has_clinic_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.user_has_clinic_role(uuid, public.app_role[], uuid) to authenticated, service_role;
grant execute on function public.user_has_permission(uuid, public.permission_module, public.permission_action, uuid) to authenticated, service_role;

create or replace function public.platform_collect_usage_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  usage_metrics jsonb;
begin
  if auth.role() <> 'service_role' and not public.platform_operator_can('health') then
    raise exception 'platform_health_access_denied';
  end if;

  select jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'public_tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'table_name', stat.relname,
        'estimated_rows', greatest(stat.n_live_tup, 0),
        'bytes', pg_total_relation_size(format('%I.%I', stat.schemaname, stat.relname)::regclass)
      ) order by stat.relname)
      from pg_stat_user_tables stat
      where stat.schemaname = 'public'
    ), '[]'::jsonb),
    'active_clinics', (select count(*) from public.clinics where platform_status = 'active' and deleted_at is null),
    'suspended_clinics', (select count(*) from public.clinics where platform_status = 'suspended' and deleted_at is null),
    'active_users', (select count(*) from public.profiles where deleted_at is null),
    'active_memberships', (select count(*) from public.clinic_members where status = 'active' and deleted_at is null)
  ) into usage_metrics;

  insert into public.platform_usage_snapshots(metrics, collected_by)
  values (usage_metrics, case when auth.role() = 'service_role' then null else auth.uid() end);

  return usage_metrics;
end;
$$;

revoke all on function public.platform_collect_usage_snapshot() from public, anon;
grant execute on function public.platform_collect_usage_snapshot() to authenticated, service_role;

create or replace function public.enforce_platform_clinic_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  limits public.platform_clinic_limits%rowtype;
  total_users integer;
  total_professionals integer;
begin
  if new.deleted_at is not null or new.status not in ('active', 'invited') then
    return new;
  end if;

  select * into limits from public.platform_clinic_limits where clinic_id = new.clinic_id;
  if not found then
    limits.max_active_users := 25;
    limits.max_active_professionals := 10;
  end if;

  select count(*) into total_users
  from public.clinic_members cm
  where cm.clinic_id = new.clinic_id
    and cm.status in ('active', 'invited')
    and cm.deleted_at is null
    and (tg_op = 'INSERT' or cm.id <> new.id);

  if total_users >= limits.max_active_users then
    raise exception 'clinic_user_limit_reached' using detail = format('Limite de %s usuários ativos ou convidados atingido.', limits.max_active_users);
  end if;

  if new.role in ('doctor', 'nurse', 'professional') then
    select count(*) into total_professionals
    from public.clinic_members cm
    where cm.clinic_id = new.clinic_id
      and cm.role in ('doctor', 'nurse', 'professional')
      and cm.status in ('active', 'invited')
      and cm.deleted_at is null
      and (tg_op = 'INSERT' or cm.id <> new.id);
    if total_professionals >= limits.max_active_professionals then
      raise exception 'clinic_professional_limit_reached' using detail = format('Limite de %s profissionais ativos ou convidados atingido.', limits.max_active_professionals);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_platform_clinic_limits on public.clinic_members;
create trigger enforce_platform_clinic_limits
before insert or update of clinic_id, role, status, deleted_at on public.clinic_members
for each row execute function public.enforce_platform_clinic_limits();

alter table public.platform_operators enable row level security;
alter table public.platform_clinic_limits enable row level security;
alter table public.platform_error_events enable row level security;
alter table public.platform_usage_snapshots enable row level security;
alter table public.platform_operations enable row level security;

revoke all on public.platform_operators, public.platform_clinic_limits, public.platform_error_events, public.platform_usage_snapshots, public.platform_operations from anon, public;
grant select on public.platform_operators to authenticated;
grant select on public.platform_clinic_limits, public.platform_error_events, public.platform_usage_snapshots, public.platform_operations to authenticated;

drop policy if exists platform_operators_select on public.platform_operators;
create policy platform_operators_select on public.platform_operators for select to authenticated
using (public.platform_operator_can('overview'));

drop policy if exists platform_clinic_limits_select on public.platform_clinic_limits;
create policy platform_clinic_limits_select on public.platform_clinic_limits for select to authenticated
using (public.platform_operator_can('overview'));

drop policy if exists platform_error_events_select on public.platform_error_events;
create policy platform_error_events_select on public.platform_error_events for select to authenticated
using (public.platform_operator_can('errors'));

drop policy if exists platform_usage_snapshots_select on public.platform_usage_snapshots;
create policy platform_usage_snapshots_select on public.platform_usage_snapshots for select to authenticated
using (public.platform_operator_can('health'));

drop policy if exists platform_operations_select on public.platform_operations;
create policy platform_operations_select on public.platform_operations for select to authenticated
using (public.platform_operator_can('overview'));

drop policy if exists platform_access_grants_select on public.platform_access_grants;
create policy platform_access_grants_select on public.platform_access_grants for select to authenticated
using (public.platform_operator_can('overview'));

drop policy if exists platform_access_grants_insert on public.platform_access_grants;
create policy platform_access_grants_insert on public.platform_access_grants for insert to authenticated
with check (
  actor_user_id = auth.uid()
  and public.platform_operator_can('break_glass')
  and read_only = true
  and approval_required = true
  and expires_at <= now() + interval '60 minutes'
);

drop policy if exists platform_access_grants_update on public.platform_access_grants;
create policy platform_access_grants_update on public.platform_access_grants for update to authenticated
using (public.platform_operator_can('break_glass'))
with check (public.platform_operator_can('break_glass'));

drop policy if exists platform_health_snapshots_select on public.platform_health_snapshots;
create policy platform_health_snapshots_select on public.platform_health_snapshots for select to authenticated
using (public.platform_operator_can('health'));

drop policy if exists platform_feature_flags_select on public.platform_feature_flags;
create policy platform_feature_flags_select on public.platform_feature_flags for select to authenticated
using (public.platform_operator_can('overview'));

drop policy if exists "app_migration_history_select_platform_admin" on public.app_migration_history;
create policy "app_migration_history_select_platform_operator"
on public.app_migration_history for select to authenticated
using (public.platform_operator_can('health'));

insert into public.app_migration_history(migration_name, description, source, notes)
values ('053_platform_owner_console.sql', 'Console independente do proprietario, limites por clinica, uso agregado e operacoes tecnicas auditadas.', 'supabase_sql_editor', 'A autoridade do console vem de platform_operators; profiles.platform_role nao concede mais acesso global.')
on conflict (migration_name) do nothing;
