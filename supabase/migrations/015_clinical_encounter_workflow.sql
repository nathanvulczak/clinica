-- CliniCore - Fluxo assistencial entre chegada, pre-consulta e atendimento.
-- Execute depois de 014_nursing_permission_module.sql.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'preconsultation_mode') then
    create type public.preconsultation_mode as enum (
      'inherit',
      'required',
      'optional',
      'disabled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'clinical_encounter_status') then
    create type public.clinical_encounter_status as enum (
      'awaiting_preconsultation_decision',
      'waiting_triage',
      'triage_in_progress',
      'ready_for_consultation',
      'consultation_in_progress',
      'consultation_completed',
      'billing_pending',
      'billed',
      'cancelled'
    );
  end if;
end $$;

alter table public.registration_preferences
  add column if not exists preconsultation_mode public.preconsultation_mode
    not null default 'optional',
  add column if not exists allow_preconsultation_override boolean
    not null default true,
  add column if not exists require_follow_up_decision boolean
    not null default true;

alter table public.clinic_services
  add column if not exists preconsultation_mode public.preconsultation_mode
    not null default 'inherit';

create table if not exists public.clinical_encounters (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patients(id),
  professional_member_id uuid not null references public.clinic_members(id),
  status public.clinical_encounter_status not null,
  preconsultation_mode public.preconsultation_mode not null,
  preconsultation_required boolean,
  routing_source text not null default 'clinic'
    check (routing_source in ('clinic', 'service', 'manual')),
  routing_reason text,
  routing_decided_at timestamptz,
  routing_decided_by uuid references public.profiles(id),
  arrived_at timestamptz,
  triage_started_at timestamptz,
  triage_completed_at timestamptz,
  consultation_started_at timestamptz,
  consultation_completed_at timestamptz,
  billing_released_at timestamptz,
  billed_at timestamptz,
  follow_up_status text not null default 'pending'
    check (follow_up_status in ('pending', 'not_required', 'to_schedule', 'scheduled', 'declined')),
  follow_up_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.clinical_encounter_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  event_type text not null,
  from_status public.clinical_encounter_status,
  to_status public.clinical_encounter_status not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create index if not exists idx_clinical_encounters_clinic_status
on public.clinical_encounters(clinic_id, status, arrived_at desc)
where deleted_at is null;

create index if not exists idx_clinical_encounters_professional_status
on public.clinical_encounters(clinic_id, professional_member_id, status, arrived_at desc)
where deleted_at is null;

create index if not exists idx_clinical_encounters_patient_history
on public.clinical_encounters(clinic_id, patient_id, created_at desc)
where deleted_at is null;

create index if not exists idx_clinical_encounter_events_timeline
on public.clinical_encounter_events(encounter_id, created_at desc)
where deleted_at is null;

drop trigger if exists set_clinical_encounters_updated_at on public.clinical_encounters;
create trigger set_clinical_encounters_updated_at
before update on public.clinical_encounters
for each row execute function public.set_updated_at();

drop trigger if exists set_clinical_encounter_events_updated_at on public.clinical_encounter_events;
create trigger set_clinical_encounter_events_updated_at
before update on public.clinical_encounter_events
for each row execute function public.set_updated_at();

create or replace function public.sync_clinical_encounter_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clinic_mode public.preconsultation_mode := 'optional';
  service_mode public.preconsultation_mode := 'inherit';
  resolved_mode public.preconsultation_mode := 'optional';
  resolved_status public.clinical_encounter_status;
  resolved_required boolean;
  resolved_source text := 'clinic';
  current_encounter public.clinical_encounters%rowtype;
  saved_encounter public.clinical_encounters%rowtype;
  event_name text := 'appointment_synced';
begin
  if new.status not in (
    'checked_in',
    'in_triage',
    'in_progress',
    'completed',
    'billing_pending',
    'billed',
    'cancelled',
    'rescheduled'
  ) then
    return new;
  end if;

  if new.status in ('cancelled', 'rescheduled') then
    select *
    into current_encounter
    from public.clinical_encounters
    where appointment_id = new.id
      and deleted_at is null
    for update;

    if current_encounter.id is not null
      and current_encounter.status not in ('billed', 'cancelled') then
      update public.clinical_encounters
      set status = 'cancelled',
          updated_by = coalesce(new.updated_by, auth.uid())
      where id = current_encounter.id
      returning * into saved_encounter;

      insert into public.clinical_encounter_events (
        clinic_id,
        encounter_id,
        event_type,
        from_status,
        to_status,
        reason,
        created_by,
        updated_by
      )
      values (
        new.clinic_id,
        saved_encounter.id,
        'encounter_cancelled',
        current_encounter.status,
        'cancelled',
        new.cancellation_reason,
        coalesce(new.updated_by, auth.uid()),
        coalesce(new.updated_by, auth.uid())
      );
    end if;

    return new;
  end if;

  select coalesce(rp.preconsultation_mode, 'optional'::public.preconsultation_mode)
  into clinic_mode
  from public.registration_preferences rp
  where rp.clinic_id = new.clinic_id
    and rp.deleted_at is null
  limit 1;

  if new.service_id is not null then
    select coalesce(cs.preconsultation_mode, 'inherit'::public.preconsultation_mode)
    into service_mode
    from public.clinic_services cs
    where cs.id = new.service_id
      and cs.clinic_id = new.clinic_id
      and cs.deleted_at is null
    limit 1;
  end if;

  if service_mode is not null and service_mode <> 'inherit' then
    resolved_mode := service_mode;
    resolved_source := 'service';
  else
    resolved_mode := coalesce(clinic_mode, 'optional'::public.preconsultation_mode);
    resolved_source := 'clinic';
  end if;

  case new.status
    when 'checked_in' then
      case resolved_mode
        when 'required' then
          resolved_status := 'waiting_triage';
          resolved_required := true;
        when 'disabled' then
          resolved_status := 'ready_for_consultation';
          resolved_required := false;
        else
          resolved_status := 'awaiting_preconsultation_decision';
          resolved_required := null;
      end case;
      event_name := 'patient_arrived';
    when 'in_triage' then
      resolved_status := 'triage_in_progress';
      resolved_required := true;
      event_name := 'triage_started';
    when 'in_progress' then
      resolved_status := 'consultation_in_progress';
      event_name := 'consultation_started';
    when 'completed' then
      resolved_status := 'consultation_completed';
      event_name := 'consultation_completed';
    when 'billing_pending' then
      resolved_status := 'billing_pending';
      event_name := 'billing_released';
    when 'billed' then
      resolved_status := 'billed';
      event_name := 'encounter_billed';
  end case;

  select *
  into current_encounter
  from public.clinical_encounters
  where appointment_id = new.id
    and deleted_at is null
  for update;

  if current_encounter.id is null then
    insert into public.clinical_encounters (
      clinic_id,
      appointment_id,
      patient_id,
      professional_member_id,
      status,
      preconsultation_mode,
      preconsultation_required,
      routing_source,
      routing_decided_at,
      arrived_at,
      triage_started_at,
      consultation_started_at,
      consultation_completed_at,
      billing_released_at,
      billed_at,
      created_by,
      updated_by
    )
    values (
      new.clinic_id,
      new.id,
      new.patient_id,
      new.professional_member_id,
      resolved_status,
      resolved_mode,
      resolved_required,
      resolved_source,
      case when resolved_required is not null then now() end,
      coalesce(new.checked_in_at, now()),
      case when new.status = 'in_triage' then coalesce(new.started_at, now()) end,
      case when new.status = 'in_progress' then coalesce(new.started_at, now()) end,
      case when new.status = 'completed' then coalesce(new.completed_at, now()) end,
      case when new.status = 'billing_pending' then now() end,
      case when new.status = 'billed' then now() end,
      coalesce(new.updated_by, new.created_by, auth.uid()),
      coalesce(new.updated_by, new.created_by, auth.uid())
    )
    returning * into saved_encounter;

    insert into public.clinical_encounter_events (
      clinic_id,
      encounter_id,
      event_type,
      from_status,
      to_status,
      metadata,
      created_by,
      updated_by
    )
    values (
      new.clinic_id,
      saved_encounter.id,
      event_name,
      null,
      saved_encounter.status,
      jsonb_build_object('appointment_status', new.status),
      coalesce(new.updated_by, new.created_by, auth.uid()),
      coalesce(new.updated_by, new.created_by, auth.uid())
    );
  elsif current_encounter.status <> resolved_status
    and current_encounter.status not in ('billed', 'cancelled') then
    update public.clinical_encounters
    set status = resolved_status,
        preconsultation_required = coalesce(
          current_encounter.preconsultation_required,
          resolved_required
        ),
        triage_started_at = case
          when resolved_status = 'triage_in_progress'
            then coalesce(current_encounter.triage_started_at, now())
          else current_encounter.triage_started_at
        end,
        consultation_started_at = case
          when resolved_status = 'consultation_in_progress'
            then coalesce(current_encounter.consultation_started_at, now())
          else current_encounter.consultation_started_at
        end,
        consultation_completed_at = case
          when resolved_status = 'consultation_completed'
            then coalesce(current_encounter.consultation_completed_at, now())
          else current_encounter.consultation_completed_at
        end,
        billing_released_at = case
          when resolved_status = 'billing_pending'
            then coalesce(current_encounter.billing_released_at, now())
          else current_encounter.billing_released_at
        end,
        billed_at = case
          when resolved_status = 'billed'
            then coalesce(current_encounter.billed_at, now())
          else current_encounter.billed_at
        end,
        updated_by = coalesce(new.updated_by, auth.uid())
    where id = current_encounter.id
    returning * into saved_encounter;

    insert into public.clinical_encounter_events (
      clinic_id,
      encounter_id,
      event_type,
      from_status,
      to_status,
      metadata,
      created_by,
      updated_by
    )
    values (
      new.clinic_id,
      saved_encounter.id,
      event_name,
      current_encounter.status,
      saved_encounter.status,
      jsonb_build_object('appointment_status', new.status),
      coalesce(new.updated_by, auth.uid()),
      coalesce(new.updated_by, auth.uid())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists sync_clinical_encounter_after_appointment
on public.appointments;
create trigger sync_clinical_encounter_after_appointment
after insert or update of status on public.appointments
for each row execute function public.sync_clinical_encounter_from_appointment();

create or replace function public.route_clinical_encounter(
  encounter_uuid uuid,
  requires_preconsultation boolean,
  route_reason text default null
)
returns public.clinical_encounters
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  current_encounter public.clinical_encounters%rowtype;
  saved_encounter public.clinical_encounters%rowtype;
  target_status public.clinical_encounter_status;
  actor_is_assigned_professional boolean := false;
  can_route boolean := false;
  allow_override boolean := true;
begin
  if actor_uuid is null then
    raise exception 'Sessao autenticada obrigatoria.' using errcode = '42501';
  end if;

  select *
  into current_encounter
  from public.clinical_encounters
  where id = encounter_uuid
    and deleted_at is null
  for update;

  if current_encounter.id is null then
    raise exception 'Atendimento nao encontrado.' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.clinic_members cm
    where cm.id = current_encounter.professional_member_id
      and cm.user_id = actor_uuid
      and cm.status = 'active'
      and cm.deleted_at is null
  )
  into actor_is_assigned_professional;

  can_route :=
    public.user_has_permission(
      current_encounter.clinic_id,
      'schedule',
      'manage',
      actor_uuid
    )
    or (
      actor_is_assigned_professional
      and public.user_has_permission(
        current_encounter.clinic_id,
        'medical_records',
        'access_medical_record',
        actor_uuid
      )
    );

  if not can_route then
    raise exception 'Sem permissao para definir este fluxo.' using errcode = '42501';
  end if;

  select coalesce(rp.allow_preconsultation_override, true)
  into allow_override
  from public.registration_preferences rp
  where rp.clinic_id = current_encounter.clinic_id
    and rp.deleted_at is null
  limit 1;

  if current_encounter.status not in (
    'awaiting_preconsultation_decision',
    'waiting_triage',
    'ready_for_consultation'
  ) then
    raise exception 'O encaminhamento nao pode ser alterado apos o inicio assistencial.'
      using errcode = 'check_violation';
  end if;

  if current_encounter.preconsultation_mode in ('required', 'disabled')
    and not allow_override
    and current_encounter.status <> 'awaiting_preconsultation_decision' then
    raise exception 'A clinica bloqueou a substituicao desta regra.'
      using errcode = 'check_violation';
  end if;

  if current_encounter.status <> 'awaiting_preconsultation_decision'
    and nullif(trim(route_reason), '') is null then
    raise exception 'Informe o motivo da correcao do fluxo.'
      using errcode = 'check_violation';
  end if;

  target_status := case
    when requires_preconsultation then 'waiting_triage'::public.clinical_encounter_status
    else 'ready_for_consultation'::public.clinical_encounter_status
  end;

  update public.clinical_encounters
  set status = target_status,
      preconsultation_required = requires_preconsultation,
      routing_source = 'manual',
      routing_reason = nullif(trim(route_reason), ''),
      routing_decided_at = now(),
      routing_decided_by = actor_uuid,
      updated_by = actor_uuid
  where id = current_encounter.id
  returning * into saved_encounter;

  insert into public.clinical_encounter_events (
    clinic_id,
    encounter_id,
    event_type,
    from_status,
    to_status,
    reason,
    created_by,
    updated_by
  )
  values (
    saved_encounter.clinic_id,
    saved_encounter.id,
    case
      when current_encounter.status = 'awaiting_preconsultation_decision'
        then 'route_decided'
      else 'route_corrected'
    end,
    current_encounter.status,
    saved_encounter.status,
    saved_encounter.routing_reason,
    actor_uuid,
    actor_uuid
  );

  return saved_encounter;
end;
$$;

create or replace function public.transition_clinical_encounter(
  encounter_uuid uuid,
  target_status public.clinical_encounter_status,
  transition_reason text default null
)
returns public.clinical_encounters
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  current_encounter public.clinical_encounters%rowtype;
  saved_encounter public.clinical_encounters%rowtype;
  actor_is_assigned_professional boolean := false;
  event_name text;
begin
  if actor_uuid is null then
    raise exception 'Sessao autenticada obrigatoria.' using errcode = '42501';
  end if;

  select *
  into current_encounter
  from public.clinical_encounters
  where id = encounter_uuid
    and deleted_at is null
  for update;

  if current_encounter.id is null then
    raise exception 'Atendimento nao encontrado.' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.clinic_members cm
    where cm.id = current_encounter.professional_member_id
      and cm.user_id = actor_uuid
      and cm.status = 'active'
      and cm.deleted_at is null
  )
  into actor_is_assigned_professional;

  if target_status in ('triage_in_progress', 'ready_for_consultation') then
    if not public.user_has_permission(
      current_encounter.clinic_id,
      'nursing',
      'edit',
      actor_uuid
    ) then
      raise exception 'Sem permissao para operar a pre-consulta.'
        using errcode = '42501';
    end if;
  elsif target_status in ('consultation_in_progress', 'consultation_completed') then
    if not actor_is_assigned_professional
      or not public.user_has_permission(
        current_encounter.clinic_id,
        'medical_records',
        'edit',
        actor_uuid
      )
      or not public.user_has_permission(
        current_encounter.clinic_id,
        'medical_records',
        'access_medical_record',
        actor_uuid
      ) then
      raise exception 'Somente o profissional responsavel pode operar este atendimento.'
        using errcode = '42501';
    end if;
  else
    raise exception 'Etapa de atendimento nao suportada por esta operacao.'
      using errcode = 'check_violation';
  end if;

  if not (
    (current_encounter.status = 'waiting_triage' and target_status = 'triage_in_progress')
    or (current_encounter.status = 'triage_in_progress' and target_status = 'ready_for_consultation')
    or (current_encounter.status = 'ready_for_consultation' and target_status = 'consultation_in_progress')
    or (current_encounter.status = 'consultation_in_progress' and target_status = 'consultation_completed')
  ) then
    raise exception 'Transicao assistencial invalida: % -> %',
      current_encounter.status,
      target_status
      using errcode = 'check_violation';
  end if;

  event_name := case target_status
    when 'triage_in_progress' then 'triage_started'
    when 'ready_for_consultation' then 'triage_completed'
    when 'consultation_in_progress' then 'consultation_started'
    when 'consultation_completed' then 'consultation_completed'
  end;

  update public.clinical_encounters
  set status = target_status,
      triage_started_at = case
        when target_status = 'triage_in_progress' then now()
        else triage_started_at
      end,
      triage_completed_at = case
        when target_status = 'ready_for_consultation' then now()
        else triage_completed_at
      end,
      consultation_started_at = case
        when target_status = 'consultation_in_progress' then now()
        else consultation_started_at
      end,
      consultation_completed_at = case
        when target_status = 'consultation_completed' then now()
        else consultation_completed_at
      end,
      updated_by = actor_uuid
  where id = current_encounter.id
  returning * into saved_encounter;

  if target_status = 'triage_in_progress' then
    update public.appointments
    set status = 'in_triage',
        updated_by = actor_uuid
    where id = current_encounter.appointment_id
      and status = 'checked_in';
  elsif target_status = 'consultation_in_progress' then
    update public.appointments
    set status = 'in_progress',
        started_at = coalesce(started_at, now()),
        updated_by = actor_uuid
    where id = current_encounter.appointment_id
      and status in ('checked_in', 'in_triage');
  elsif target_status = 'consultation_completed' then
    update public.appointments
    set status = 'completed',
        completed_at = coalesce(completed_at, now()),
        updated_by = actor_uuid
    where id = current_encounter.appointment_id
      and status = 'in_progress';
  end if;

  insert into public.clinical_encounter_events (
    clinic_id,
    encounter_id,
    event_type,
    from_status,
    to_status,
    reason,
    created_by,
    updated_by
  )
  values (
    saved_encounter.clinic_id,
    saved_encounter.id,
    event_name,
    current_encounter.status,
    saved_encounter.status,
    nullif(trim(transition_reason), ''),
    actor_uuid,
    actor_uuid
  );

  return saved_encounter;
end;
$$;

alter table public.clinical_encounters enable row level security;
alter table public.clinical_encounter_events enable row level security;

drop policy if exists "clinical_encounters_select_authorized"
on public.clinical_encounters;
create policy "clinical_encounters_select_authorized"
on public.clinical_encounters
for select
to authenticated
using (
  deleted_at is null
  and (
    public.user_has_permission(clinic_id, 'schedule', 'manage')
    or (
      public.user_has_permission(clinic_id, 'nursing', 'view')
      and status in ('waiting_triage', 'triage_in_progress', 'ready_for_consultation')
    )
    or (
      public.user_has_permission(clinic_id, 'medical_records', 'access_medical_record')
      and professional_member_id = public.current_clinic_member_id(clinic_id)
    )
  )
);

drop policy if exists "clinical_encounter_events_select_authorized"
on public.clinical_encounter_events;
create policy "clinical_encounter_events_select_authorized"
on public.clinical_encounter_events
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.clinical_encounters ce
    where ce.id = encounter_id
      and ce.clinic_id = clinic_id
      and ce.deleted_at is null
      and (
        public.user_has_permission(ce.clinic_id, 'schedule', 'manage')
        or (
          public.user_has_permission(ce.clinic_id, 'nursing', 'view')
          and ce.status in ('waiting_triage', 'triage_in_progress', 'ready_for_consultation')
        )
        or (
          public.user_has_permission(ce.clinic_id, 'medical_records', 'access_medical_record')
          and ce.professional_member_id = public.current_clinic_member_id(ce.clinic_id)
        )
      )
  )
);

