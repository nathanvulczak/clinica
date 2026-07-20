-- CliniCore - Control plane técnico, proveniência clínica e timeline canônica.
-- Execute depois de 049_reconcile_rbac_catalog.sql.

create or replace function public.platform_role_can(
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
    from public.profiles p
    where p.id = user_uuid
      and p.deleted_at is null
      and (
        p.platform_role = 'platform_admin'
        or (p.platform_role = 'platform_support' and required_scope in ('overview', 'health', 'diagnostics'))
        or (p.platform_role = 'platform_billing' and required_scope in ('overview', 'billing'))
        or (p.platform_role = 'platform_security' and required_scope in ('overview', 'health', 'audit', 'diagnostics'))
      )
  );
$$;

revoke all on function public.platform_role_can(text, uuid) from public, anon;
grant execute on function public.platform_role_can(text, uuid) to authenticated, service_role;

create table if not exists public.platform_access_grants (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  target_clinic_id uuid references public.clinics(id) on delete restrict,
  scope text not null default 'technical_readonly'
    check (scope in ('technical_readonly', 'support_readonly', 'security_review')),
  reason text not null check (length(btrim(reason)) between 10 and 1000),
  read_only boolean not null default true,
  approval_required boolean not null default true,
  approved_by uuid references public.profiles(id),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'active', 'ended', 'expired', 'rejected')),
  expires_at timestamptz not null,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  constraint platform_access_grants_expiry check (expires_at > created_at)
);

create index if not exists platform_access_grants_actor_idx
on public.platform_access_grants(actor_user_id, status, expires_at desc);

create table if not exists public.platform_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  check_name text not null check (length(btrim(check_name)) between 2 and 100),
  status text not null check (status in ('ok', 'warning', 'error')),
  summary text not null check (length(btrim(summary)) between 2 and 500),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  executed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint platform_health_snapshots_details_no_clinical_content check (
    not (details ? 'patient_id') and not (details ? 'medical_record_id') and not (details ? 'cpf')
  )
);

create index if not exists platform_health_snapshots_check_idx
on public.platform_health_snapshots(check_name, created_at desc);

create table if not exists public.platform_feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_.-]{1,100}$'),
  description text not null,
  enabled boolean not null default false,
  rollout_percent integer not null default 0 check (rollout_percent between 0 and 100),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.platform_feature_flags(key, description, enabled, rollout_percent)
values
  ('clinical.timeline_canonical', 'Usa a timeline clínica canônica por atendimento.', true, 100),
  ('platform.synthetic_diagnostics', 'Permite diagnósticos sintéticos isolados do ambiente clínico.', false, 0)
on conflict (key) do nothing;

alter table public.platform_access_grants enable row level security;
alter table public.platform_health_snapshots enable row level security;
alter table public.platform_feature_flags enable row level security;

revoke all on public.platform_access_grants from anon, public;
revoke all on public.platform_health_snapshots from anon, public;
revoke all on public.platform_feature_flags from anon, public;
grant select, insert, update on public.platform_access_grants to authenticated;
grant select on public.platform_health_snapshots to authenticated;
grant select on public.platform_feature_flags to authenticated;

drop policy if exists platform_access_grants_select on public.platform_access_grants;
create policy platform_access_grants_select
on public.platform_access_grants for select to authenticated
using (public.platform_role_can('overview'));

drop policy if exists platform_access_grants_insert on public.platform_access_grants;
create policy platform_access_grants_insert
on public.platform_access_grants for insert to authenticated
with check (
  actor_user_id = auth.uid()
  and public.platform_role_can('security_review')
  and read_only = true
  and expires_at <= now() + interval '60 minutes'
);

drop policy if exists platform_access_grants_update on public.platform_access_grants;
create policy platform_access_grants_update
on public.platform_access_grants for update to authenticated
using (public.platform_role_can('security_review'))
with check (public.platform_role_can('security_review'));

