-- CliniCore - Documentos do prontuario, comentarios e ciencia LGPD.
-- Execute depois de 020_medical_records_module.sql.

alter table public.medical_prescriptions
  add column if not exists professional_registry text,
  add column if not exists deleted_reason text,
  add column if not exists deleted_by uuid references public.profiles(id),
  add column if not exists printed_at timestamptz,
  add column if not exists exported_at timestamptz;

alter table public.medical_prescriptions
  drop constraint if exists medical_prescriptions_status_check;

alter table public.medical_prescriptions
  add constraint medical_prescriptions_status_check
  check (status in ('draft', 'issued', 'cancelled', 'corrected', 'deleted'));

create table if not exists public.medical_document_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  medical_document_id uuid not null references public.medical_prescriptions(id) on delete cascade,
  medical_record_id uuid not null references public.medical_records(id) on delete cascade,
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  patient_id uuid not null references public.patients(id),
  professional_member_id uuid not null references public.clinic_members(id),
  event_type text not null check (event_type in ('created', 'updated', 'printed', 'exported_pdf', 'deleted', 'restored')),
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table if not exists public.patient_clinical_comments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.clinical_encounters(id) on delete set null,
  medical_record_id uuid references public.medical_records(id) on delete set null,
  professional_member_id uuid references public.clinic_members(id),
  comment text not null,
  visibility text not null default 'clinical'
    check (visibility in ('clinical', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.medical_lgpd_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_id uuid references public.clinic_members(id) on delete set null,
  version text not null default '2026-06-clinical-data-v1',
  accepted_at timestamptz not null default now(),
  consent_text text not null,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  unique (clinic_id, user_id, version)
);

create index if not exists idx_medical_document_events_document
on public.medical_document_events(medical_document_id, created_at desc);

create index if not exists idx_patient_clinical_comments_patient
on public.patient_clinical_comments(clinic_id, patient_id, created_at desc)
where deleted_at is null;

create index if not exists idx_medical_lgpd_ack_user
on public.medical_lgpd_acknowledgements(clinic_id, user_id, accepted_at desc);

drop trigger if exists set_patient_clinical_comments_updated_at on public.patient_clinical_comments;
create trigger set_patient_clinical_comments_updated_at
before update on public.patient_clinical_comments
for each row execute function public.set_updated_at();

alter table public.medical_document_events enable row level security;
alter table public.patient_clinical_comments enable row level security;
alter table public.medical_lgpd_acknowledgements enable row level security;

drop policy if exists "medical_prescriptions_select_authorized" on public.medical_prescriptions;
create policy "medical_prescriptions_select_authorized"
on public.medical_prescriptions
for select
to authenticated
using (
  public.user_has_permission(medical_prescriptions.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_prescriptions.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(
        medical_prescriptions.clinic_id,
        'medical_records',
        'access_medical_record'
      )
  )
);

drop policy if exists "medical_document_events_select_authorized" on public.medical_document_events;
create policy "medical_document_events_select_authorized"
on public.medical_document_events
for select
to authenticated
using (
  public.user_has_permission(medical_document_events.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_document_events.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(
        medical_document_events.clinic_id,
        'medical_records',
        'access_medical_record'
      )
  )
);

drop policy if exists "medical_document_events_insert_authorized" on public.medical_document_events;
create policy "medical_document_events_insert_authorized"
on public.medical_document_events
for insert
to authenticated
with check (
  public.user_has_permission(medical_document_events.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_document_events.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(medical_document_events.clinic_id, 'medical_records', 'edit')
  )
);

drop policy if exists "patient_clinical_comments_select_authorized" on public.patient_clinical_comments;
create policy "patient_clinical_comments_select_authorized"
on public.patient_clinical_comments
for select
to authenticated
using (
  deleted_at is null
  and (
    public.user_has_permission(patient_clinical_comments.clinic_id, 'schedule', 'manage')
    or exists (
      select 1
      from public.clinic_members cm
      where cm.id = patient_clinical_comments.professional_member_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.deleted_at is null
        and public.user_has_permission(
          patient_clinical_comments.clinic_id,
          'medical_records',
          'access_medical_record'
        )
    )
  )
);

drop policy if exists "patient_clinical_comments_insert_authorized" on public.patient_clinical_comments;
create policy "patient_clinical_comments_insert_authorized"
on public.patient_clinical_comments
for insert
to authenticated
with check (
  public.user_has_permission(patient_clinical_comments.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = patient_clinical_comments.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(patient_clinical_comments.clinic_id, 'medical_records', 'edit')
  )
);

drop policy if exists "patient_clinical_comments_update_authorized" on public.patient_clinical_comments;
create policy "patient_clinical_comments_update_authorized"
on public.patient_clinical_comments
for update
to authenticated
using (
  public.user_has_permission(patient_clinical_comments.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = patient_clinical_comments.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(patient_clinical_comments.clinic_id, 'medical_records', 'edit')
  )
)
with check (
  public.user_has_permission(patient_clinical_comments.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = patient_clinical_comments.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(patient_clinical_comments.clinic_id, 'medical_records', 'edit')
  )
);

drop policy if exists "medical_lgpd_ack_select_authorized" on public.medical_lgpd_acknowledgements;
create policy "medical_lgpd_ack_select_authorized"
on public.medical_lgpd_acknowledgements
for select
to authenticated
using (
  user_id = auth.uid()
  or public.user_has_permission(medical_lgpd_acknowledgements.clinic_id, 'audit', 'view')
);

drop policy if exists "medical_lgpd_ack_insert_self" on public.medical_lgpd_acknowledgements;
create policy "medical_lgpd_ack_insert_self"
on public.medical_lgpd_acknowledgements
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.user_has_permission(
    medical_lgpd_acknowledgements.clinic_id,
    'medical_records',
    'access_medical_record'
  )
);

grant select, insert on public.medical_document_events to authenticated;
grant select, insert, update on public.patient_clinical_comments to authenticated;
grant select, insert on public.medical_lgpd_acknowledgements to authenticated;
