-- CliniCore - Fundação enterprise multi-tenant para Supabase/PostgreSQL.
-- Execute este arquivo no SQL Editor do Supabase ou via Supabase CLI.

create extension if not exists pgcrypto with schema public;
create extension if not exists citext with schema public;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'platform_admin',
      'clinic_owner',
      'clinic_admin',
      'doctor',
      'nurse',
      'receptionist',
      'financial',
      'professional'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'plan_slug') then
    create type public.plan_slug as enum ('singular', 'duo', 'master');
  end if;

  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum (
      'active',
      'trialing',
      'past_due',
      'canceled',
      'inactive'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'member_status') then
    create type public.member_status as enum ('active', 'invited', 'suspended', 'removed');
  end if;

  if not exists (select 1 from pg_type where typname = 'permission_module') then
    create type public.permission_module as enum (
      'clinics',
      'members',
      'permissions',
      'billing',
      'audit',
      'patients',
      'medical_records',
      'schedule',
      'financial',
      'reports'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'permission_action') then
    create type public.permission_action as enum (
      'view',
      'create',
      'edit',
      'delete',
      'approve',
      'access_medical_record',
      'manage',
      'export'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'audit_level') then
    create type public.audit_level as enum ('info', 'warning', 'critical', 'security');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  cpf text unique,
  phone text,
  email public.citext unique,
  platform_role public.app_role not null default 'professional',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.clinic_plans (
  slug public.plan_slug primary key,
  name text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'brl',
  max_clinics integer not null check (max_clinics > 0),
  stripe_price_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text not null,
  document text,
  email public.citext,
  phone text,
  address_line text,
  address_number text,
  neighborhood text,
  city text,
  state text,
  postal_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references public.profiles(id) on delete cascade,
  clinic_id uuid references public.clinics(id),
  plan_slug public.plan_slug not null default 'singular' references public.clinic_plans(slug),
  status public.subscription_status not null default 'inactive',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  trial_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  clinic_id uuid references public.clinics(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_invoice_id text not null unique,
  status text,
  amount_due integer not null default 0,
  amount_paid integer not null default 0,
  currency text not null default 'brl',
  hosted_invoice_url text,
  invoice_pdf text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id),
  owner_user_id uuid references public.profiles(id),
  stripe_event_id text not null unique,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null default 'professional',
  status public.member_status not null default 'active',
  invited_by uuid references public.profiles(id),
  joined_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (clinic_id, user_id)
);

create table if not exists public.permission_catalog (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id),
  module public.permission_module not null,
  action public.permission_action not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (clinic_id, module, action)
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  role public.app_role not null,
  module public.permission_module not null,
  action public.permission_action not null,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (clinic_id, role, module, action)
);

create table if not exists public.member_permissions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  member_id uuid not null references public.clinic_members(id) on delete cascade,
  module public.permission_module not null,
  action public.permission_action not null,
  allowed boolean not null default true,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (clinic_id, member_id, module, action)
);

create table if not exists public.clinic_invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  email public.citext not null,
  role public.app_role not null default 'professional',
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  action_type text not null,
  module public.permission_module,
  record_table text,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  level public.audit_level not null default 'info',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, cpf, phone, email, created_by, updated_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'cpf', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    new.email,
    new.id,
    new.id
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        cpf = excluded.cpf,
        phone = excluded.phone,
        email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

create or replace function public.is_platform_admin(user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = user_uuid
      and p.platform_role = 'platform_admin'
      and p.deleted_at is null
  );
$$;