drop policy if exists platform_health_snapshots_select on public.platform_health_snapshots;
create policy platform_health_snapshots_select
on public.platform_health_snapshots for select to authenticated
using (public.platform_role_can('health'));

drop policy if exists platform_feature_flags_select on public.platform_feature_flags;
create policy platform_feature_flags_select
on public.platform_feature_flags for select to authenticated
using (public.platform_role_can('overview'));

create table if not exists public.clinical_field_mappings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  source_module text not null,
  source_field text not null,
  target_module text not null,
  target_field text not null,
  strategy text not null default 'fill_empty' check (strategy in ('fill_empty', 'always_show_context')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (clinic_id, source_module, source_field, target_module, target_field)
);

create index if not exists clinical_field_mappings_lookup_idx
on public.clinical_field_mappings(clinic_id, source_module, target_module, active)
where deleted_at is null;

alter table public.clinical_field_mappings enable row level security;
grant select, insert, update on public.clinical_field_mappings to authenticated;

drop policy if exists clinical_field_mappings_select on public.clinical_field_mappings;
create policy clinical_field_mappings_select
on public.clinical_field_mappings for select to authenticated
using (
  public.user_has_permission(clinic_id, 'medical_records', 'view')
  or public.user_has_permission(clinic_id, 'nursing', 'view')
);

drop policy if exists clinical_field_mappings_manage on public.clinical_field_mappings;
create policy clinical_field_mappings_manage
on public.clinical_field_mappings for all to authenticated
using (public.user_has_permission(clinic_id, 'medical_records', 'manage'))
with check (public.user_has_permission(clinic_id, 'medical_records', 'manage'));

