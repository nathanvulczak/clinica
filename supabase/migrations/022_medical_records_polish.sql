-- CliniCore - Polimento do prontuario: anexos, exames e correcao formal.
-- Execute depois de 021_medical_records_documents_lgpd.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinical-attachments',
  'clinical-attachments',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'text/plain'
    ];

drop policy if exists "clinical_attachments_select_authorized" on storage.objects;
create policy "clinical_attachments_select_authorized"
on storage.objects for select
to authenticated
using (
  bucket_id = 'clinical-attachments'
  and exists (
    select 1
    from public.clinics c
    where c.id::text = (storage.foldername(name))[1]
      and (
        public.user_has_permission(c.id, 'schedule', 'manage')
        or public.user_has_permission(c.id, 'medical_records', 'access_medical_record')
      )
  )
);

drop policy if exists "clinical_attachments_insert_authorized" on storage.objects;
create policy "clinical_attachments_insert_authorized"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'clinical-attachments'
  and exists (
    select 1
    from public.clinics c
    where c.id::text = (storage.foldername(name))[1]
      and (
        public.user_has_permission(c.id, 'schedule', 'manage')
        or public.user_has_permission(c.id, 'medical_records', 'edit')
      )
  )
);

create table if not exists public.medical_record_attachments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  medical_record_id uuid not null references public.medical_records(id) on delete cascade,
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  patient_id uuid not null references public.patients(id),
  professional_member_id uuid not null references public.clinic_members(id),
  category text not null default 'attachment'
    check (category in ('exam', 'report', 'image', 'attachment', 'other')),
  title text not null,
  description text,
  file_name text not null,
  file_path text not null,
  mime_type text not null,
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  status text not null default 'active'
    check (status in ('active', 'deleted')),
  deleted_reason text,
  deleted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.medical_record_correction_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  medical_record_id uuid not null references public.medical_records(id) on delete cascade,
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  patient_id uuid not null references public.patients(id),
  professional_member_id uuid not null references public.clinic_members(id),
  reason text not null,
  status text not null default 'opened'
    check (status in ('opened', 'applied', 'cancelled')),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create index if not exists idx_medical_record_attachments_record
on public.medical_record_attachments(medical_record_id, created_at desc);

create index if not exists idx_medical_record_attachments_patient
on public.medical_record_attachments(clinic_id, patient_id, created_at desc);

create index if not exists idx_medical_correction_requests_record
on public.medical_record_correction_requests(medical_record_id, created_at desc);

drop trigger if exists set_medical_record_attachments_updated_at on public.medical_record_attachments;
create trigger set_medical_record_attachments_updated_at
before update on public.medical_record_attachments
for each row execute function public.set_updated_at();

drop trigger if exists set_medical_record_correction_requests_updated_at on public.medical_record_correction_requests;
create trigger set_medical_record_correction_requests_updated_at
before update on public.medical_record_correction_requests
for each row execute function public.set_updated_at();

alter table public.medical_record_attachments enable row level security;
alter table public.medical_record_correction_requests enable row level security;

drop policy if exists "medical_record_attachments_select_authorized" on public.medical_record_attachments;
create policy "medical_record_attachments_select_authorized"
on public.medical_record_attachments
for select
to authenticated
using (
  public.user_has_permission(medical_record_attachments.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_record_attachments.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(
        medical_record_attachments.clinic_id,
        'medical_records',
        'access_medical_record'
      )
  )
);

drop policy if exists "medical_record_attachments_insert_authorized" on public.medical_record_attachments;
create policy "medical_record_attachments_insert_authorized"
on public.medical_record_attachments
for insert
to authenticated
with check (
  public.user_has_permission(medical_record_attachments.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_record_attachments.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(medical_record_attachments.clinic_id, 'medical_records', 'edit')
  )
);

drop policy if exists "medical_record_attachments_update_authorized" on public.medical_record_attachments;
create policy "medical_record_attachments_update_authorized"
on public.medical_record_attachments
for update
to authenticated
using (
  public.user_has_permission(medical_record_attachments.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_record_attachments.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(medical_record_attachments.clinic_id, 'medical_records', 'edit')
  )
)
with check (
  public.user_has_permission(medical_record_attachments.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_record_attachments.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(medical_record_attachments.clinic_id, 'medical_records', 'edit')
  )
);

drop policy if exists "medical_correction_requests_select_authorized" on public.medical_record_correction_requests;
create policy "medical_correction_requests_select_authorized"
on public.medical_record_correction_requests
for select
to authenticated
using (
  public.user_has_permission(medical_record_correction_requests.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_record_correction_requests.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(
        medical_record_correction_requests.clinic_id,
        'medical_records',
        'access_medical_record'
      )
  )
);

drop policy if exists "medical_correction_requests_insert_authorized" on public.medical_record_correction_requests;
create policy "medical_correction_requests_insert_authorized"
on public.medical_record_correction_requests
for insert
to authenticated
with check (
  public.user_has_permission(medical_record_correction_requests.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_record_correction_requests.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(medical_record_correction_requests.clinic_id, 'medical_records', 'edit')
  )
);

drop policy if exists "medical_correction_requests_update_authorized" on public.medical_record_correction_requests;
create policy "medical_correction_requests_update_authorized"
on public.medical_record_correction_requests
for update
to authenticated
using (
  public.user_has_permission(medical_record_correction_requests.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_record_correction_requests.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(medical_record_correction_requests.clinic_id, 'medical_records', 'edit')
  )
)
with check (
  public.user_has_permission(medical_record_correction_requests.clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = medical_record_correction_requests.professional_member_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(medical_record_correction_requests.clinic_id, 'medical_records', 'edit')
  )
);

grant select, insert, update on public.medical_record_attachments to authenticated;
grant select, insert, update on public.medical_record_correction_requests to authenticated;
