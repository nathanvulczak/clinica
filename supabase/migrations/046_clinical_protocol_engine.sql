-- CliniCore - Motor de protocolos clinicos versionados.
-- Execute after 045_diagnostic_requests_attachments.sql.

create table if not exists public.clinical_protocols (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  description text,
  specialty_slug text,
  service_id uuid references public.clinic_services(id) on delete set null,
  professional_member_id uuid references public.clinic_members(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint clinical_protocols_name_not_blank check (length(btrim(name)) between 2 and 160),
  constraint clinical_protocols_slug_format check (
    specialty_slug is null or specialty_slug ~ '^[a-z][a-z0-9_]{2,79}$'
  )
);

create index if not exists clinical_protocols_scope_idx
on public.clinical_protocols (clinic_id, active, specialty_slug, service_id, professional_member_id)
where deleted_at is null;

create table if not exists public.clinical_protocol_versions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  protocol_id uuid not null references public.clinical_protocols(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  definition jsonb not null default '{"steps":[]}'::jsonb,
  change_summary text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint clinical_protocol_versions_definition_shape check (
    jsonb_typeof(definition) = 'object'
    and jsonb_typeof(definition->'steps') = 'array'
  ),
  unique (protocol_id, version_number)
);

create unique index if not exists clinical_protocol_versions_published_unique
on public.clinical_protocol_versions (protocol_id)
where status = 'published' and deleted_at is null;

create index if not exists clinical_protocol_versions_lookup_idx
on public.clinical_protocol_versions (clinic_id, protocol_id, status, version_number desc)
where deleted_at is null;

create table if not exists public.clinical_protocol_runs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  protocol_id uuid not null references public.clinical_protocols(id),
  protocol_version_id uuid not null references public.clinical_protocol_versions(id),
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id),
  patient_id uuid not null references public.patients(id),
  professional_member_id uuid not null references public.clinic_members(id),
  version_snapshot jsonb not null,
  current_step_key text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint clinical_protocol_runs_snapshot_shape check (jsonb_typeof(version_snapshot) = 'object'),
  unique (encounter_id)
);

create index if not exists clinical_protocol_runs_patient_idx
on public.clinical_protocol_runs (clinic_id, patient_id, started_at desc)
where deleted_at is null;

create index if not exists clinical_protocol_runs_queue_idx
on public.clinical_protocol_runs (clinic_id, status, current_step_key, started_at)
where deleted_at is null;

create table if not exists public.clinical_protocol_step_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  protocol_run_id uuid not null references public.clinical_protocol_runs(id) on delete cascade,
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  from_step_key text,
  to_step_key text not null,
  event_type text not null check (event_type in ('started', 'advanced', 'corrected', 'completed', 'cancelled')),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint clinical_protocol_step_events_metadata_shape check (jsonb_typeof(metadata) = 'object')
);

create index if not exists clinical_protocol_step_events_run_idx
on public.clinical_protocol_step_events (protocol_run_id, created_at desc);

drop trigger if exists set_clinical_protocols_updated_at on public.clinical_protocols;
create trigger set_clinical_protocols_updated_at
before update on public.clinical_protocols
for each row execute function public.set_updated_at();

drop trigger if exists set_clinical_protocol_versions_updated_at on public.clinical_protocol_versions;
create trigger set_clinical_protocol_versions_updated_at
before update on public.clinical_protocol_versions
for each row execute function public.set_updated_at();

drop trigger if exists set_clinical_protocol_runs_updated_at on public.clinical_protocol_runs;
create trigger set_clinical_protocol_runs_updated_at
before update on public.clinical_protocol_runs
for each row execute function public.set_updated_at();

alter table public.clinical_protocols enable row level security;
alter table public.clinical_protocol_versions enable row level security;
alter table public.clinical_protocol_runs enable row level security;
alter table public.clinical_protocol_step_events enable row level security;

drop policy if exists "clinical_protocols_select_authorized" on public.clinical_protocols;
create policy "clinical_protocols_select_authorized"
on public.clinical_protocols for select to authenticated
using (
  deleted_at is null
  and public.user_has_permission(clinic_id, 'medical_records', 'view')
);

