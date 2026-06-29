-- CliniCore - Security hardening, transactional clinical saves and migration history.
-- Execute after 033_documents_inventory_operations.sql.

create table if not exists public.app_migration_history (
  id bigserial primary key,
  migration_name text not null unique,
  description text,
  checksum text,
  applied_at timestamptz not null default now(),
  applied_by uuid references public.profiles(id),
  source text not null default 'supabase_sql_editor',
  notes text
);

alter table public.app_migration_history enable row level security;
grant select on public.app_migration_history to authenticated;

drop policy if exists "app_migration_history_select_platform_admin"
on public.app_migration_history;
create policy "app_migration_history_select_platform_admin"
on public.app_migration_history
for select
to authenticated
using (public.is_platform_admin(auth.uid()));

insert into public.app_migration_history (migration_name, description, source, notes)
values
  ('034_security_transactions_quality.sql', 'Security hardening, storage policies, transactional clinical saves and ledger-safe payment creation.', 'supabase_sql_editor', 'Start of explicit migration history tracking.')
on conflict (migration_name) do nothing;

insert into public.app_migration_history (migration_name, description, source, notes)
select
  migration_name,
  'Migration histórica anterior ao controle explícito.',
  'baseline',
  'Inventário consolidado pela migration 034.'
from unnest(array[
  '001_initial_enterprise_foundation.sql',
  '002_clinic_context_members_foundation.sql',
  '003_billing_profile_hardening.sql',
  '004_clinic_creation_policy_fix.sql',
  '005_audit_profile_members_storage.sql',
  '006_audit_visibility_and_performance.sql',
  '007_repair_billing_reference_data.sql',
  '008_schedule_foundation.sql',
  '009_registration_catalog.sql',
  '010_professional_registration.sql',
  '011_member_invite_access.sql',
  '012_schedule_operations_security.sql',
  '013_rbac_module_access_hardening.sql',
  '014_nursing_permission_module.sql',
  '015_clinical_encounter_workflow.sql',
  '016_clinical_role_presets.sql',
  '017_repair_missing_clinical_encounters.sql',
  '018_nursing_assessments.sql',
  '019_nursing_module_preferences.sql',
  '020_medical_records_module.sql',
  '021_medical_records_documents_lgpd.sql',
  '022_medical_records_polish.sql',
  '023_financial_module.sql',
  '024_financial_reconciliation.sql',
  '025_financial_enterprise_foundation.sql',
  '026_financial_payables_documents.sql',
  '027_financial_commissions_bank_imports.sql',
  '028_financial_monthly_close_realtime.sql',
  '029_commission_settlements_clinic_branding.sql',
  '030_permission_backup_dashboard_alignment.sql',
  '031_role_permissions_unique_active.sql',
  '032_documents_inventory_enums.sql',
  '033_documents_inventory_operations.sql'
]) as migration_name
on conflict (migration_name) do nothing;

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

  return public.is_platform_admin(effective_user_uuid)
    or exists (
      select 1
      from public.clinic_members cm
      where cm.clinic_id = clinic_uuid
        and cm.user_id = effective_user_uuid
        and cm.status = 'active'
        and cm.deleted_at is null
        and (
          cm.role = 'clinic_owner'
          or coalesce(
            (
              select mp.allowed
              from public.member_permissions mp
              where mp.clinic_id = clinic_uuid
                and mp.member_id = cm.id
                and mp.module = permission_module
                and mp.action = permission_action
                and mp.deleted_at is null
              order by mp.updated_at desc
              limit 1
            ),
            (
              select rp.allowed
              from public.role_permissions rp
              where rp.clinic_id = clinic_uuid
                and rp.role = cm.role
                and rp.module = permission_module
                and rp.action = permission_action
                and rp.deleted_at is null
              order by rp.updated_at desc
              limit 1
            ),
            (
              select rp.allowed
              from public.role_permissions rp
              where rp.clinic_id is null
                and rp.role = cm.role
                and rp.module = permission_module
                and rp.action = permission_action
                and rp.deleted_at is null
              order by rp.updated_at desc
              limit 1
            ),
            false
          )
        )
    );
end;
$$;

revoke execute on function public.user_has_permission(
  uuid,
  public.permission_module,
  public.permission_action,
  uuid
) from public, anon;
grant execute on function public.user_has_permission(
  uuid,
  public.permission_module,
  public.permission_action,
  uuid
) to authenticated, service_role;

