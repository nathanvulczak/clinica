-- CliniCore - Modulo de prontuarios, evolucao e prescricoes.
-- Execute depois de 019_nursing_module_preferences.sql.

create table if not exists public.medical_record_preferences (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  required_fields text[] not null default array['assessment', 'plan']::text[],
  allow_completed_corrections boolean not null default true,
  require_correction_reason boolean not null default true,
  show_nursing_summary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  encounter_id uuid not null unique references public.clinical_encounters(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id),
  patient_id uuid not null references public.patients(id),
  professional_member_id uuid not null references public.clinic_members(id),
  performed_by uuid references public.profiles(id),
  status text not null default 'draft'
    check (status in ('draft', 'completed', 'corrected')),
  chief_complaint text,
  history text,
  physical_exam text,
  assessment text,
  diagnosis text,
  cid10 text,
  plan text,
  patient_guidance text,
  follow_up_required boolean not null default false,
  follow_up_notes text,
  correction_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.medical_prescriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  medical_record_id uuid not null references public.medical_records(id) on delete cascade,
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  patient_id uuid not null references public.patients(id),
  professional_member_id uuid not null references public.clinic_members(id),
  template_key text,
  title text not null,
  content text not null,
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'cancelled', 'corrected')),
  issued_at timestamptz,
  correction_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create index if not exists idx_medical_records_clinic_updated
on public.medical_records(clinic_id, updated_at desc)
where deleted_at is null;

create index if not exists idx_medical_records_patient_updated
on public.medical_records(clinic_id, patient_id, updated_at desc)
where deleted_at is null;

create index if not exists idx_medical_records_professional_updated
on public.medical_records(clinic_id, professional_member_id, updated_at desc)
where deleted_at is null;

create index if not exists idx_medical_prescriptions_record
on public.medical_prescriptions(medical_record_id, created_at desc)
where deleted_at is null;

drop trigger if exists set_medical_record_preferences_updated_at on public.medical_record_preferences;
create trigger set_medical_record_preferences_updated_at
before update on public.medical_record_preferences
for each row execute function public.set_updated_at();

drop trigger if exists set_medical_records_updated_at on public.medical_records;
create trigger set_medical_records_updated_at
before update on public.medical_records
for each row execute function public.set_updated_at();

drop trigger if exists set_medical_prescriptions_updated_at on public.medical_prescriptions;
create trigger set_medical_prescriptions_updated_at
before update on public.medical_prescriptions
for each row execute function public.set_updated_at();

alter table public.medical_record_preferences enable row level security;
alter table public.medical_records enable row level security;
alter table public.medical_prescriptions enable row level security;

drop policy if exists "medical_record_preferences_select_authorized" on public.medical_record_preferences;
create policy "medical_record_preferences_select_authorized"
on public.medical_record_preferences
for select
to authenticated
using (
  public.user_has_permission(medical_record_preferences.clinic_id, 'medical_records', 'view')
  or public.user_has_permission(medical_record_preferences.clinic_id, 'schedule', 'manage')
);

drop policy if exists "medical_record_preferences_insert_authorized" on public.medical_record_preferences;
create policy "medical_record_preferences_insert_authorized"
on public.medical_record_preferences
for insert
to authenticated
with check (
  public.user_has_permission(medical_record_preferences.clinic_id, 'medical_records', 'edit')
  or public.user_has_permission(medical_record_preferences.clinic_id, 'schedule', 'manage')
);

drop policy if exists "medical_record_preferences_update_authorized" on public.medical_record_preferences;
create policy "medical_record_preferences_update_authorized"
on public.medical_record_preferences
for update
to authenticated
using (
  public.user_has_permission(medical_record_preferences.clinic_id, 'medical_records', 'edit')
  or public.user_has_permission(medical_record_preferences.clinic_id, 'schedule', 'manage')
)
with check (
  public.user_has_permission(medical_record_preferences.clinic_id, 'medical_records', 'edit')
  or public.user_has_permission(medical_record_preferences.clinic_id, 'schedule', 'manage')
);

drop policy if exists "medical_records_select_authorized" on public.medical_records;
create policy "medical_records_select_authorized"
on public.medical_records
for select
to authenticated
using (
  deleted_at is null
  and (
    public.user_has_permission(medical_records.clinic_id, 'schedule', 'manage')
    or exists (
      select 1
      from public.clinic_members cm
      where cm.id = medical_records.professional_member_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.deleted_at is null
        and public.user_has_permission(
          medical_records.clinic_id,
          'medical_records',
          'access_medical_record'
        )
    )
  )
);

drop policy if exists "medical_records_insert_authorized" on public.medical_records;
create policy "medical_records_insert_authorized"
on public.medical_records
for insert
to authenticated
with check (
  public.user_has_permission(medical_records.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_records.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(medical_records.clinic_id, 'medical_records', 'create')
      and public.user_has_permission(
        medical_records.clinic_id,
        'medical_records',
        'access_medical_record'
      )
  )
);

drop policy if exists "medical_records_update_authorized" on public.medical_records;
create policy "medical_records_update_authorized"
on public.medical_records
for update
to authenticated
using (
  public.user_has_permission(medical_records.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_records.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(medical_records.clinic_id, 'medical_records', 'edit')
      and public.user_has_permission(
        medical_records.clinic_id,
        'medical_records',
        'access_medical_record'
      )
  )
)
with check (
  public.user_has_permission(medical_records.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_records.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(medical_records.clinic_id, 'medical_records', 'edit')
      and public.user_has_permission(
        medical_records.clinic_id,
        'medical_records',
        'access_medical_record'
      )
  )
);

drop policy if exists "medical_prescriptions_select_authorized" on public.medical_prescriptions;
create policy "medical_prescriptions_select_authorized"
on public.medical_prescriptions
for select
to authenticated
using (
  deleted_at is null
  and (
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
  )
);

drop policy if exists "medical_prescriptions_insert_authorized" on public.medical_prescriptions;
create policy "medical_prescriptions_insert_authorized"
on public.medical_prescriptions
for insert
to authenticated
with check (
  public.user_has_permission(medical_prescriptions.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_prescriptions.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(medical_prescriptions.clinic_id, 'medical_records', 'create')
      and public.user_has_permission(
        medical_prescriptions.clinic_id,
        'medical_records',
        'access_medical_record'
      )
  )
);

drop policy if exists "medical_prescriptions_update_authorized" on public.medical_prescriptions;
create policy "medical_prescriptions_update_authorized"
on public.medical_prescriptions
for update
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
      and public.user_has_permission(medical_prescriptions.clinic_id, 'medical_records', 'edit')
      and public.user_has_permission(
        medical_prescriptions.clinic_id,
        'medical_records',
        'access_medical_record'
      )
  )
)
with check (
  public.user_has_permission(medical_prescriptions.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_prescriptions.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(medical_prescriptions.clinic_id, 'medical_records', 'edit')
      and public.user_has_permission(
        medical_prescriptions.clinic_id,
        'medical_records',
        'access_medical_record'
      )
  )
);

insert into public.medical_record_preferences (clinic_id, created_by, updated_by)
select c.id, c.created_by, c.updated_by
from public.clinics c
where c.deleted_at is null
  and not exists (
    select 1
    from public.medical_record_preferences mrp
    where mrp.clinic_id = c.id
  );

grant select, insert, update on public.medical_record_preferences to authenticated;
grant select, insert, update on public.medical_records to authenticated;
grant select, insert, update on public.medical_prescriptions to authenticated;