drop policy if exists "clinical_protocols_manage_authorized" on public.clinical_protocols;
create policy "clinical_protocols_manage_authorized"
on public.clinical_protocols for all to authenticated
using (public.user_has_permission(clinic_id, 'medical_records', 'manage'))
with check (public.user_has_permission(clinic_id, 'medical_records', 'manage'));

drop policy if exists "clinical_protocol_versions_select_authorized" on public.clinical_protocol_versions;
create policy "clinical_protocol_versions_select_authorized"
on public.clinical_protocol_versions for select to authenticated
using (
  deleted_at is null
  and public.user_has_permission(clinic_id, 'medical_records', 'view')
);

drop policy if exists "clinical_protocol_versions_manage_authorized" on public.clinical_protocol_versions;
create policy "clinical_protocol_versions_manage_authorized"
on public.clinical_protocol_versions for all to authenticated
using (public.user_has_permission(clinic_id, 'medical_records', 'manage'))
with check (public.user_has_permission(clinic_id, 'medical_records', 'manage'));

drop policy if exists "clinical_protocol_runs_select_authorized" on public.clinical_protocol_runs;
create policy "clinical_protocol_runs_select_authorized"
on public.clinical_protocol_runs for select to authenticated
using (
  deleted_at is null
  and public.can_access_clinical_record(clinic_id, professional_member_id, 'view')
);

drop policy if exists "clinical_protocol_events_select_authorized" on public.clinical_protocol_step_events;
create policy "clinical_protocol_events_select_authorized"
on public.clinical_protocol_step_events for select to authenticated
using (
  public.can_access_clinical_record(
    clinic_id,
    (select run.professional_member_id from public.clinical_protocol_runs run where run.id = protocol_run_id),
    'view'
  )
);

grant select on public.clinical_protocols to authenticated;
grant select on public.clinical_protocol_versions to authenticated;
grant select on public.clinical_protocol_runs to authenticated;
grant select on public.clinical_protocol_step_events to authenticated;