revoke execute on function public.repair_missing_profile(uuid)
from public, anon, authenticated;
revoke execute on function public.repair_all_missing_profiles()
from public, anon, authenticated;
grant execute on function public.repair_missing_profile(uuid) to service_role;
grant execute on function public.repair_all_missing_profiles() to service_role;

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
    where ce.id = clinical_encounter_events.encounter_id
      and ce.clinic_id = clinical_encounter_events.clinic_id
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

drop policy if exists "clinical_attachments_select_authorized" on storage.objects;
create policy "clinical_attachments_select_authorized"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'clinical-attachments'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.medical_record_attachments mra
    where mra.file_path = storage.objects.name
      and mra.clinic_id = ((storage.foldername(name))[1])::uuid
      and mra.deleted_at is null
      and mra.status = 'active'
      and (
        public.user_has_permission(mra.clinic_id, 'schedule', 'manage')
        or exists (
          select 1
          from public.clinic_members cm
          where cm.id = mra.professional_member_id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
            and cm.deleted_at is null
            and public.user_has_permission(mra.clinic_id, 'medical_records', 'access_medical_record')
        )
      )
  )
);

drop policy if exists "clinical_attachments_insert_authorized" on storage.objects;
create policy "clinical_attachments_insert_authorized"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'clinical-attachments'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1
    from public.clinical_encounters ce
    where ce.clinic_id = ((storage.foldername(name))[1])::uuid
      and ce.patient_id = ((storage.foldername(name))[2])::uuid
      and ce.id = ((storage.foldername(name))[3])::uuid
      and ce.deleted_at is null
      and (
        public.user_has_permission(ce.clinic_id, 'schedule', 'manage')
        or (
          ce.professional_member_id = public.current_clinic_member_id(ce.clinic_id)
          and public.user_has_permission(ce.clinic_id, 'medical_records', 'edit')
          and public.user_has_permission(ce.clinic_id, 'medical_records', 'access_medical_record')
        )
      )
  )
);