grant select on public.clinical_encounters to authenticated;
grant select on public.clinical_encounter_events to authenticated;
revoke execute on function public.route_clinical_encounter(uuid, boolean, text)
from public, anon;
revoke execute on function public.transition_clinical_encounter(
  uuid,
  public.clinical_encounter_status,
  text
)
from public, anon;
grant execute on function public.route_clinical_encounter(uuid, boolean, text) to authenticated;
grant execute on function public.transition_clinical_encounter(
  uuid,
  public.clinical_encounter_status,
  text
) to authenticated;

insert into public.role_permissions (role, module, action, allowed)
select values_to_insert.role, values_to_insert.module, values_to_insert.action, true
from (
  values
    ('clinic_admin'::public.app_role, 'nursing'::public.permission_module, 'view'::public.permission_action),
    ('nurse'::public.app_role, 'nursing'::public.permission_module, 'view'::public.permission_action),
    ('nurse'::public.app_role, 'nursing'::public.permission_module, 'create'::public.permission_action),
    ('nurse'::public.app_role, 'nursing'::public.permission_module, 'edit'::public.permission_action)
) as values_to_insert(role, module, action)
where not exists (
  select 1
  from public.role_permissions rp
  where rp.clinic_id is null
    and rp.role = values_to_insert.role
    and rp.module = values_to_insert.module
    and rp.action = values_to_insert.action
    and rp.deleted_at is null
);

