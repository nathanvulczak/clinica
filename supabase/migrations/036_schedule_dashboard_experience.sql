-- CliniCore - Agenda interativa e painel personalizavel por usuario/clinica.
-- Execute after 035_clinical_encounter_routing_integrity.sql.

create table if not exists public.dashboard_preferences (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  visible_widgets text[] not null default array[
    'agenda',
    'reception',
    'care',
    'cash',
    'nextAppointments',
    'careFlow',
    'administration'
  ]::text[],
  layout jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  constraint dashboard_preferences_layout_is_array check (jsonb_typeof(layout) = 'array'),
  constraint dashboard_preferences_user_clinic_unique unique (clinic_id, user_id)
);

create index if not exists dashboard_preferences_user_idx
on public.dashboard_preferences (user_id, clinic_id)
where deleted_at is null;

drop trigger if exists set_dashboard_preferences_updated_at on public.dashboard_preferences;
create trigger set_dashboard_preferences_updated_at
before update on public.dashboard_preferences
for each row execute function public.set_updated_at();

alter table public.dashboard_preferences enable row level security;

drop policy if exists "dashboard_preferences_select_own" on public.dashboard_preferences;
create policy "dashboard_preferences_select_own"
on public.dashboard_preferences
for select
to authenticated
using (
  deleted_at is null
  and user_id = auth.uid()
  and exists (
    select 1
    from public.clinic_members member
    where member.clinic_id = dashboard_preferences.clinic_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.deleted_at is null
  )
);

drop policy if exists "dashboard_preferences_insert_own" on public.dashboard_preferences;
create policy "dashboard_preferences_insert_own"
on public.dashboard_preferences
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.clinic_members member
    where member.clinic_id = dashboard_preferences.clinic_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.deleted_at is null
  )
);

drop policy if exists "dashboard_preferences_update_own" on public.dashboard_preferences;
create policy "dashboard_preferences_update_own"
on public.dashboard_preferences
for update
to authenticated
using (deleted_at is null and user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.clinic_members member
    where member.clinic_id = dashboard_preferences.clinic_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.deleted_at is null
  )
);

grant select, insert, update on public.dashboard_preferences to authenticated;

insert into public.app_migration_history (migration_name, description, source, notes)
values (
  '036_schedule_dashboard_experience.sql',
  'Preferencias de dashboard por usuario e clinica com isolamento RLS.',
  'supabase_sql_editor',
  'Base persistente para grade arrastavel e redimensionavel.'
)
on conflict (migration_name) do nothing;