create or replace function public.user_has_clinic_access(clinic_uuid uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(user_uuid)
    or exists (
      select 1
      from public.clinic_members cm
      where cm.clinic_id = clinic_uuid
        and cm.user_id = user_uuid
        and cm.status = 'active'
        and cm.deleted_at is null
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
  select public.is_platform_admin(user_uuid)
    or exists (
      select 1
      from public.clinic_members cm
      where cm.clinic_id = clinic_uuid
        and cm.user_id = user_uuid
        and cm.role = any(allowed_roles)
        and cm.status = 'active'
        and cm.deleted_at is null
    );
$$;

create or replace function public.user_has_permission(
  clinic_uuid uuid,
  permission_module public.permission_module,
  permission_action public.permission_action,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(user_uuid)
    or exists (
      select 1
      from public.clinic_members cm
      where cm.clinic_id = clinic_uuid
        and cm.user_id = user_uuid
        and cm.status = 'active'
        and cm.deleted_at is null
        and (
          cm.role in ('clinic_owner', 'clinic_admin')
          or exists (
            select 1
            from public.role_permissions rp
            where (rp.clinic_id = clinic_uuid or rp.clinic_id is null)
              and rp.role = cm.role
              and rp.module = permission_module
              and rp.action = permission_action
              and rp.allowed = true
              and rp.deleted_at is null
          )
          or exists (
            select 1
            from public.member_permissions mp
            where mp.clinic_id = clinic_uuid
              and mp.member_id = cm.id
              and mp.module = permission_module
              and mp.action = permission_action
              and mp.allowed = true
              and mp.deleted_at is null
          )
        )
    );
$$;

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
    from public.clinic_members cm
    join public.clinics c on c.id = cm.clinic_id
    where cm.user_id = user_uuid
      and cm.role = 'clinic_owner'
      and cm.status = 'active'
      and cm.deleted_at is null
      and c.deleted_at is null
  )
  select public.is_platform_admin(user_uuid)
    or exists (
      select 1
      from active_subscription s, owned_clinics o
      where o.total < s.max_clinics
    );
$$;

create or replace function public.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.clinic_members (
    clinic_id,
    user_id,
    role,
    status,
    joined_at,
    created_by,
    updated_by
  )
  values (
    new.id,
    new.created_by,
    'clinic_owner',
    'active',
    now(),
    new.created_by,
    new.created_by
  )
  on conflict (clinic_id, user_id) do update
    set role = 'clinic_owner',
        status = 'active',
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists add_owner_membership_after_clinic_insert on public.clinics;
create trigger add_owner_membership_after_clinic_insert
after insert on public.clinics
for each row execute function public.add_owner_membership();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'clinic_plans',
    'clinics',
    'subscriptions',
    'invoices',
    'billing_events',
    'clinic_members',
    'permission_catalog',
    'role_permissions',
    'member_permissions',
    'clinic_invitations',
    'audit_logs'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

insert into public.clinic_plans (slug, name, amount_cents, max_clinics)
values
  ('singular', 'Singular', 10990, 1),
  ('duo', 'Duo', 15990, 2),
  ('master', 'Master', 20990, 3)
on conflict (slug) do update
set name = excluded.name,
    amount_cents = excluded.amount_cents,
    max_clinics = excluded.max_clinics,
    updated_at = now();

insert into public.permission_catalog (module, action, description)
select
  module::public.permission_module,
  action::public.permission_action,
  module::text || ':' || action::text
from unnest(enum_range(null::public.permission_module)) as module
cross join unnest(enum_range(null::public.permission_action)) as action
on conflict (clinic_id, module, action) do nothing;

insert into public.role_permissions (role, module, action, allowed)
values
  ('doctor', 'patients', 'view', true),
  ('doctor', 'medical_records', 'view', true),
  ('doctor', 'medical_records', 'create', true),
  ('doctor', 'medical_records', 'edit', true),
  ('doctor', 'medical_records', 'access_medical_record', true),
  ('nurse', 'patients', 'view', true),
  ('nurse', 'medical_records', 'view', true),
  ('nurse', 'medical_records', 'create', true),
  ('receptionist', 'patients', 'view', true),
  ('receptionist', 'patients', 'create', true),
  ('receptionist', 'schedule', 'manage', true),
  ('financial', 'billing', 'view', true),
  ('financial', 'financial', 'manage', true),
  ('professional', 'schedule', 'view', true)
on conflict (clinic_id, role, module, action) do nothing;

create index if not exists idx_profiles_email on public.profiles(email) where deleted_at is null;
create index if not exists idx_clinics_created_by on public.clinics(created_by) where deleted_at is null;
create index if not exists idx_clinic_members_user on public.clinic_members(user_id, status) where deleted_at is null;
create index if not exists idx_clinic_members_clinic on public.clinic_members(clinic_id, status) where deleted_at is null;
create index if not exists idx_subscriptions_owner on public.subscriptions(owner_user_id, status) where deleted_at is null;
create index if not exists idx_invoices_owner on public.invoices(owner_user_id, created_at desc) where deleted_at is null;
create index if not exists idx_audit_logs_clinic_created on public.audit_logs(clinic_id, created_at desc) where deleted_at is null;
create index if not exists idx_audit_logs_user_created on public.audit_logs(user_id, created_at desc) where deleted_at is null;
create index if not exists idx_audit_logs_module on public.audit_logs(module, action_type, created_at desc);
create index if not exists idx_invitations_clinic_email on public.clinic_invitations(clinic_id, email) where deleted_at is null;

alter table public.profiles enable row level security;
alter table public.clinic_plans enable row level security;
alter table public.clinics enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.billing_events enable row level security;
alter table public.clinic_members enable row level security;
alter table public.permission_catalog enable row level security;
alter table public.role_permissions enable row level security;
alter table public.member_permissions enable row level security;
alter table public.clinic_invitations enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_own_or_same_clinic"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.is_platform_admin()
  or exists (
    select 1
    from public.clinic_members mine
    join public.clinic_members theirs on theirs.clinic_id = mine.clinic_id
    where mine.user_id = auth.uid()
      and theirs.user_id = profiles.id
      and mine.status = 'active'
      and theirs.status = 'active'
      and mine.deleted_at is null
      and theirs.deleted_at is null
  )
);

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_platform_admin())
with check (id = auth.uid() or public.is_platform_admin());

