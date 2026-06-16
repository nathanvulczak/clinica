-- CliniCore - Reparar atendimentos assistenciais ausentes.
-- Execute depois de 016_clinical_role_presets.sql.
-- Esta migration nao altera estrutura: apenas cria clinical_encounters faltantes
-- para agendamentos que ja tiveram chegada/atendimento registrado.

with source_appointments as (
  select
    a.*,
    coalesce(rp.preconsultation_mode, 'optional'::public.preconsultation_mode) as clinic_mode,
    coalesce(cs.preconsultation_mode, 'inherit'::public.preconsultation_mode) as service_mode
  from public.appointments a
  left join public.clinical_encounters ce
    on ce.appointment_id = a.id
    and ce.deleted_at is null
  left join public.registration_preferences rp
    on rp.clinic_id = a.clinic_id
    and rp.deleted_at is null
  left join public.clinic_services cs
    on cs.id = a.service_id
    and cs.clinic_id = a.clinic_id
    and cs.deleted_at is null
  where ce.id is null
    and a.deleted_at is null
    and a.status in (
      'checked_in',
      'in_triage',
      'in_progress',
      'completed',
      'billing_pending',
      'billed'
    )
),
resolved as (
  select
    sa.*,
    case
      when sa.service_mode <> 'inherit' then sa.service_mode
      else sa.clinic_mode
    end as resolved_mode
  from source_appointments sa
),
inserted as (
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
    r.clinic_id,
    r.id,
    r.patient_id,
    r.professional_member_id,
    case
      when r.status = 'checked_in' then
        case
          when r.resolved_mode = 'required' then 'waiting_triage'::public.clinical_encounter_status
          when r.resolved_mode = 'disabled' then 'ready_for_consultation'::public.clinical_encounter_status
          else 'awaiting_preconsultation_decision'::public.clinical_encounter_status
        end
      when r.status = 'in_triage' then 'triage_in_progress'::public.clinical_encounter_status
      when r.status = 'in_progress' then 'consultation_in_progress'::public.clinical_encounter_status
      when r.status = 'completed' then 'consultation_completed'::public.clinical_encounter_status
      when r.status = 'billing_pending' then 'billing_pending'::public.clinical_encounter_status
      when r.status = 'billed' then 'billed'::public.clinical_encounter_status
    end,
    r.resolved_mode,
    case
      when r.status = 'in_triage' then true
      when r.resolved_mode = 'required' then true
      when r.resolved_mode = 'disabled' then false
      else null
    end,
    case when r.service_mode <> 'inherit' then 'service' else 'clinic' end,
    case
      when r.status = 'in_triage' then coalesce(r.started_at, r.updated_at, now())
      when r.resolved_mode in ('required', 'disabled') then coalesce(r.checked_in_at, r.updated_at, now())
      else null
    end,
    coalesce(r.checked_in_at, r.updated_at, now()),
    case when r.status = 'in_triage' then coalesce(r.started_at, r.updated_at, now()) end,
    case when r.status = 'in_progress' then coalesce(r.started_at, r.updated_at, now()) end,
    case when r.status = 'completed' then coalesce(r.completed_at, r.updated_at, now()) end,
    case when r.status = 'billing_pending' then r.updated_at end,
    case when r.status = 'billed' then r.updated_at end,
    coalesce(r.updated_by, r.created_by),
    coalesce(r.updated_by, r.created_by)
  from resolved r
  on conflict (appointment_id) do nothing
  returning id, clinic_id, appointment_id, status, created_by, updated_by
)
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
select
  i.clinic_id,
  i.id,
  'encounter_repaired',
  null,
  i.status,
  jsonb_build_object('source', 'migration_017', 'appointment_id', i.appointment_id),
  i.created_by,
  i.updated_by
from inserted i;
