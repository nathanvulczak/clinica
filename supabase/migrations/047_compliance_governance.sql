-- CliniCore - Governanca LGPD, retencao e incidentes por clinica.

create table if not exists public.clinic_compliance_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  retention_days integer not null default 1825 check (retention_days between 30 and 3650),
  support_email public.citext,
  incident_email public.citext,
  responsible_name text,
  privacy_notice_version text not null default '2026-07-v1',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  unique (clinic_id)
);

create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  request_type text not null check (request_type in ('access', 'export', 'rectification', 'deletion', 'restriction')),
  status text not null default 'open' check (status in ('open', 'in_review', 'completed', 'rejected')),
  requester_name text not null,
  requester_contact text not null,
  description text,
  resolution_notes text,
  handled_at timestamptz,
  handled_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz
);

create index if not exists data_subject_requests_queue_idx
on public.data_subject_requests (clinic_id, status, created_at desc)
where deleted_at is null;

create table if not exists public.security_incidents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'investigating', 'contained', 'closed')),
  title text not null,
  description text not null,
  containment_notes text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz
);

drop trigger if exists set_clinic_compliance_settings_updated_at on public.clinic_compliance_settings;
create trigger set_clinic_compliance_settings_updated_at
before update on public.clinic_compliance_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_data_subject_requests_updated_at on public.data_subject_requests;
create trigger set_data_subject_requests_updated_at
before update on public.data_subject_requests
for each row execute function public.set_updated_at();

drop trigger if exists set_security_incidents_updated_at on public.security_incidents;
create trigger set_security_incidents_updated_at
before update on public.security_incidents
for each row execute function public.set_updated_at();

alter table public.clinic_compliance_settings enable row level security;
alter table public.data_subject_requests enable row level security;
alter table public.security_incidents enable row level security;

drop policy if exists "compliance_settings_select_authorized" on public.clinic_compliance_settings;
create policy "compliance_settings_select_authorized"
on public.clinic_compliance_settings for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'clinics', 'view'));

drop policy if exists "compliance_settings_manage_authorized" on public.clinic_compliance_settings;
create policy "compliance_settings_manage_authorized"
on public.clinic_compliance_settings for all to authenticated
using (public.user_has_permission(clinic_id, 'clinics', 'edit'))
with check (public.user_has_permission(clinic_id, 'clinics', 'edit'));

drop policy if exists "data_subject_requests_select_authorized" on public.data_subject_requests;
create policy "data_subject_requests_select_authorized"
on public.data_subject_requests for select to authenticated
using (
  deleted_at is null
  and (public.user_has_permission(clinic_id, 'audit', 'view') or public.user_has_permission(clinic_id, 'clinics', 'edit'))
);

drop policy if exists "data_subject_requests_create_authorized" on public.data_subject_requests;
create policy "data_subject_requests_create_authorized"
on public.data_subject_requests for insert to authenticated
with check (public.user_has_permission(clinic_id, 'clinics', 'edit') or public.user_has_permission(clinic_id, 'audit', 'view'));

drop policy if exists "data_subject_requests_update_authorized" on public.data_subject_requests;
create policy "data_subject_requests_update_authorized"
on public.data_subject_requests for update to authenticated
using (public.user_has_permission(clinic_id, 'clinics', 'edit') or public.user_has_permission(clinic_id, 'audit', 'manage'))
with check (public.user_has_permission(clinic_id, 'clinics', 'edit') or public.user_has_permission(clinic_id, 'audit', 'manage'));

drop policy if exists "security_incidents_select_authorized" on public.security_incidents;
create policy "security_incidents_select_authorized"
on public.security_incidents for select to authenticated
using (deleted_at is null and public.user_has_permission(clinic_id, 'audit', 'view'));

drop policy if exists "security_incidents_manage_authorized" on public.security_incidents;
create policy "security_incidents_manage_authorized"
on public.security_incidents for all to authenticated
using (public.user_has_permission(clinic_id, 'audit', 'manage'))
with check (public.user_has_permission(clinic_id, 'audit', 'manage'));

grant select, insert, update on public.clinic_compliance_settings to authenticated;
grant select, insert, update on public.data_subject_requests to authenticated;
grant select, insert, update on public.security_incidents to authenticated;

create or replace function public.ensure_clinic_compliance_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.clinic_compliance_settings (clinic_id, created_by, updated_by)
  values (new.id, new.created_by, new.created_by)
  on conflict (clinic_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ensure_clinic_compliance_settings_after_insert on public.clinics;
create trigger ensure_clinic_compliance_settings_after_insert
after insert on public.clinics
for each row execute function public.ensure_clinic_compliance_settings();

do $$
begin
  insert into public.clinic_compliance_settings (clinic_id, created_by, updated_by)
  select id, created_by, created_by
  from public.clinics
  where deleted_at is null
  on conflict (clinic_id) do nothing;
end $$;

insert into public.app_migration_history (migration_name, description, source, notes)
values (
  '047_compliance_governance.sql',
  'Governanca de retencao, solicitacoes de titulares e incidentes de seguranca por clinica.',
  'supabase_sql_editor',
  'A politica publica deve ser revisada juridicamente antes do uso comercial.'
)
on conflict (migration_name) do nothing;
