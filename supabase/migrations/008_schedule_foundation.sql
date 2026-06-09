-- Fase 3.1 - Fundação do módulo Agenda.
-- Tabelas multi-tenant com RLS, auditoria e prevenção de conflito de horários.

create extension if not exists btree_gist with schema public;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'appointment_status') then
    create type public.appointment_status as enum (
      'scheduled',
      'confirmed',
      'checked_in',
      'in_triage',
      'in_progress',
      'completed',
      'cancelled',
      'no_show',
      'rescheduled',
      'billing_pending',
      'billed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'schedule_block_type') then
    create type public.schedule_block_type as enum (
      'unavailable',
      'lunch',
      'vacation',
      'administrative',
      'other'
    );
  end if;
end $$;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  full_name text not null,
  cpf text,
  birth_date date,
  phone text,
  email public.citext,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.schedule_professional_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_member_id uuid not null references public.clinic_members(id) on delete cascade,
  slot_minutes integer not null default 30 check (slot_minutes in (10, 15, 20, 30, 45, 60, 90, 120)),
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0 and buffer_minutes <= 120),
  timezone text not null default 'America/Sao_Paulo',
  default_location text,
  online_booking_enabled boolean not null default false,
  working_hours jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (clinic_id, professional_member_id)
);

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_member_id uuid not null references public.clinic_members(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  block_type public.schedule_block_type not null default 'unavailable',
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  check (ends_at > starts_at)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id),
  professional_member_id uuid not null references public.clinic_members(id),
  scheduled_by uuid references public.profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  appointment_type text not null default 'Consulta',
  channel text not null default 'Presencial',
  confirmation_token text not null default encode(gen_random_bytes(24), 'hex'),
  confirmation_sent_at timestamptz,
  confirmed_at timestamptz,
  cancellation_reason text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  check (ends_at > starts_at)
);

create table if not exists public.appointment_workflow_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  from_status public.appointment_status,
  to_status public.appointment_status not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create index if not exists idx_patients_clinic_name
on public.patients(clinic_id, full_name)
where deleted_at is null;

create unique index if not exists idx_patients_clinic_cpf_unique
on public.patients(clinic_id, cpf)
where cpf is not null and deleted_at is null;

create index if not exists idx_schedule_settings_clinic_member
on public.schedule_professional_settings(clinic_id, professional_member_id)
where deleted_at is null;

create index if not exists idx_schedule_blocks_clinic_professional_time
on public.schedule_blocks(clinic_id, professional_member_id, starts_at, ends_at)
where deleted_at is null;

create index if not exists idx_appointments_clinic_time
on public.appointments(clinic_id, starts_at, ends_at)
where deleted_at is null;

create index if not exists idx_appointments_professional_time
on public.appointments(professional_member_id, starts_at, ends_at)
where deleted_at is null;

create index if not exists idx_appointments_patient_time
on public.appointments(patient_id, starts_at desc)
where deleted_at is null;

create unique index if not exists idx_appointments_confirmation_token_unique
on public.appointments(confirmation_token)
where deleted_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_no_active_overlap'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
    add constraint appointments_no_active_overlap
    exclude using gist (
      clinic_id with =,
      professional_member_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    )
    where (
      deleted_at is null
      and status in ('scheduled', 'confirmed', 'checked_in', 'in_triage', 'in_progress')
    );
  end if;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'patients',
    'schedule_professional_settings',
    'schedule_blocks',
    'appointments',
    'appointment_workflow_events'
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

create or replace function public.audit_table_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_json jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  old_json jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  clinic_uuid uuid;
  actor_uuid uuid;
  affected_id uuid;
  module_name public.permission_module;
  action_name text;
