-- CliniCore - Preferencias do modulo de Enfermagem.
-- Execute depois de 018_nursing_assessments.sql.

create table if not exists public.nursing_preferences (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  required_fields text[] not null default array['chief_complaint']::text[],
  allow_completed_corrections boolean not null default true,
  require_correction_reason boolean not null default true,
  show_required_field_alerts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

drop trigger if exists set_nursing_preferences_updated_at on public.nursing_preferences;
create trigger set_nursing_preferences_updated_at
before update on public.nursing_preferences
for each row execute function public.set_updated_at();

alter table public.nursing_preferences enable row level security;

drop policy if exists "nursing_preferences_select_authorized" on public.nursing_preferences;
create policy "nursing_preferences_select_authorized"
on public.nursing_preferences
for select
to authenticated
using (
  public.user_has_permission(nursing_preferences.clinic_id, 'nursing', 'view')
  or public.user_has_permission(nursing_preferences.clinic_id, 'schedule', 'manage')
);

drop policy if exists "nursing_preferences_insert_authorized" on public.nursing_preferences;
create policy "nursing_preferences_insert_authorized"
on public.nursing_preferences
for insert
to authenticated
with check (
  public.user_has_permission(nursing_preferences.clinic_id, 'nursing', 'edit')
  or public.user_has_permission(nursing_preferences.clinic_id, 'schedule', 'manage')
);

drop policy if exists "nursing_preferences_update_authorized" on public.nursing_preferences;
create policy "nursing_preferences_update_authorized"
on public.nursing_preferences
for update
to authenticated
using (
  public.user_has_permission(nursing_preferences.clinic_id, 'nursing', 'edit')
  or public.user_has_permission(nursing_preferences.clinic_id, 'schedule', 'manage')
)
with check (
  public.user_has_permission(nursing_preferences.clinic_id, 'nursing', 'edit')
  or public.user_has_permission(nursing_preferences.clinic_id, 'schedule', 'manage')
);

insert into public.nursing_preferences (clinic_id, created_by, updated_by)
select c.id, c.created_by, c.updated_by
from public.clinics c
where c.deleted_at is null
  and not exists (
    select 1
    from public.nursing_preferences np
    where np.clinic_id = c.id
  );

grant select, insert, update on public.nursing_preferences to authenticated;
