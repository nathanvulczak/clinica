-- CliniCore - Ficha de pre-consulta da enfermagem.
-- Execute depois de 017_repair_missing_clinical_encounters.sql.

create table if not exists public.nursing_assessments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  encounter_id uuid not null unique references public.clinical_encounters(id) on delete cascade,
  patient_id uuid not null references public.patients(id),
  professional_member_id uuid not null references public.clinic_members(id),
  performed_by uuid references public.profiles(id),
  status text not null default 'draft'
    check (status in ('draft', 'completed', 'corrected')),
  chief_complaint text,
  current_medications text,
  allergies text,
  comorbidities text,
  pain_score integer check (pain_score between 0 and 10),
  pain_location text,
  systolic_bp integer check (systolic_bp between 40 and 260),
  diastolic_bp integer check (diastolic_bp between 20 and 180),
  heart_rate integer check (heart_rate between 20 and 240),
  respiratory_rate integer check (respiratory_rate between 5 and 80),
  temperature_c numeric(4,1) check (temperature_c between 30 and 45),
  oxygen_saturation integer check (oxygen_saturation between 50 and 100),
  capillary_glucose integer check (capillary_glucose between 20 and 600),
  weight_kg numeric(6,2) check (weight_kg between 0 and 500),
  height_cm numeric(5,2) check (height_cm between 20 and 260),
  bmi numeric(5,2),
  risk_level text not null default 'routine'
    check (risk_level in ('routine', 'attention', 'urgent')),
  nursing_notes text,
  recommendations text,
  correction_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create index if not exists idx_nursing_assessments_clinic_created
on public.nursing_assessments(clinic_id, created_at desc)
where deleted_at is null;

create index if not exists idx_nursing_assessments_patient_created
on public.nursing_assessments(clinic_id, patient_id, created_at desc)
where deleted_at is null;

drop trigger if exists set_nursing_assessments_updated_at on public.nursing_assessments;
create trigger set_nursing_assessments_updated_at
before update on public.nursing_assessments
for each row execute function public.set_updated_at();

alter table public.nursing_assessments enable row level security;

drop policy if exists "nursing_assessments_select_authorized" on public.nursing_assessments;
create policy "nursing_assessments_select_authorized"
on public.nursing_assessments
for select
to authenticated
using (
  public.user_has_permission(clinic_id, 'nursing', 'view')
  or public.user_has_permission(clinic_id, 'schedule', 'manage')
  or exists (
    select 1
    from public.clinical_encounters ce
    join public.clinic_members cm on cm.id = ce.professional_member_id
    where ce.id = encounter_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
      and public.user_has_permission(clinic_id, 'medical_records', 'access_medical_record')
  )
);

drop policy if exists "nursing_assessments_insert_authorized" on public.nursing_assessments;
create policy "nursing_assessments_insert_authorized"
on public.nursing_assessments
for insert
to authenticated
with check (
  public.user_has_permission(clinic_id, 'nursing', 'create')
  or public.user_has_permission(clinic_id, 'nursing', 'edit')
);

drop policy if exists "nursing_assessments_update_authorized" on public.nursing_assessments;
create policy "nursing_assessments_update_authorized"
on public.nursing_assessments
for update
to authenticated
using (
  public.user_has_permission(clinic_id, 'nursing', 'edit')
  or public.user_has_permission(clinic_id, 'schedule', 'manage')
)
with check (
  public.user_has_permission(clinic_id, 'nursing', 'edit')
  or public.user_has_permission(clinic_id, 'schedule', 'manage')
);

grant select, insert, update on public.nursing_assessments to authenticated;