begin
  if tg_table_name = 'audit_logs' then
    return coalesce(new, old);
  end if;

  clinic_uuid := nullif(coalesce(
    new_json ->> 'clinic_id',
    old_json ->> 'clinic_id',
    case when tg_table_name = 'clinics' then coalesce(new_json ->> 'id', old_json ->> 'id') end
  ), '')::uuid;

  actor_uuid := coalesce(
    auth.uid(),
    nullif(coalesce(new_json ->> 'updated_by', old_json ->> 'updated_by'), '')::uuid,
    nullif(coalesce(new_json ->> 'created_by', old_json ->> 'created_by'), '')::uuid,
    nullif(coalesce(new_json ->> 'user_id', old_json ->> 'user_id'), '')::uuid,
    nullif(coalesce(new_json ->> 'owner_user_id', old_json ->> 'owner_user_id'), '')::uuid,
    nullif(coalesce(new_json ->> 'scheduled_by', old_json ->> 'scheduled_by'), '')::uuid
  );

  affected_id := nullif(coalesce(new_json ->> 'id', old_json ->> 'id'), '')::uuid;

  module_name := case tg_table_name
    when 'clinics' then 'clinics'::public.permission_module
    when 'clinic_members' then 'members'::public.permission_module
    when 'role_permissions' then 'permissions'::public.permission_module
    when 'member_permissions' then 'permissions'::public.permission_module
    when 'subscriptions' then 'billing'::public.permission_module
    when 'invoices' then 'billing'::public.permission_module
    when 'patients' then 'patients'::public.permission_module
    when 'schedule_professional_settings' then 'schedule'::public.permission_module
    when 'schedule_blocks' then 'schedule'::public.permission_module
    when 'appointments' then 'schedule'::public.permission_module
    when 'appointment_workflow_events' then 'schedule'::public.permission_module
    else null
  end;

  action_name := case tg_op
    when 'INSERT' then 'record_created'
    when 'UPDATE' then 'record_updated'
    when 'DELETE' then 'record_deleted'
  end;

  insert into public.audit_logs (
    clinic_id,
    user_id,
    action_type,
    module,
    record_table,
    record_id,
    old_values,
    new_values,
    level,
    notes,
    created_by,
    updated_by
  )
  values (
    clinic_uuid,
    actor_uuid,
    action_name,
    module_name,
    tg_table_name,
    affected_id,
    old_json,
    new_json,
    case
      when module_name in (
        'medical_records'::public.permission_module,
        'patients'::public.permission_module
      ) then 'security'::public.audit_level
      else 'info'::public.audit_level
    end,
    format('Alteração automática registrada em %s.', tg_table_name),
    actor_uuid,
    actor_uuid
  );

  return coalesce(new, old);
end;
$$;

do $$
declare
  tracked_table text;
begin
  foreach tracked_table in array array[
    'patients',
    'schedule_professional_settings',
    'schedule_blocks',
    'appointments',
    'appointment_workflow_events'
  ]
  loop
    execute format('drop trigger if exists audit_%I_changes on public.%I', tracked_table, tracked_table);
    execute format(
      'create trigger audit_%I_changes after insert or update or delete on public.%I for each row execute function public.audit_table_changes()',
      tracked_table,
      tracked_table
    );
  end loop;
end $$;

delete from public.role_permissions rp
where rp.clinic_id is null
  and (rp.role, rp.module, rp.action) in (
    values
      ('doctor'::public.app_role, 'schedule'::public.permission_module, 'view'::public.permission_action),
      ('doctor'::public.app_role, 'patients'::public.permission_module, 'view'::public.permission_action),
      ('nurse'::public.app_role, 'schedule'::public.permission_module, 'view'::public.permission_action),
      ('nurse'::public.app_role, 'patients'::public.permission_module, 'view'::public.permission_action),
      ('receptionist'::public.app_role, 'schedule'::public.permission_module, 'view'::public.permission_action),
      ('receptionist'::public.app_role, 'patients'::public.permission_module, 'view'::public.permission_action),
      ('receptionist'::public.app_role, 'patients'::public.permission_module, 'create'::public.permission_action),
      ('receptionist'::public.app_role, 'schedule'::public.permission_module, 'create'::public.permission_action),
      ('receptionist'::public.app_role, 'schedule'::public.permission_module, 'edit'::public.permission_action),
      ('receptionist'::public.app_role, 'schedule'::public.permission_module, 'manage'::public.permission_action),
      ('professional'::public.app_role, 'schedule'::public.permission_module, 'view'::public.permission_action)
  );

