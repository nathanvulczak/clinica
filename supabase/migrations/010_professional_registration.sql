-- CliniCore - ficha operacional do profissional por clínica.
-- Execute depois de 009_registration_catalog.sql.

create table if not exists public.clinic_professional_profiles (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_member_id uuid not null references public.clinic_members(id) on delete cascade,
  specialty text,
  council_type text,
  council_number text,
  council_state text,
  rqe text,
  bio text,
  appointment_color text not null default '#0f766e',
  default_service_id uuid references public.clinic_services(id),
  default_room_id uuid references public.clinic_rooms(id),
  telemedicine_enabled boolean not null default false,
  accepts_new_patients boolean not null default true,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  constraint clinic_professional_profiles_color_check
    check (appointment_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint clinic_professional_profiles_state_check
    check (council_state is null or council_state ~ '^[A-Z]{2}$')
);

create unique index if not exists idx_clinic_professional_profiles_member
on public.clinic_professional_profiles(clinic_id, professional_member_id)
where deleted_at is null;

create unique index if not exists idx_clinic_professional_profiles_council
on public.clinic_professional_profiles(
  clinic_id,
  lower(council_type),
  lower(council_number),
  council_state
)
where council_type is not null
  and council_number is not null
  and deleted_at is null;

create index if not exists idx_clinic_professional_profiles_active
on public.clinic_professional_profiles(clinic_id, active, specialty)
where deleted_at is null;

drop trigger if exists set_clinic_professional_profiles_updated_at
on public.clinic_professional_profiles;
create trigger set_clinic_professional_profiles_updated_at
before update on public.clinic_professional_profiles
for each row execute function public.set_updated_at();

alter table public.clinic_professional_profiles enable row level security;

drop policy if exists "professional_profiles_select_authorized"
on public.clinic_professional_profiles;
create policy "professional_profiles_select_authorized"
on public.clinic_professional_profiles for select to authenticated
using (
  deleted_at is null
  and public.user_has_permission(clinic_id, 'schedule', 'view')
);

drop policy if exists "professional_profiles_insert_authorized"
on public.clinic_professional_profiles;
create policy "professional_profiles_insert_authorized"
on public.clinic_professional_profiles for insert to authenticated
with check (
  public.user_has_permission(clinic_id, 'schedule', 'edit')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = professional_member_id
      and cm.clinic_id = clinic_professional_profiles.clinic_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
  )
);

drop policy if exists "professional_profiles_update_authorized"
on public.clinic_professional_profiles;
create policy "professional_profiles_update_authorized"
on public.clinic_professional_profiles for update to authenticated
using (
  deleted_at is null
  and (
    public.user_has_permission(clinic_id, 'schedule', 'edit')
    or exists (
      select 1
      from public.clinic_members cm
      where cm.id = professional_member_id
        and cm.clinic_id = clinic_professional_profiles.clinic_id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.deleted_at is null
    )
  )
)
with check (
  public.user_has_permission(clinic_id, 'schedule', 'edit')
  or exists (
    select 1
    from public.clinic_members cm
    where cm.id = professional_member_id
      and cm.clinic_id = clinic_professional_profiles.clinic_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.deleted_at is null
  )
);