create or replace function public.seed_clinical_field_mappings(clinic_uuid uuid, actor_uuid uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.clinical_field_mappings(
    clinic_id, source_module, source_field, target_module, target_field,
    strategy, created_by, updated_by
  )
  values
    (clinic_uuid, 'nursing_assessments', 'chief_complaint', 'clinical_form', 'chief_complaint', 'fill_empty', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'allergies', 'clinical_form', 'allergies', 'always_show_context', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'current_medications', 'clinical_form', 'current_medications', 'always_show_context', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'comorbidities', 'clinical_form', 'comorbidities', 'always_show_context', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'systolic_bp', 'clinical_form', 'systolic_bp', 'fill_empty', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'diastolic_bp', 'clinical_form', 'diastolic_bp', 'fill_empty', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'heart_rate', 'clinical_form', 'heart_rate', 'fill_empty', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'respiratory_rate', 'clinical_form', 'respiratory_rate', 'fill_empty', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'temperature_c', 'clinical_form', 'temperature_c', 'fill_empty', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'oxygen_saturation', 'clinical_form', 'oxygen_saturation', 'fill_empty', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'capillary_glucose', 'clinical_form', 'capillary_glucose', 'fill_empty', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'weight_kg', 'clinical_form', 'weight_kg', 'fill_empty', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'height_cm', 'clinical_form', 'height_cm', 'fill_empty', actor_uuid, actor_uuid),
    (clinic_uuid, 'nursing_assessments', 'bmi', 'clinical_form', 'bmi', 'fill_empty', actor_uuid, actor_uuid)
  on conflict (clinic_id, source_module, source_field, target_module, target_field)
  do update set active = true, deleted_at = null, updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.seed_clinical_field_mappings(uuid, uuid) from public, anon, authenticated;
grant execute on function public.seed_clinical_field_mappings(uuid, uuid) to service_role;

do $$
declare clinic_record record;
begin
  for clinic_record in select id, created_by from public.clinics where deleted_at is null loop
    perform public.seed_clinical_field_mappings(clinic_record.id, clinic_record.created_by);
  end loop;
end $$;

create or replace function public.seed_clinical_field_mappings_after_clinic_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_clinical_field_mappings(new.id, new.created_by);
  return new;
end;
$$;

drop trigger if exists seed_clinical_field_mappings_after_clinic_insert on public.clinics;
create trigger seed_clinical_field_mappings_after_clinic_insert
after insert on public.clinics
for each row execute function public.seed_clinical_field_mappings_after_clinic_insert();

create table if not exists public.clinical_timeline_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_member_id uuid references public.clinic_members(id) on delete set null,
  event_type text not null,
  title text not null,
  summary text not null default '',
  source_table text not null,
  source_id uuid,
  from_status public.clinical_encounter_status,
  to_status public.clinical_encounter_status,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create index if not exists clinical_timeline_events_encounter_idx
on public.clinical_timeline_events(encounter_id, occurred_at desc)
where deleted_at is null;

create index if not exists clinical_timeline_events_patient_idx
on public.clinical_timeline_events(clinic_id, patient_id, occurred_at desc)
where deleted_at is null;

alter table public.clinical_timeline_events enable row level security;
grant select on public.clinical_timeline_events to authenticated;

drop policy if exists clinical_timeline_events_select on public.clinical_timeline_events;
create policy clinical_timeline_events_select
on public.clinical_timeline_events for select to authenticated
using (
  deleted_at is null
  and (
    public.user_has_permission(clinic_id, 'medical_records', 'view')
    or public.user_has_permission(clinic_id, 'nursing', 'view')
    or public.user_has_permission(clinic_id, 'schedule', 'manage')
    or exists (
      select 1 from public.clinic_members cm
      where cm.id = clinical_timeline_events.professional_member_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.deleted_at is null
        and public.user_has_permission(clinic_id, 'medical_records', 'access_medical_record')
    )
  )
);

create or replace function public.insert_clinical_timeline_event(
  encounter_uuid uuid,
  event_kind text,
  event_title text,
  event_summary text,
  source_table_name text,
  source_uuid uuid,
  event_metadata jsonb default '{}'::jsonb,
  event_occurred_at timestamptz default now(),
  actor_uuid uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  encounter_row public.clinical_encounters%rowtype;
  timeline_uuid uuid;
begin
  select * into encounter_row from public.clinical_encounters where id = encounter_uuid and deleted_at is null;
  if encounter_row.id is null then return null; end if;

  insert into public.clinical_timeline_events(
    clinic_id, encounter_id, patient_id, professional_member_id,
    event_type, title, summary, source_table, source_id, metadata,
    occurred_at, actor_id, created_by, updated_by
  ) values (
    encounter_row.clinic_id, encounter_row.id, encounter_row.patient_id, encounter_row.professional_member_id,
    left(event_kind, 120), left(event_title, 180), left(coalesce(event_summary, ''), 1200),
    left(source_table_name, 120), source_uuid, coalesce(event_metadata, '{}'::jsonb),
    coalesce(event_occurred_at, now()), actor_uuid, actor_uuid, actor_uuid
  ) returning id into timeline_uuid;
  return timeline_uuid;
end;
$$;

revoke all on function public.insert_clinical_timeline_event(uuid, text, text, text, text, uuid, jsonb, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.insert_clinical_timeline_event(uuid, text, text, text, text, uuid, jsonb, timestamptz, uuid) to service_role;

create or replace function public.timeline_from_encounter_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.insert_clinical_timeline_event(
    new.encounter_id, 'workflow', 'Etapa assistencial atualizada',
    concat_ws(' | ', new.from_status::text, new.to_status::text, new.reason),
    'clinical_encounter_events', new.id,
    jsonb_build_object('from_status', new.from_status, 'to_status', new.to_status),
    new.created_at, coalesce(new.created_by, auth.uid())
  );
  return new;
end;
$$;

create or replace function public.timeline_from_nursing_assessment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.insert_clinical_timeline_event(
    new.encounter_id,
    case when new.status = 'completed' then 'nursing_completed' else 'nursing_saved' end,
    case when new.status = 'completed' then 'Pré-consulta de enfermagem encerrada' else 'Registro de enfermagem atualizado' end,
    concat('Status: ', new.status), 'nursing_assessments', new.id,
    jsonb_build_object('status', new.status, 'completed_at', new.completed_at),
    coalesce(new.completed_at, new.updated_at), coalesce(new.updated_by, new.performed_by, auth.uid())
  );
  return new;
end;
$$;

create or replace function public.timeline_from_medical_record()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.insert_clinical_timeline_event(
    new.encounter_id,
    case when new.status = 'completed' then 'medical_record_completed' else 'medical_record_saved' end,
    case when new.status = 'completed' then 'Prontuário concluído' else 'Prontuário atualizado' end,
    concat('Status: ', new.status), 'medical_records', new.id,
    jsonb_build_object('status', new.status, 'completed_at', new.completed_at),
    coalesce(new.completed_at, new.updated_at), coalesce(new.updated_by, new.performed_by, auth.uid())
  );
  return new;
end;
$$;

create or replace function public.timeline_from_prescription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.insert_clinical_timeline_event(
    new.encounter_id, 'clinical_document',
    case when new.status = 'issued' then 'Documento clínico emitido' else 'Documento clínico atualizado' end,
    concat(new.title, ' | Status: ', new.status), 'medical_prescriptions', new.id,
    jsonb_build_object('status', new.status, 'template_key', new.template_key),
    coalesce(new.issued_at, new.updated_at), coalesce(new.updated_by, new.created_by, auth.uid())
  );
  return new;
end;
$$;

create or replace function public.timeline_from_document_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.insert_clinical_timeline_event(
    new.encounter_id, 'document_event', 'Evento de documento clínico',
    concat(new.event_type, case when new.reason is not null then concat(' | ', new.reason) else '' end),
    'medical_document_events', new.id, jsonb_build_object('event_type', new.event_type),
    new.created_at, new.created_by
  );
  return new;
end;
$$;

create or replace function public.timeline_from_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.encounter_id is not null then
    perform public.insert_clinical_timeline_event(
      new.encounter_id, 'clinical_comment', 'Comentário clínico registrado',
      concat('Visibilidade: ', new.visibility), 'patient_clinical_comments', new.id,
      jsonb_build_object('visibility', new.visibility), new.created_at, new.created_by
    );
  end if;
  return new;
end;
$$;

create or replace function public.timeline_from_attachment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.insert_clinical_timeline_event(
    new.encounter_id, 'clinical_attachment',
    case when new.status = 'deleted' then 'Anexo clínico excluído' else 'Anexo clínico registrado' end,
    concat(new.category, ' | ', new.file_name), 'medical_record_attachments', new.id,
    jsonb_build_object('category', new.category, 'status', new.status), new.created_at,
    coalesce(new.updated_by, new.created_by, auth.uid())
  );
  return new;
end;
$$;

create or replace function public.timeline_from_correction_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.insert_clinical_timeline_event(
    new.encounter_id, 'clinical_correction', 'Correção clínica formal solicitada',
    concat('Status: ', new.status), 'medical_record_correction_requests', new.id,
    jsonb_build_object('status', new.status), new.created_at, new.created_by
  );
  return new;
end;
$$;

drop trigger if exists clinical_timeline_from_encounter_event on public.clinical_encounter_events;
create trigger clinical_timeline_from_encounter_event after insert on public.clinical_encounter_events
for each row execute function public.timeline_from_encounter_event();
drop trigger if exists clinical_timeline_from_nursing_assessment on public.nursing_assessments;
create trigger clinical_timeline_from_nursing_assessment after insert or update of status, completed_at on public.nursing_assessments
for each row execute function public.timeline_from_nursing_assessment();
drop trigger if exists clinical_timeline_from_medical_record on public.medical_records;
create trigger clinical_timeline_from_medical_record after insert or update of status, completed_at on public.medical_records
for each row execute function public.timeline_from_medical_record();
drop trigger if exists clinical_timeline_from_prescription on public.medical_prescriptions;
create trigger clinical_timeline_from_prescription after insert or update of status, issued_at on public.medical_prescriptions
for each row execute function public.timeline_from_prescription();
drop trigger if exists clinical_timeline_from_document_event on public.medical_document_events;
create trigger clinical_timeline_from_document_event after insert on public.medical_document_events
for each row execute function public.timeline_from_document_event();
drop trigger if exists clinical_timeline_from_comment on public.patient_clinical_comments;
create trigger clinical_timeline_from_comment after insert on public.patient_clinical_comments
for each row execute function public.timeline_from_comment();
drop trigger if exists clinical_timeline_from_attachment on public.medical_record_attachments;
create trigger clinical_timeline_from_attachment after insert or update of status on public.medical_record_attachments
for each row execute function public.timeline_from_attachment();
drop trigger if exists clinical_timeline_from_correction_request on public.medical_record_correction_requests;
create trigger clinical_timeline_from_correction_request after insert or update of status on public.medical_record_correction_requests
for each row execute function public.timeline_from_correction_request();

insert into public.clinical_timeline_events(
  clinic_id, encounter_id, patient_id, professional_member_id, event_type, title,
  summary, source_table, source_id, from_status, to_status, metadata, occurred_at,
  actor_id, created_at, created_by, updated_by
)
select
  event.clinic_id, event.encounter_id, encounter.patient_id, encounter.professional_member_id,
  'workflow', 'Etapa assistencial atualizada',
  concat_ws(' | ', event.from_status::text, event.to_status::text, event.reason),
  'clinical_encounter_events', event.id, event.from_status, event.to_status,
  jsonb_build_object('from_status', event.from_status, 'to_status', event.to_status),
  event.created_at, event.created_by, event.created_at, event.created_by, event.updated_by
from public.clinical_encounter_events event
join public.clinical_encounters encounter on encounter.id = event.encounter_id
where event.deleted_at is null
  and not exists (
    select 1 from public.clinical_timeline_events timeline
    where timeline.source_table = 'clinical_encounter_events' and timeline.source_id = event.id
  );

insert into public.clinical_timeline_events(
  clinic_id, encounter_id, patient_id, professional_member_id, event_type, title,
  summary, source_table, source_id, metadata, occurred_at, actor_id, created_at, created_by, updated_by
)
select
  item.clinic_id, item.encounter_id, item.patient_id, item.professional_member_id,
  case when item.status = 'completed' then 'nursing_completed' else 'nursing_saved' end,
  case when item.status = 'completed' then 'Pré-consulta de enfermagem encerrada' else 'Registro de enfermagem atualizado' end,
  concat('Status: ', item.status), 'nursing_assessments', item.id,
  jsonb_build_object('status', item.status, 'completed_at', item.completed_at),
  coalesce(item.completed_at, item.updated_at), coalesce(item.updated_by, item.performed_by, item.created_by),
  item.created_at, item.created_by, item.updated_by
from public.nursing_assessments item
where item.deleted_at is null
  and not exists (select 1 from public.clinical_timeline_events timeline where timeline.source_table = 'nursing_assessments' and timeline.source_id = item.id);

insert into public.clinical_timeline_events(
  clinic_id, encounter_id, patient_id, professional_member_id, event_type, title,
  summary, source_table, source_id, metadata, occurred_at, actor_id, created_at, created_by, updated_by
)
select
  item.clinic_id, item.encounter_id, item.patient_id, item.professional_member_id,
  case when item.status = 'completed' then 'medical_record_completed' else 'medical_record_saved' end,
  case when item.status = 'completed' then 'Prontuário concluído' else 'Prontuário atualizado' end,
  concat('Status: ', item.status), 'medical_records', item.id,
  jsonb_build_object('status', item.status, 'completed_at', item.completed_at),
  coalesce(item.completed_at, item.updated_at), coalesce(item.updated_by, item.performed_by, item.created_by),
  item.created_at, item.created_by, item.updated_by
from public.medical_records item
where item.deleted_at is null
  and not exists (select 1 from public.clinical_timeline_events timeline where timeline.source_table = 'medical_records' and timeline.source_id = item.id);

create table if not exists public.clinical_protocol_correction_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  protocol_run_id uuid not null references public.clinical_protocol_runs(id) on delete cascade,
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  from_step_key text not null,
  requested_step_key text not null,
  reason text not null check (length(btrim(reason)) between 10 and 1000),
  status text not null default 'open' check (status in ('open', 'applied', 'rejected', 'cancelled')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create index if not exists clinical_protocol_correction_requests_run_idx
on public.clinical_protocol_correction_requests(protocol_run_id, created_at desc);

alter table public.clinical_protocol_correction_requests enable row level security;
grant select, insert, update on public.clinical_protocol_correction_requests to authenticated;

drop policy if exists clinical_protocol_correction_requests_select on public.clinical_protocol_correction_requests;
create policy clinical_protocol_correction_requests_select
on public.clinical_protocol_correction_requests for select to authenticated
using (public.user_has_permission(clinic_id, 'medical_records', 'view'));

drop policy if exists clinical_protocol_correction_requests_manage on public.clinical_protocol_correction_requests;
create policy clinical_protocol_correction_requests_manage
on public.clinical_protocol_correction_requests for all to authenticated
using (public.user_has_permission(clinic_id, 'medical_records', 'manage'))
with check (public.user_has_permission(clinic_id, 'medical_records', 'manage'));

create or replace function public.request_clinical_protocol_correction(
  run_uuid uuid,
  requested_step text,
  correction_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  run_row public.clinical_protocol_runs%rowtype;
  request_uuid uuid;
begin
  if actor_uuid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into run_row from public.clinical_protocol_runs where id = run_uuid and deleted_at is null for update;
  if run_row.id is null then raise exception 'CLINICAL_PROTOCOL_RUN_NOT_FOUND' using errcode = 'P0002'; end if;
  if not public.can_access_clinical_record(run_row.clinic_id, run_row.professional_member_id, 'edit', actor_uuid) then
    raise exception 'CLINICAL_PROTOCOL_CORRECTION_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  if nullif(btrim(correction_reason), '') is null or length(btrim(correction_reason)) < 10 then
    raise exception 'CLINICAL_PROTOCOL_CORRECTION_REASON_REQUIRED' using errcode = '22023';
  end if;
  insert into public.clinical_protocol_correction_requests(
    clinic_id, protocol_run_id, encounter_id, from_step_key, requested_step_key,
    reason, created_by, updated_by
  ) values (
    run_row.clinic_id, run_row.id, run_row.encounter_id, run_row.current_step_key,
    btrim(requested_step), btrim(correction_reason), actor_uuid, actor_uuid
  ) returning id into request_uuid;
  insert into public.audit_logs(
    clinic_id, user_id, action_type, module, record_table, record_id,
    new_values, level, notes, created_by, updated_by
  ) values (
    run_row.clinic_id, actor_uuid, 'clinical_protocol_correction_requested', 'medical_records',
    'clinical_protocol_correction_requests', request_uuid,
    jsonb_build_object('from_step', run_row.current_step_key, 'requested_step', btrim(requested_step)),
    'security', 'Correção formal de etapa clínica solicitada.', actor_uuid, actor_uuid
  );
  return request_uuid;
end;
$$;

revoke all on function public.request_clinical_protocol_correction(uuid, text, text) from public, anon;
grant execute on function public.request_clinical_protocol_correction(uuid, text, text) to authenticated;

insert into public.app_migration_history(migration_name, description, source, notes)
values (
  '051_platform_control_and_clinical_provenance.sql',
  'Control plane técnico, mapeamento oficial de campos, timeline clínica canônica e correções formais de protocolo.',
  'pipeline',
  'O control plane não concede acesso clínico; break glass permanece somente leitura, temporário e auditável.'
)
on conflict (migration_name) do nothing;