create or replace function public.save_nursing_assessment_transaction(
  assessment_payload jsonb,
  complete_assessment boolean default false,
  transition_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  encounter_uuid uuid := nullif(assessment_payload->>'encounter_id', '')::uuid;
  clinic_uuid uuid := nullif(assessment_payload->>'clinic_id', '')::uuid;
  current_encounter public.clinical_encounters%rowtype;
  previous_assessment public.nursing_assessments%rowtype;
  saved_id uuid;
begin
  if actor_uuid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
  into current_encounter
  from public.clinical_encounters
  where id = encounter_uuid
    and clinic_id = clinic_uuid
    and deleted_at is null
  for update;

  if current_encounter.id is null then
    raise exception 'ENCOUNTER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.user_has_permission(current_encounter.clinic_id, 'nursing', 'edit', actor_uuid) then
    raise exception 'NURSING_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  if current_encounter.status not in ('waiting_triage', 'triage_in_progress', 'ready_for_consultation') then
    raise exception 'INVALID_NURSING_STAGE' using errcode = 'check_violation';
  end if;

  select *
  into previous_assessment
  from public.nursing_assessments
  where encounter_id = current_encounter.id
    and deleted_at is null
  for update;

  if current_encounter.status = 'waiting_triage' then
    perform public.transition_clinical_encounter(
      current_encounter.id,
      'triage_in_progress',
      'Pre-consulta iniciada pela ficha de enfermagem.'
    );
  end if;

  insert into public.nursing_assessments (
    clinic_id,
    encounter_id,
    patient_id,
    professional_member_id,
    performed_by,
    status,
    chief_complaint,
    current_medications,
    allergies,
    comorbidities,
    pain_score,
    pain_location,
    systolic_bp,
    diastolic_bp,
    heart_rate,
    respiratory_rate,
    temperature_c,
    oxygen_saturation,
    capillary_glucose,
    weight_kg,
    height_cm,
    bmi,
    risk_level,
    nursing_notes,
    recommendations,
    correction_reason,
    completed_at,
    created_by,
    updated_by
  )
  values (
    current_encounter.clinic_id,
    current_encounter.id,
    current_encounter.patient_id,
    current_encounter.professional_member_id,
    actor_uuid,
    coalesce(nullif(assessment_payload->>'status', ''), 'draft'),
    assessment_payload->>'chief_complaint',
    assessment_payload->>'current_medications',
    assessment_payload->>'allergies',
    assessment_payload->>'comorbidities',
    nullif(assessment_payload->>'pain_score', '')::integer,
    assessment_payload->>'pain_location',
    nullif(assessment_payload->>'systolic_bp', '')::integer,
    nullif(assessment_payload->>'diastolic_bp', '')::integer,
    nullif(assessment_payload->>'heart_rate', '')::integer,
    nullif(assessment_payload->>'respiratory_rate', '')::integer,
    nullif(assessment_payload->>'temperature_c', '')::numeric,
    nullif(assessment_payload->>'oxygen_saturation', '')::integer,
    nullif(assessment_payload->>'capillary_glucose', '')::integer,
    nullif(assessment_payload->>'weight_kg', '')::numeric,
    nullif(assessment_payload->>'height_cm', '')::numeric,
    nullif(assessment_payload->>'bmi', '')::numeric,
    coalesce(nullif(assessment_payload->>'risk_level', ''), 'routine'),
    assessment_payload->>'nursing_notes',
    assessment_payload->>'recommendations',
    assessment_payload->>'correction_reason',
    nullif(assessment_payload->>'completed_at', '')::timestamptz,
    coalesce(previous_assessment.created_by, actor_uuid),
    actor_uuid
  )
  on conflict (encounter_id) do update
  set performed_by = excluded.performed_by,
      status = excluded.status,
      chief_complaint = excluded.chief_complaint,
      current_medications = excluded.current_medications,
      allergies = excluded.allergies,
      comorbidities = excluded.comorbidities,
      pain_score = excluded.pain_score,
      pain_location = excluded.pain_location,
      systolic_bp = excluded.systolic_bp,
      diastolic_bp = excluded.diastolic_bp,
      heart_rate = excluded.heart_rate,
      respiratory_rate = excluded.respiratory_rate,
      temperature_c = excluded.temperature_c,
      oxygen_saturation = excluded.oxygen_saturation,
      capillary_glucose = excluded.capillary_glucose,
      weight_kg = excluded.weight_kg,
      height_cm = excluded.height_cm,
      bmi = excluded.bmi,
      risk_level = excluded.risk_level,
      nursing_notes = excluded.nursing_notes,
      recommendations = excluded.recommendations,
      correction_reason = excluded.correction_reason,
      completed_at = excluded.completed_at,
      updated_by = actor_uuid
  returning id into saved_id;

  if complete_assessment then
    select *
    into current_encounter
    from public.clinical_encounters
    where id = encounter_uuid
    for update;

    if current_encounter.status = 'triage_in_progress' then
      perform public.transition_clinical_encounter(
        current_encounter.id,
        'ready_for_consultation',
        transition_reason
      );
    elsif current_encounter.status <> 'ready_for_consultation' then
      raise exception 'INVALID_NURSING_COMPLETION_STAGE' using errcode = 'check_violation';
    end if;
  end if;

  return saved_id;
end;
$$;

create or replace function public.save_medical_record_transaction(
  record_payload jsonb,
  complete_record boolean default false,
  transition_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  encounter_uuid uuid := nullif(record_payload->>'encounter_id', '')::uuid;
  clinic_uuid uuid := nullif(record_payload->>'clinic_id', '')::uuid;
  current_encounter public.clinical_encounters%rowtype;
  previous_record public.medical_records%rowtype;
  saved_id uuid;
begin
  if actor_uuid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select *
  into current_encounter
  from public.clinical_encounters
  where id = encounter_uuid
    and clinic_id = clinic_uuid
    and deleted_at is null
  for update;

  if current_encounter.id is null then
    raise exception 'ENCOUNTER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (
    public.user_has_permission(current_encounter.clinic_id, 'schedule', 'manage', actor_uuid)
    or (
      current_encounter.professional_member_id = public.current_clinic_member_id(current_encounter.clinic_id)
      and public.user_has_permission(current_encounter.clinic_id, 'medical_records', 'edit', actor_uuid)
      and public.user_has_permission(current_encounter.clinic_id, 'medical_records', 'access_medical_record', actor_uuid)
    )
  ) then
    raise exception 'MEDICAL_RECORD_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  if current_encounter.status not in ('ready_for_consultation', 'consultation_in_progress', 'consultation_completed') then
    raise exception 'INVALID_MEDICAL_RECORD_STAGE' using errcode = 'check_violation';
  end if;

  select *
  into previous_record
  from public.medical_records
  where encounter_id = current_encounter.id
    and deleted_at is null
  for update;

  if current_encounter.status = 'ready_for_consultation' then
    perform public.transition_clinical_encounter(
      current_encounter.id,
      'consultation_in_progress',
      'Atendimento iniciado pelo prontuario.'
    );
  end if;

  insert into public.medical_records (
    clinic_id,
    encounter_id,
    appointment_id,
    patient_id,
    professional_member_id,
    performed_by,
    status,
    chief_complaint,
    history,
    physical_exam,
    assessment,
    diagnosis,
    cid10,
    plan,
    patient_guidance,
    follow_up_required,
    follow_up_notes,
    correction_reason,
    completed_at,
    created_by,
    updated_by
  )
  values (
    current_encounter.clinic_id,
    current_encounter.id,
    current_encounter.appointment_id,
    current_encounter.patient_id,
    current_encounter.professional_member_id,
    actor_uuid,
    coalesce(nullif(record_payload->>'status', ''), 'draft'),
    record_payload->>'chief_complaint',
    record_payload->>'history',
    record_payload->>'physical_exam',
    record_payload->>'assessment',
    record_payload->>'diagnosis',
    record_payload->>'cid10',
    record_payload->>'plan',
    record_payload->>'patient_guidance',
    coalesce((record_payload->>'follow_up_required')::boolean, false),
    record_payload->>'follow_up_notes',
    record_payload->>'correction_reason',
    nullif(record_payload->>'completed_at', '')::timestamptz,
    coalesce(previous_record.created_by, actor_uuid),
    actor_uuid
  )
  on conflict (encounter_id) do update
  set performed_by = excluded.performed_by,
      status = excluded.status,
      chief_complaint = excluded.chief_complaint,
      history = excluded.history,
      physical_exam = excluded.physical_exam,
      assessment = excluded.assessment,
      diagnosis = excluded.diagnosis,
      cid10 = excluded.cid10,
      plan = excluded.plan,
      patient_guidance = excluded.patient_guidance,
      follow_up_required = excluded.follow_up_required,
      follow_up_notes = excluded.follow_up_notes,
      correction_reason = excluded.correction_reason,
      completed_at = excluded.completed_at,
      updated_by = actor_uuid
  returning id into saved_id;

  if complete_record then
    select *
    into current_encounter
    from public.clinical_encounters
    where id = encounter_uuid
    for update;

    if current_encounter.status = 'consultation_in_progress' then
      perform public.transition_clinical_encounter(
        current_encounter.id,
        'consultation_completed',
        transition_reason
      );
    elsif current_encounter.status <> 'consultation_completed' then
      raise exception 'INVALID_MEDICAL_COMPLETION_STAGE' using errcode = 'check_violation';
    end if;
  end if;

  return saved_id;
end;
$$;

create or replace function public.create_financial_payment_transaction(
  payment_payload jsonb,
  ledger_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := nullif(payment_payload->>'created_by', '')::uuid;
  clinic_uuid uuid := nullif(payment_payload->>'clinic_id', '')::uuid;
  account_uuid uuid := nullif(payment_payload->>'account_id', '')::uuid;
  entry_uuid uuid := nullif(payment_payload->>'entry_id', '')::uuid;
  payment_uuid uuid;
  net_amount integer := coalesce(nullif(payment_payload->>'net_amount_cents', '')::integer, 0);
  payment_direction text := payment_payload->>'direction';
begin
  if actor_uuid is null then
    raise exception 'ACTOR_REQUIRED' using errcode = '42501';
  end if;

  if not (
    public.user_has_permission(clinic_uuid, 'financial', 'create', actor_uuid)
    or public.user_has_permission(clinic_uuid, 'financial', 'edit', actor_uuid)
    or public.user_has_permission(clinic_uuid, 'financial', 'manage', actor_uuid)
  ) then
    raise exception 'FINANCIAL_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  insert into public.financial_payments (
    clinic_id,
    entry_id,
    account_id,
    payment_method_id,
    card_machine_id,
    direction,
    amount_cents,
    fee_cents,
    net_amount_cents,
    paid_at,
    expected_settlement_date,
    notes,
    created_by,
    updated_by
  )
  values (
    clinic_uuid,
    entry_uuid,
    account_uuid,
    nullif(payment_payload->>'payment_method_id', '')::uuid,
    nullif(payment_payload->>'card_machine_id', '')::uuid,
    payment_direction,
    nullif(payment_payload->>'amount_cents', '')::integer,
    coalesce(nullif(payment_payload->>'fee_cents', '')::integer, 0),
    net_amount,
    nullif(payment_payload->>'paid_at', '')::timestamptz,
    nullif(payment_payload->>'expected_settlement_date', '')::date,
    payment_payload->>'notes',
    actor_uuid,
    actor_uuid
  )
  returning id into payment_uuid;

  if account_uuid is not null then
    update public.financial_accounts
    set current_balance_cents = current_balance_cents + case
          when payment_direction = 'in' then net_amount
          else -net_amount
        end,
        updated_by = actor_uuid
    where id = account_uuid
      and clinic_id = clinic_uuid
      and deleted_at is null;

    if not found then
      raise exception 'FINANCIAL_ACCOUNT_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  insert into public.financial_ledger_entries (
    clinic_id,
    account_id,
    entry_id,
    payment_id,
    reconciliation_id,
    direction,
    amount_cents,
    fee_cents,
    net_amount_cents,
    occurred_at,
    description,
    source_type,
    source_id,
    metadata,
    created_by
  )
  values (
    clinic_uuid,
    account_uuid,
    entry_uuid,
    payment_uuid,
    nullif(ledger_payload->>'reconciliation_id', '')::uuid,
    coalesce(nullif(ledger_payload->>'direction', ''), payment_direction),
    nullif(ledger_payload->>'amount_cents', '')::integer,
    coalesce(nullif(ledger_payload->>'fee_cents', '')::integer, 0),
    nullif(ledger_payload->>'net_amount_cents', '')::integer,
    nullif(ledger_payload->>'occurred_at', '')::timestamptz,
    coalesce(nullif(ledger_payload->>'description', ''), 'Movimento financeiro confirmado.'),
    coalesce(nullif(ledger_payload->>'source_type', ''), 'payment'),
    coalesce(nullif(ledger_payload->>'source_id', '')::uuid, payment_uuid),
    coalesce(ledger_payload->'metadata', '{}'::jsonb),
    actor_uuid
  );

  if entry_uuid is not null then
    insert into public.financial_entry_events (
      clinic_id,
      entry_id,
      event_type,
      new_values,
      notes,
      created_by
    )
    values (
      clinic_uuid,
      entry_uuid,
      'ledger_posted',
      jsonb_build_object(
        'payment_id', payment_uuid,
        'amount_cents', nullif(ledger_payload->>'amount_cents', '')::integer,
        'net_amount_cents', nullif(ledger_payload->>'net_amount_cents', '')::integer,
        'direction', coalesce(nullif(ledger_payload->>'direction', ''), payment_direction),
        'source_type', coalesce(nullif(ledger_payload->>'source_type', ''), 'payment')
      ),
      coalesce(nullif(ledger_payload->>'description', ''), 'Movimento financeiro confirmado.'),
      actor_uuid
    );
  end if;

  return payment_uuid;
