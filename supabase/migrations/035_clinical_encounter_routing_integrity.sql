-- CliniCore - Integridade transacional entre agenda e fluxo assistencial.
-- Execute depois de 034_security_transactions_quality.sql.

create or replace function public.ensure_clinical_encounter_for_appointment(
  appointment_uuid uuid,
  clinic_uuid uuid,
  actor_uuid uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  appointment_row public.appointments%rowtype;
  encounter_uuid uuid;
  clinic_mode public.preconsultation_mode := 'optional';
  service_mode public.preconsultation_mode := 'inherit';
  resolved_mode public.preconsultation_mode := 'optional';
  resolved_status public.clinical_encounter_status;
  resolved_required boolean;
  resolved_source text := 'clinic';
  responsible_uuid uuid;
  was_created boolean := false;
begin
  if appointment_uuid is null or clinic_uuid is null or actor_uuid is null then
    raise exception 'CLINICAL_CONTEXT_REQUIRED' using errcode = '22023';
  end if;

  select *
  into appointment_row
  from public.appointments a
  where a.id = appointment_uuid
    and a.clinic_id = clinic_uuid
    and a.deleted_at is null
  for update;

  if appointment_row.id is null then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if appointment_row.status not in (
    'checked_in', 'in_triage', 'in_progress', 'completed', 'billing_pending', 'billed'
  ) then
    raise exception 'PATIENT_ARRIVAL_REQUIRED' using errcode = 'check_violation';
  end if;

  if not (
    public.user_has_permission(clinic_uuid, 'schedule', 'manage', actor_uuid)
    or exists (
      select 1
      from public.clinic_members cm
      where cm.id = appointment_row.professional_member_id
        and cm.clinic_id = clinic_uuid
        and cm.user_id = actor_uuid
        and cm.status = 'active'
        and cm.deleted_at is null
        and public.user_has_permission(
          clinic_uuid,
          'medical_records',
          'access_medical_record',
          actor_uuid
        )
    )
  ) then
    raise exception 'CLINICAL_ROUTE_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  select ce.id
  into encounter_uuid
  from public.clinical_encounters ce
  where ce.appointment_id = appointment_row.id
    and ce.clinic_id = clinic_uuid
    and ce.deleted_at is null
  for update;

  if encounter_uuid is not null then
    return jsonb_build_object('encounter_id', encounter_uuid, 'created', false);
  end if;

  select coalesce(rp.preconsultation_mode, 'optional'::public.preconsultation_mode)
  into clinic_mode
  from public.registration_preferences rp
  where rp.clinic_id = clinic_uuid
    and rp.deleted_at is null
  limit 1;

  if appointment_row.service_id is not null then
    select coalesce(cs.preconsultation_mode, 'inherit'::public.preconsultation_mode)
    into service_mode
    from public.clinic_services cs
    where cs.id = appointment_row.service_id
      and cs.clinic_id = clinic_uuid
      and cs.deleted_at is null
    limit 1;
  end if;

  if service_mode is not null and service_mode <> 'inherit' then
    resolved_mode := service_mode;
    resolved_source := 'service';
  else
    resolved_mode := coalesce(clinic_mode, 'optional'::public.preconsultation_mode);
  end if;

  resolved_status := case appointment_row.status
    when 'checked_in' then case resolved_mode
      when 'required' then 'waiting_triage'::public.clinical_encounter_status
      when 'disabled' then 'ready_for_consultation'::public.clinical_encounter_status
      else 'awaiting_preconsultation_decision'::public.clinical_encounter_status
    end
    when 'in_triage' then 'triage_in_progress'::public.clinical_encounter_status
    when 'in_progress' then 'consultation_in_progress'::public.clinical_encounter_status
    when 'completed' then 'consultation_completed'::public.clinical_encounter_status
    when 'billing_pending' then 'billing_pending'::public.clinical_encounter_status
    when 'billed' then 'billed'::public.clinical_encounter_status
  end;

  resolved_required := case
    when appointment_row.status = 'in_triage' then true
    when resolved_mode = 'required' then true
    when resolved_mode = 'disabled' then false
    else null
  end;
  responsible_uuid := coalesce(appointment_row.updated_by, appointment_row.created_by, actor_uuid);

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
  ) values (
    clinic_uuid,
    appointment_row.id,
    appointment_row.patient_id,
    appointment_row.professional_member_id,
    resolved_status,
    resolved_mode,
    resolved_required,
    resolved_source,
    case when resolved_required is null then null else now() end,
    coalesce(appointment_row.checked_in_at, appointment_row.updated_at, now()),
    case when appointment_row.status = 'in_triage' then coalesce(appointment_row.started_at, now()) end,
    case when appointment_row.status = 'in_progress' then coalesce(appointment_row.started_at, now()) end,
    case when appointment_row.status = 'completed' then coalesce(appointment_row.completed_at, now()) end,
    case when appointment_row.status = 'billing_pending' then appointment_row.updated_at end,
    case when appointment_row.status = 'billed' then appointment_row.updated_at end,
    responsible_uuid,
    responsible_uuid
  )
  on conflict (appointment_id) do nothing
  returning id into encounter_uuid;

  was_created := encounter_uuid is not null;

  if encounter_uuid is null then
    select ce.id
    into encounter_uuid
    from public.clinical_encounters ce
    where ce.appointment_id = appointment_row.id
      and ce.clinic_id = clinic_uuid
      and ce.deleted_at is null;
  end if;

  if encounter_uuid is null then
    raise exception 'CLINICAL_ENCOUNTER_CREATION_FAILED' using errcode = 'P0001';
  end if;

  if was_created then
    insert into public.clinical_encounter_events (
      clinic_id,
      encounter_id,
      event_type,
      from_status,
      to_status,
      metadata,
      created_by,
      updated_by
    ) values (
      clinic_uuid,
      encounter_uuid,
      'patient_arrived',
      null,
      resolved_status,
      jsonb_build_object(
        'source', 'ensure_clinical_encounter_transaction',
        'appointment_status', appointment_row.status
      ),
      responsible_uuid,
      responsible_uuid
    );
  end if;

  return jsonb_build_object('encounter_id', encounter_uuid, 'created', was_created);
end;
$$;

revoke execute on function public.ensure_clinical_encounter_for_appointment(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.ensure_clinical_encounter_for_appointment(uuid, uuid, uuid)
to service_role;

insert into public.app_migration_history (migration_name, description, source, notes)
values (
  '035_clinical_encounter_routing_integrity.sql',
  'Atomic recovery of clinical encounters from appointments before routing.',
  'supabase_sql_editor',
  'Agenda and clinical routing now share the same encounter integrity rule.'
)
on conflict (migration_name) do nothing;