create policy "clinic_plans_read_all"
on public.clinic_plans for select
to anon, authenticated
using (active = true);

create policy "clinics_select_members"
on public.clinics for select
to authenticated
using (public.user_has_clinic_access(id) and deleted_at is null);

create policy "clinics_insert_owner_with_active_plan"
on public.clinics for insert
to authenticated
with check (created_by = auth.uid() and public.can_create_clinic(auth.uid()));

create policy "clinics_update_admins"
on public.clinics for update
to authenticated
using (
  deleted_at is null
  and public.user_has_permission(id, 'clinics', 'edit')
)
with check (public.user_has_permission(id, 'clinics', 'edit'));

create policy "clinic_members_select_members"
on public.clinic_members for select
to authenticated
using (public.user_has_clinic_access(clinic_id));

create policy "clinic_members_manage_admins"
on public.clinic_members for all
to authenticated
using (public.user_has_permission(clinic_id, 'members', 'manage'))
with check (public.user_has_permission(clinic_id, 'members', 'manage'));

create policy "subscriptions_select_owner"
on public.subscriptions for select
to authenticated
using (owner_user_id = auth.uid() or public.is_platform_admin());

create policy "invoices_select_owner"
on public.invoices for select
to authenticated
using (owner_user_id = auth.uid() or public.is_platform_admin());

create policy "billing_events_platform_admin"
on public.billing_events for select
to authenticated
using (public.is_platform_admin());

create policy "permission_catalog_read"
on public.permission_catalog for select
to authenticated
using (clinic_id is null or public.user_has_clinic_access(clinic_id));

create policy "role_permissions_read"
on public.role_permissions for select
to authenticated
using (clinic_id is null or public.user_has_clinic_access(clinic_id));

create policy "role_permissions_manage"
on public.role_permissions for all
to authenticated
using (clinic_id is not null and public.user_has_permission(clinic_id, 'permissions', 'manage'))
with check (clinic_id is not null and public.user_has_permission(clinic_id, 'permissions', 'manage'));

create policy "member_permissions_read"
on public.member_permissions for select
to authenticated
using (public.user_has_clinic_access(clinic_id));

create policy "member_permissions_manage"
on public.member_permissions for all
to authenticated
using (public.user_has_permission(clinic_id, 'permissions', 'manage'))
with check (public.user_has_permission(clinic_id, 'permissions', 'manage'));

create policy "clinic_invitations_read"
on public.clinic_invitations for select
to authenticated
using (public.user_has_clinic_access(clinic_id));

create policy "clinic_invitations_manage"
on public.clinic_invitations for all
to authenticated
using (public.user_has_permission(clinic_id, 'members', 'manage'))
with check (public.user_has_permission(clinic_id, 'members', 'manage'));

create policy "audit_logs_read_authorized"
on public.audit_logs for select
to authenticated
using (
  public.is_platform_admin()
  or (clinic_id is not null and public.user_has_permission(clinic_id, 'audit', 'view'))
);

create policy "audit_logs_insert_members"
on public.audit_logs for insert
to authenticated
with check (
  user_id = auth.uid()
  and (clinic_id is null or public.user_has_clinic_access(clinic_id))
);
