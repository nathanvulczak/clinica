-- CliniCore - Cadastros operacionais integrados à Agenda.
-- Execute depois da migration 008_schedule_foundation.sql corrigida.

alter table public.patients
  add column if not exists social_name text,
  add column if not exists rg text,
  add column if not exists issuing_authority text,
  add column if not exists sex_at_birth text,
  add column if not exists gender_identity text,
  add column if not exists marital_status text,
  add column if not exists occupation text,
  add column if not exists nationality text default 'Brasileira',
  add column if not exists preferred_contact text default 'whatsapp',
  add column if not exists postal_code text,
  add column if not exists address_line text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists emergency_contact_phone text,
  add column if not exists health_plan_name text,
  add column if not exists health_plan_number text,
  add column if not exists health_plan_valid_until date,
  add column if not exists clinical_alerts text,
  add column if not exists consent_lgpd_at timestamptz,
  add column if not exists active boolean not null default true;

create table if not exists public.clinic_services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  code text,
  name text not null,
  category text,
  description text,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 720),
  price_cents integer not null default 0 check (price_cents >= 0),
  color text not null default '#0f766e',
  requires_authorization boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.clinic_rooms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  code text,
  name text not null,
  room_type text not null default 'Consultório',
  floor text,
  capacity integer not null default 1 check (capacity between 1 and 100),
  resources text[] not null default '{}'::text[],
  notes text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.professional_availability_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_member_id uuid not null references public.clinic_members(id) on delete cascade,
  room_id uuid references public.clinic_rooms(id),
  service_id uuid references public.clinic_services(id),
  recurrence_type text not null default 'weekly'
    check (recurrence_type in ('weekly', 'specific_date')),
  weekday smallint check (weekday between 0 and 6),
  specific_date date,
  valid_from date,
  valid_until date,
  start_time time not null,
  end_time time not null,
  slot_minutes integer not null default 30 check (slot_minutes between 5 and 720),
  active boolean not null default true,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  check (end_time > start_time),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (
    (recurrence_type = 'weekly' and weekday is not null and specific_date is null)
    or
    (recurrence_type = 'specific_date' and specific_date is not null)
  )
);

create table if not exists public.registration_preferences (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null unique references public.clinics(id) on delete cascade,
  require_patient_cpf boolean not null default true,
  require_patient_email boolean not null default false,
  default_service_duration integer not null default 30 check (default_service_duration between 5 and 720),
  default_export_format text not null default 'csv' check (default_export_format in ('csv')),
  patient_display_name text not null default 'full_name'
    check (patient_display_name in ('full_name', 'social_name')),
  show_inactive_records boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

alter table public.appointments
  add column if not exists service_id uuid references public.clinic_services(id),
  add column if not exists room_id uuid references public.clinic_rooms(id);

create unique index if not exists idx_clinic_services_name_unique
on public.clinic_services(clinic_id, lower(name))
where deleted_at is null;

create unique index if not exists idx_clinic_services_code_unique
on public.clinic_services(clinic_id, lower(code))
where code is not null and deleted_at is null;

create index if not exists idx_clinic_services_active
on public.clinic_services(clinic_id, active, name)
where deleted_at is null;

create unique index if not exists idx_clinic_rooms_name_unique
on public.clinic_rooms(clinic_id, lower(name))
where deleted_at is null;

create unique index if not exists idx_clinic_rooms_code_unique
on public.clinic_rooms(clinic_id, lower(code))
where code is not null and deleted_at is null;

create index if not exists idx_clinic_rooms_active
on public.clinic_rooms(clinic_id, active, name)
where deleted_at is null;

create index if not exists idx_availability_professional_weekday
on public.professional_availability_rules(
  clinic_id,
  professional_member_id,
  recurrence_type,
  weekday,
  specific_date
)
where deleted_at is null and active = true;

create index if not exists idx_appointments_service
on public.appointments(clinic_id, service_id, starts_at)
where deleted_at is null;

create index if not exists idx_appointments_room
on public.appointments(clinic_id, room_id, starts_at)
where deleted_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'appointments_no_active_room_overlap'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
    add constraint appointments_no_active_room_overlap
    exclude using gist (
      clinic_id with =,
      room_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    )
    where (
      room_id is not null
      and deleted_at is null
      and status in ('scheduled', 'confirmed', 'checked_in', 'in_triage', 'in_progress')
    );
  end if;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clinic_services',
    'clinic_rooms',
    'professional_availability_rules',
    'registration_preferences'
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
    when 'clinic_services' then 'schedule'::public.permission_module
    when 'clinic_rooms' then 'schedule'::public.permission_module
    when 'professional_availability_rules' then 'schedule'::public.permission_module
    when 'registration_preferences' then 'schedule'::public.permission_module
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
    'clinic_services',
    'clinic_rooms',
    'professional_availability_rules',
    'registration_preferences',
    'appointments'
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

alter table public.clinic_services enable row level security;
alter table public.clinic_rooms enable row level security;
alter table public.professional_availability_rules enable row level security;
alter table public.registration_preferences enable row level security;

drop policy if exists "clinic_services_select_authorized" on public.clinic_services;
create policy "clinic_services_select_authorized"
on public.clinic_services for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'schedule', 'view'));