end;
$$;

revoke execute on function public.save_nursing_assessment_transaction(jsonb, boolean, text)
from public, anon;
revoke execute on function public.save_medical_record_transaction(jsonb, boolean, text)
from public, anon;
revoke execute on function public.create_financial_payment_transaction(jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.save_nursing_assessment_transaction(jsonb, boolean, text) to authenticated;
grant execute on function public.save_medical_record_transaction(jsonb, boolean, text) to authenticated;
grant execute on function public.create_financial_payment_transaction(jsonb, jsonb) to service_role;

insert into public.financial_ledger_entries (
  clinic_id,
  account_id,
  entry_id,
  payment_id,
  direction,
  amount_cents,
  fee_cents,
  net_amount_cents,
  occurred_at,
  description,
  source_type,
  source_id,
  metadata,
  created_by
)
select
  fp.clinic_id,
  fp.account_id,
  fp.entry_id,
  fp.id,
  fp.direction,
  fp.amount_cents,
  fp.fee_cents,
  fp.net_amount_cents,
  fp.paid_at,
  case when fp.direction = 'in' then 'Recebimento confirmado.' else 'Pagamento confirmado.' end,
  'payment',
  fp.id,
  jsonb_build_object('backfilled_by', '034_security_transactions_quality.sql'),
  fp.created_by
from public.financial_payments fp
where fp.status = 'confirmed'
  and fp.deleted_at is null
  and not exists (
    select 1
    from public.financial_ledger_entries fle
    where fle.payment_id = fp.id
      and fle.source_type = 'payment'
  );