create or replace function public.save_clinical_protocol_transaction(
  protocol_payload jsonb,
  version_definition jsonb,
  publish_version boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  clinic_uuid uuid := nullif(protocol_payload->>'clinic_id', '')::uuid;
  protocol_uuid uuid := nullif(protocol_payload->>'protocol_id', '')::uuid;
  service_uuid uuid := nullif(protocol_payload->>'service_id', '')::uuid;
  professional_uuid uuid := nullif(protocol_payload->>'professional_member_id', '')::uuid;
  protocol_name text := nullif(btrim(protocol_payload->>'name'), '');
  protocol_row public.clinical_protocols%rowtype;
  next_version integer;
  version_uuid uuid;
begin
  if actor_uuid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if clinic_uuid is null or not public.user_has_permission(clinic_uuid, 'medical_records', 'manage', actor_uuid) then
    raise exception 'CLINICAL_PROTOCOL_MANAGE_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  if protocol_name is null or length(protocol_name) < 2 then
    raise exception 'CLINICAL_PROTOCOL_NAME_REQUIRED' using errcode = '22023';
  end if;
  if jsonb_typeof(version_definition) <> 'object' or jsonb_typeof(version_definition->'steps') <> 'array' then
    raise exception 'CLINICAL_PROTOCOL_DEFINITION_INVALID' using errcode = '22023';
  end if;

  if protocol_uuid is null then
    insert into public.clinical_protocols (
      clinic_id, name, description, specialty_slug, service_id, professional_member_id,
      active, created_by, updated_by
    ) values (
      clinic_uuid, protocol_name, nullif(btrim(protocol_payload->>'description'), ''),
      nullif(protocol_payload->>'specialty_slug', ''), service_uuid, professional_uuid,
      coalesce((protocol_payload->>'active')::boolean, true), actor_uuid, actor_uuid
    ) returning * into protocol_row;
  else
    select * into protocol_row
    from public.clinical_protocols
    where id = protocol_uuid and clinic_id = clinic_uuid and deleted_at is null
    for update;
    if protocol_row.id is null then
      raise exception 'CLINICAL_PROTOCOL_NOT_FOUND' using errcode = 'P0002';
    end if;
    update public.clinical_protocols
    set name = protocol_name,
        description = nullif(btrim(protocol_payload->>'description'), ''),
        specialty_slug = nullif(protocol_payload->>'specialty_slug', ''),
        service_id = service_uuid,
        professional_member_id = professional_uuid,
        active = coalesce((protocol_payload->>'active')::boolean, true),
        updated_by = actor_uuid
    where id = protocol_uuid;
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.clinical_protocol_versions
  where protocol_id = protocol_row.id and deleted_at is null;

  if publish_version then
    update public.clinical_protocol_versions
    set status = 'archived', updated_by = actor_uuid
    where protocol_id = protocol_row.id and status = 'published' and deleted_at is null;
  end if;

  insert into public.clinical_protocol_versions (
    clinic_id, protocol_id, version_number, status, definition, change_summary,
    published_at, created_by, updated_by
  ) values (
    clinic_uuid, protocol_row.id, next_version,
    case when publish_version then 'published' else 'draft' end,
    version_definition,
    nullif(btrim(protocol_payload->>'change_summary'), ''),
    case when publish_version then now() else null end,
    actor_uuid, actor_uuid
  ) returning id into version_uuid;

  insert into public.audit_logs (
    clinic_id, user_id, action_type, module, record_table, record_id,
    new_values, level, notes, created_by, updated_by
  ) values (
    clinic_uuid, actor_uuid,
    case when publish_version then 'clinical_protocol_published' else 'clinical_protocol_version_created' end,
    'medical_records', 'clinical_protocols', protocol_row.id,
    jsonb_build_object('protocol_id', protocol_row.id, 'version_id', version_uuid, 'version_number', next_version),
    'security', 'Protocolo clinico versionado e registrado.', actor_uuid, actor_uuid
  );

  return protocol_row.id;
end;
$$;

revoke all on function public.save_clinical_protocol_transaction(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.save_clinical_protocol_transaction(jsonb, jsonb, boolean) to authenticated;

create or replace function public.start_clinical_protocol_run(encounter_uuid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  encounter_row record;
  protocol_row record;
  first_step jsonb;
  run_uuid uuid;
begin
  if actor_uuid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  select ce.*, a.service_id into encounter_row
  from public.clinical_encounters ce
  join public.appointments a on a.id = ce.appointment_id
  where ce.id = encounter_uuid and ce.deleted_at is null;
  if encounter_row.id is null then raise exception 'ENCOUNTER_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (
    public.user_has_permission(encounter_row.clinic_id, 'medical_records', 'create', actor_uuid)
    or public.user_has_permission(encounter_row.clinic_id, 'medical_records', 'manage', actor_uuid)
    or public.user_has_permission(encounter_row.clinic_id, 'schedule', 'manage', actor_uuid)
  ) then
    raise exception 'CLINICAL_PROTOCOL_RUN_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  select cpr.id into run_uuid
  from public.clinical_protocol_runs cpr
  where cpr.encounter_id = encounter_uuid and cpr.deleted_at is null;
  if run_uuid is not null then return run_uuid; end if;

  select cp.id, cpv.id as version_id, cpv.definition
  into protocol_row
  from public.clinical_protocols cp
  join public.clinical_protocol_versions cpv on cpv.protocol_id = cp.id
  where cp.clinic_id = encounter_row.clinic_id
    and cp.active = true
    and cp.deleted_at is null
    and cpv.status = 'published'
    and cpv.deleted_at is null
    and (cp.service_id is null or cp.service_id = encounter_row.service_id)
    and (cp.professional_member_id is null or cp.professional_member_id = encounter_row.professional_member_id)
  order by
    (cp.professional_member_id is not null) desc,
    (cp.service_id is not null) desc,
    cp.updated_at desc
  limit 1;
  if protocol_row.id is null then raise exception 'CLINICAL_PROTOCOL_NOT_CONFIGURED' using errcode = 'P0002'; end if;

  select value into first_step
  from jsonb_array_elements(protocol_row.definition->'steps') value
  order by coalesce((value->>'position')::integer, 999999)
  limit 1;
  if first_step is null or nullif(first_step->>'key', '') is null then
    raise exception 'CLINICAL_PROTOCOL_FIRST_STEP_INVALID' using errcode = '22023';
  end if;

  insert into public.clinical_protocol_runs (
    clinic_id, protocol_id, protocol_version_id, encounter_id, appointment_id,
    patient_id, professional_member_id, version_snapshot, current_step_key,
    created_by, updated_by
  ) values (
    encounter_row.clinic_id, protocol_row.id, protocol_row.version_id, encounter_uuid,
    encounter_row.appointment_id, encounter_row.patient_id, encounter_row.professional_member_id,
    protocol_row.definition, first_step->>'key', actor_uuid, actor_uuid
  ) returning id into run_uuid;

  insert into public.clinical_protocol_step_events (
    clinic_id, protocol_run_id, encounter_id, to_step_key, event_type, created_by
  ) values (encounter_row.clinic_id, run_uuid, encounter_uuid, first_step->>'key', 'started', actor_uuid);

  return run_uuid;
end;
$$;

revoke all on function public.start_clinical_protocol_run(uuid) from public, anon;
grant execute on function public.start_clinical_protocol_run(uuid) to authenticated;

create or replace function public.advance_clinical_protocol_run(
  run_uuid uuid,
  target_step_key text,
  transition_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  run_row public.clinical_protocol_runs%rowtype;
  target_step jsonb;
  current_position integer;
  target_position integer;
  required_key text;
  response_value jsonb;
  target_terminal boolean;
  correction boolean := false;
begin
  if actor_uuid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into run_row from public.clinical_protocol_runs where id = run_uuid and deleted_at is null for update;
  if run_row.id is null then raise exception 'CLINICAL_PROTOCOL_RUN_NOT_FOUND' using errcode = 'P0002'; end if;
  if run_row.status <> 'in_progress' then raise exception 'CLINICAL_PROTOCOL_RUN_CLOSED' using errcode = 'check_violation'; end if;
  if not (
    public.can_access_clinical_record(run_row.clinic_id, run_row.professional_member_id, 'edit', actor_uuid)
    or public.user_has_permission(run_row.clinic_id, 'medical_records', 'manage', actor_uuid)
  ) then raise exception 'CLINICAL_PROTOCOL_RUN_EDIT_PERMISSION_REQUIRED' using errcode = '42501'; end if;

  select value into target_step
  from jsonb_array_elements(run_row.version_snapshot->'steps') value
  where value->>'key' = target_step_key;
  if target_step is null then raise exception 'CLINICAL_PROTOCOL_STEP_NOT_FOUND' using errcode = 'P0002'; end if;

  select coalesce((value->>'position')::integer, 999999) into current_position
  from jsonb_array_elements(run_row.version_snapshot->'steps') value
  where value->>'key' = run_row.current_step_key;
  target_position := coalesce((target_step->>'position')::integer, 999999);
  correction := target_position <= coalesce(current_position, 999999) or target_position > coalesce(current_position, 999999) + 1;
  if correction and not public.user_has_permission(run_row.clinic_id, 'medical_records', 'manage', actor_uuid) then
    raise exception 'CLINICAL_PROTOCOL_NON_LINEAR_TRANSITION' using errcode = '42501';
  end if;
  if correction and nullif(btrim(transition_reason), '') is null then
    raise exception 'CLINICAL_PROTOCOL_CORRECTION_REASON_REQUIRED' using errcode = '22023';
  end if;

  for required_key in select jsonb_array_elements_text(coalesce(target_step->'required_fields', '[]'::jsonb)) loop
    select cfi.responses->required_key into response_value
    from public.clinical_form_instances cfi
    where cfi.encounter_id = run_row.encounter_id and cfi.is_current = true and cfi.deleted_at is null;
    if response_value is null or response_value = 'null'::jsonb or response_value = '""'::jsonb or response_value = '[]'::jsonb then
      raise exception 'CLINICAL_PROTOCOL_REQUIRED_FIELD:%', required_key using errcode = 'check_violation';
    end if;
  end loop;

  target_terminal := coalesce((target_step->>'terminal')::boolean, false);
  update public.clinical_protocol_runs
  set current_step_key = target_step_key,
      status = case when target_terminal then 'completed' else 'in_progress' end,
      completed_at = case when target_terminal then now() else null end,
      updated_by = actor_uuid
  where id = run_uuid;

  insert into public.clinical_protocol_step_events (
    clinic_id, protocol_run_id, encounter_id, from_step_key, to_step_key,
    event_type, reason, created_by
  ) values (
    run_row.clinic_id, run_uuid, run_row.encounter_id, run_row.current_step_key, target_step_key,
    case when target_terminal then 'completed' when correction then 'corrected' else 'advanced' end,
    nullif(btrim(transition_reason), ''), actor_uuid
  );

  insert into public.audit_logs (
    clinic_id, user_id, action_type, module, record_table, record_id,
    new_values, level, notes, created_by, updated_by
  ) values (
    run_row.clinic_id, actor_uuid, 'clinical_protocol_step_changed', 'medical_records',
    'clinical_protocol_runs', run_uuid,
    jsonb_build_object('from', run_row.current_step_key, 'to', target_step_key, 'status', case when target_terminal then 'completed' else 'in_progress' end),
    'security', 'Etapa do protocolo clinico alterada com rastreabilidade.', actor_uuid, actor_uuid
  );

  return run_uuid;
end;
$$;

revoke all on function public.advance_clinical_protocol_run(uuid, text, text) from public, anon;
grant execute on function public.advance_clinical_protocol_run(uuid, text, text) to authenticated;

create or replace function public.seed_clinical_protocols(
  clinic_uuid uuid,
  actor_uuid uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  protocol_uuid uuid;
begin
  if exists (
    select 1 from public.clinical_protocols
    where clinic_id = clinic_uuid and deleted_at is null
  ) then return; end if;

  insert into public.clinical_protocols (
    clinic_id, name, description, specialty_slug, active, created_by, updated_by
  ) values (
    clinic_uuid,
    'Fluxo clinico essencial',
    'Fluxo inicial para chegada, pre-consulta opcional, consulta, fechamento e cobranca.',
    'general_medicine', true, actor_uuid, actor_uuid
  ) returning id into protocol_uuid;

  insert into public.clinical_protocol_versions (
    clinic_id, protocol_id, version_number, status, definition, change_summary,
    published_at, created_by, updated_by
  ) values (
    clinic_uuid, protocol_uuid, 1, 'published',
    '{"steps":[
      {"key":"arrival","title":"Paciente chegou","kind":"check_in","position":10,"responsible_roles":["receptionist","clinic_admin","clinic_owner"]},
      {"key":"preconsultation","title":"Pre-consulta","kind":"nursing","position":20,"required_fields":["chief_complaint","risk_level"]},
      {"key":"consultation","title":"Consulta profissional","kind":"clinical_form","position":30,"required_fields":["assessment","plan"]},
      {"key":"closure","title":"Encerrar atendimento","kind":"checklist","position":40},
      {"key":"billing","title":"Liberar cobranca","kind":"billing","position":50,"terminal":true}
    ]}'::jsonb,
    'Protocolo inicial criado automaticamente.', now(), actor_uuid, actor_uuid
  );
end;
$$;

revoke all on function public.seed_clinical_protocols(uuid, uuid) from public, anon, authenticated;
grant execute on function public.seed_clinical_protocols(uuid, uuid) to service_role;

create or replace function public.seed_clinical_forms_after_clinic_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_clinical_form_templates(new.id, new.created_by);
  perform public.seed_specialty_immersion_templates(new.id, new.created_by);
  perform public.seed_clinical_protocols(new.id, new.created_by);
  return new;
end;
$$;

do $$
declare
  clinic_record record;
begin
  for clinic_record in select id, created_by from public.clinics where deleted_at is null loop
    perform public.seed_clinical_protocols(clinic_record.id, clinic_record.created_by);
  end loop;
end $$;

insert into public.app_migration_history (migration_name, description, source, notes)
values (
  '046_clinical_protocol_engine.sql',
  'Motor de protocolos clinicos versionados, execucao por atendimento e trilha de etapas.',
  'supabase_sql_editor',
  'Versoes publicadas preservam snapshot no atendimento e correcoes exigem permissao e motivo.'
)
on conflict (migration_name) do nothing;