insert into public.role_permissions (role, module, action, allowed)
values
  ('doctor', 'schedule', 'view', true),
  ('doctor', 'patients', 'view', true),
  ('nurse', 'schedule', 'view', true),
  ('nurse', 'patients', 'view', true),
  ('receptionist', 'schedule', 'view', true),
  ('receptionist', 'patients', 'view', true),
  ('receptionist', 'patients', 'create', true),
  ('receptionist', 'schedule', 'create', true),
  ('receptionist', 'schedule', 'edit', true),
  ('receptionist', 'schedule', 'manage', true),
  ('professional', 'schedule', 'view', true);

alter table public.patients enable row level security;
alter table public.schedule_professional_settings enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_workflow_events enable row level security;

drop policy if exists "patients_select_authorized" on public.patients;
create policy "patients_select_authorized"
on public.patients for select
to authenticated
using (
  deleted_at is null
  and (
    public.user_has_permission(clinic_id, 'patients', 'view')
    or public.user_has_permission(clinic_id, 'schedule', 'view')
  )
);

drop policy if exists "patients_insert_authorized" on public.patients;
create policy "patients_insert_authorized"
on public.patients for insert
to authenticated
with check (public.user_has_permission(clinic_id, 'patients', 'create'));

drop policy if exists "patients_update_authorized" on public.patients;
create policy "patients_update_authorized"
on public.patients for update
to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'patients', 'edit'))
with check (public.user_has_permission(clinic_id, 'patients', 'edit'));

drop policy if exists "schedule_settings_select_authorized" on public.schedule_professional_settings;
create policy "schedule_settings_select_authorized"
on public.schedule_professional_settings for select
to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'schedule', 'view'));

drop policy if exists "schedule_settings_manage_authorized" on public.schedule_professional_settings;
create policy "schedule_settings_manage_authorized"
on public.schedule_professional_settings for all
to authenticated
using (public.user_has_permission(clinic_id, 'schedule', 'manage'))
with check (public.user_has_permission(clinic_id, 'schedule', 'manage'));

drop policy if exists "schedule_blocks_select_authorized" on public.schedule_blocks;
create policy "schedule_blocks_select_authorized"
on public.schedule_blocks for select
to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'schedule', 'view'));

drop policy if exists "schedule_blocks_manage_authorized" on public.schedule_blocks;
create policy "schedule_blocks_manage_authorized"
on public.schedule_blocks for all
to authenticated
using (public.user_has_permission(clinic_id, 'schedule', 'manage'))
with check (public.user_has_permission(clinic_id, 'schedule', 'manage'));

drop policy if exists "appointments_select_authorized" on public.appointments;
create policy "appointments_select_authorized"
on public.appointments for select
to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'schedule', 'view'));

drop policy if exists "appointments_manage_authorized" on public.appointments;
create policy "appointments_manage_authorized"
on public.appointments for all
to authenticated
using (public.user_has_permission(clinic_id, 'schedule', 'manage'))
with check (public.user_has_permission(clinic_id, 'schedule', 'manage'));

drop policy if exists "appointment_events_select_authorized" on public.appointment_workflow_events;
create policy "appointment_events_select_authorized"
on public.appointment_workflow_events for select
to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'schedule', 'view'));

drop policy if exists "appointment_events_insert_authorized" on public.appointment_workflow_events;
create policy "appointment_events_insert_authorized"
on public.appointment_workflow_events for insert
to authenticated
with check (public.user_has_permission(clinic_id, 'schedule', 'manage'));