-- Backfill de atendimentos que ja avancaram alem da chegada.
insert into public.clinical_encounters (
  clinic_id,
  appointment_id,
  patient_id,
  professional_member_id,
  status,
  preconsultation_mode,
  preconsultation_required,
  routing_source,
  routing_decided_at,
  arrived_at,
  triage_started_at,
  consultation_started_at,
  consultation_completed_at,
  billing_released_at,
  billed_at,
  created_by,
  updated_by
)
select
  a.clinic_id,
  a.id,
  a.patient_id,
  a.professional_member_id,
  case a.status
    when 'checked_in' then
      case
        when coalesce(
          nullif(cs.preconsultation_mode, 'inherit'::public.preconsultation_mode),
          rp.preconsultation_mode,
          'optional'::public.preconsultation_mode
        ) = 'required' then 'waiting_triage'::public.clinical_encounter_status
        when coalesce(
          nullif(cs.preconsultation_mode, 'inherit'::public.preconsultation_mode),
          rp.preconsultation_mode,
          'optional'::public.preconsultation_mode
        ) = 'disabled' then 'ready_for_consultation'::public.clinical_encounter_status
        else 'awaiting_preconsultation_decision'::public.clinical_encounter_status
      end
    when 'in_triage' then 'triage_in_progress'::public.clinical_encounter_status
    when 'in_progress' then 'consultation_in_progress'::public.clinical_encounter_status
    when 'completed' then 'consultation_completed'::public.clinical_encounter_status
    when 'billing_pending' then 'billing_pending'::public.clinical_encounter_status
    when 'billed' then 'billed'::public.clinical_encounter_status
  end,
  coalesce(
    nullif(cs.preconsultation_mode, 'inherit'::public.preconsultation_mode),
    rp.preconsultation_mode,
    'optional'::public.preconsultation_mode
  ),
  case
    when a.status = 'in_triage' then true
    when coalesce(
      nullif(cs.preconsultation_mode, 'inherit'::public.preconsultation_mode),
      rp.preconsultation_mode,
      'optional'::public.preconsultation_mode
    ) = 'required' then true
    when coalesce(
      nullif(cs.preconsultation_mode, 'inherit'::public.preconsultation_mode),
      rp.preconsultation_mode,
      'optional'::public.preconsultation_mode
    ) = 'disabled' then false
    else null
  end,
  case
    when cs.preconsultation_mode is not null and cs.preconsultation_mode <> 'inherit'
      then 'service'
    else 'clinic'
  end,
  case
    when coalesce(
      nullif(cs.preconsultation_mode, 'inherit'::public.preconsultation_mode),
      rp.preconsultation_mode,
      'optional'::public.preconsultation_mode
    ) <> 'optional' then now()
  end,
  coalesce(a.checked_in_at, a.updated_at, now()),
  case when a.status = 'in_triage' then coalesce(a.started_at, a.updated_at) end,
  case when a.status = 'in_progress' then coalesce(a.started_at, a.updated_at) end,
  case when a.status = 'completed' then coalesce(a.completed_at, a.updated_at) end,
  case when a.status = 'billing_pending' then a.updated_at end,
  case when a.status = 'billed' then a.updated_at end,
  coalesce(a.updated_by, a.created_by),
  coalesce(a.updated_by, a.created_by)
from public.appointments a
left join public.clinic_services cs
  on cs.id = a.service_id
  and cs.deleted_at is null
left join public.registration_preferences rp
  on rp.clinic_id = a.clinic_id
  and rp.deleted_at is null
where a.deleted_at is null
  and a.status in (
    'checked_in',
    'in_triage',
    'in_progress',
    'completed',
    'billing_pending',
    'billed'
  )
  and not exists (
    select 1
    from public.clinical_encounters ce
    where ce.appointment_id = a.id
  );

insert into public.clinical_encounter_events (
  clinic_id,
  encounter_id,
  event_type,
  from_status,
  to_status,
  reason,
  created_by,
  updated_by
)
select
  ce.clinic_id,
  ce.id,
  'encounter_backfilled',
  null,
  ce.status,
  'Atendimento criado a partir do historico da Agenda.',
  ce.created_by,
  ce.updated_by
from public.clinical_encounters ce
where not exists (
  select 1
  from public.clinical_encounter_events event
  where event.encounter_id = ce.id
);