drop policy if exists "clinic_services_insert_authorized" on public.clinic_services;
create policy "clinic_services_insert_authorized"
on public.clinic_services for insert to authenticated
with check (public.user_has_permission(clinic_id, 'schedule', 'create'));

drop policy if exists "clinic_services_update_authorized" on public.clinic_services;
create policy "clinic_services_update_authorized"
on public.clinic_services for update to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'schedule', 'edit'))
with check (public.user_has_permission(clinic_id, 'schedule', 'edit'));

drop policy if exists "clinic_rooms_select_authorized" on public.clinic_rooms;
create policy "clinic_rooms_select_authorized"
on public.clinic_rooms for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'schedule', 'view'));

drop policy if exists "clinic_rooms_insert_authorized" on public.clinic_rooms;
create policy "clinic_rooms_insert_authorized"
on public.clinic_rooms for insert to authenticated
with check (public.user_has_permission(clinic_id, 'schedule', 'create'));

drop policy if exists "clinic_rooms_update_authorized" on public.clinic_rooms;
create policy "clinic_rooms_update_authorized"
on public.clinic_rooms for update to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'schedule', 'edit'))
with check (public.user_has_permission(clinic_id, 'schedule', 'edit'));

drop policy if exists "availability_select_authorized" on public.professional_availability_rules;
create policy "availability_select_authorized"
on public.professional_availability_rules for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'schedule', 'view'));

drop policy if exists "availability_insert_authorized" on public.professional_availability_rules;
create policy "availability_insert_authorized"
on public.professional_availability_rules for insert to authenticated
with check (public.user_has_permission(clinic_id, 'schedule', 'create'));

drop policy if exists "availability_update_authorized" on public.professional_availability_rules;
create policy "availability_update_authorized"
on public.professional_availability_rules for update to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'schedule', 'edit'))
with check (public.user_has_permission(clinic_id, 'schedule', 'edit'));

drop policy if exists "registration_preferences_select_authorized" on public.registration_preferences;
create policy "registration_preferences_select_authorized"
on public.registration_preferences for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'schedule', 'view'));

drop policy if exists "registration_preferences_manage_authorized" on public.registration_preferences;
create policy "registration_preferences_manage_authorized"
on public.registration_preferences for all to authenticated
using (public.user_has_permission(clinic_id, 'schedule', 'manage'))
with check (public.user_has_permission(clinic_id, 'schedule', 'manage'));

update public.role_permissions
set allowed = false,
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
where clinic_id is null
  and role in ('doctor', 'nurse', 'professional')
  and module = 'schedule'
  and action = 'edit'
  and deleted_at is null;

insert into public.role_permissions (role, module, action, allowed)
select preset.role, preset.module, preset.action, true
from (
  values
    ('receptionist'::public.app_role, 'patients'::public.permission_module, 'edit'::public.permission_action),
    ('receptionist'::public.app_role, 'patients'::public.permission_module, 'export'::public.permission_action),
    ('receptionist'::public.app_role, 'schedule'::public.permission_module, 'export'::public.permission_action),
    ('financial'::public.app_role, 'schedule'::public.permission_module, 'view'::public.permission_action)
) as preset(role, module, action)
where not exists (
  select 1
  from public.role_permissions rp
  where rp.clinic_id is null
    and rp.role = preset.role
    and rp.module = preset.module
    and rp.action = preset.action
    and rp.deleted_at is null
);
