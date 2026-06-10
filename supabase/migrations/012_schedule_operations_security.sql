-- CliniCore - Operação completa e segurança da Agenda.
-- Execute depois de 011_member_invite_access.sql.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_channel') then
    create type public.notification_channel as enum ('email', 'whatsapp');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_status') then
    create type public.notification_status as enum ('pending', 'sent', 'failed', 'cancelled');
  end if;
end $$;

alter table public.appointments
  add column if not exists rescheduled_from_id uuid references public.appointments(id),
  add column if not exists checked_in_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists no_show_at timestamptz,
  add column if not exists last_notification_at timestamptz;

create index if not exists idx_appointments_rescheduled_from
on public.appointments(rescheduled_from_id)
where rescheduled_from_id is not null;

create table if not exists public.appointment_notifications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  channel public.notification_channel not null,
  recipient text not null,
  template_key text not null default 'appointment_confirmation',
  status public.notification_status not null default 'pending',
  provider_message_id text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create index if not exists idx_appointment_notifications_clinic_status
on public.appointment_notifications(clinic_id, status, created_at desc)
where deleted_at is null;

create index if not exists idx_appointment_notifications_appointment
on public.appointment_notifications(appointment_id, created_at desc)
where deleted_at is null;

drop trigger if exists set_appointment_notifications_updated_at
on public.appointment_notifications;
create trigger set_appointment_notifications_updated_at
before update on public.appointment_notifications
for each row execute function public.set_updated_at();

create or replace function public.current_clinic_member_id(
  clinic_uuid uuid,
  user_uuid uuid default auth.uid()
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cm.id
  from public.clinic_members cm
  where cm.clinic_id = clinic_uuid
    and cm.user_id = user_uuid
    and cm.status = 'active'
    and cm.deleted_at is null
  limit 1;
$$;

create or replace function public.validate_appointment_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'scheduled' and new.status in ('confirmed', 'checked_in', 'cancelled', 'no_show', 'rescheduled'))
    or (old.status = 'confirmed' and new.status in ('checked_in', 'cancelled', 'no_show', 'rescheduled'))
    or (old.status = 'checked_in' and new.status in ('in_triage', 'in_progress', 'cancelled', 'rescheduled'))
    or (old.status = 'in_triage' and new.status in ('in_progress', 'cancelled'))
    or (old.status = 'in_progress' and new.status = 'completed')
    or (old.status = 'completed' and new.status = 'billing_pending')
    or (old.status = 'billing_pending' and new.status = 'billed')
  ) then
    raise exception 'Transição de status inválida: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_appointment_status_transition
on public.appointments;
create trigger validate_appointment_status_transition
before update of status on public.appointments
for each row execute function public.validate_appointment_status_transition();

create or replace function public.reschedule_appointment(
  source_appointment_id uuid,
  clinic_uuid uuid,
  patient_uuid uuid,
  professional_member_uuid uuid,
  service_uuid uuid,
  room_uuid uuid,
  new_starts_at timestamptz,
  new_ends_at timestamptz,
  new_appointment_type text,
  new_channel text,
  new_notes text,
  reschedule_reason text,
  actor_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_appointment public.appointments%rowtype;
  created_appointment_id uuid;
begin
  select *
  into source_appointment
  from public.appointments
  where id = source_appointment_id
    and clinic_id = clinic_uuid
    and deleted_at is null
    and status in ('scheduled', 'confirmed', 'checked_in')
  for update;

  if source_appointment.id is null then
    raise exception 'Compromisso não encontrado ou não pode ser remarcado.'
      using errcode = 'check_violation';
  end if;

  update public.appointments
  set status = 'rescheduled',
      cancellation_reason = reschedule_reason,
      updated_by = actor_uuid
  where id = source_appointment.id;

  insert into public.appointments (
    clinic_id,
    patient_id,
    professional_member_id,
    service_id,
    room_id,
    scheduled_by,
    starts_at,
    ends_at,
    status,
    appointment_type,
    channel,
    notes,
    rescheduled_from_id,
    created_by,
    updated_by
  )
  values (
    clinic_uuid,
    patient_uuid,
    professional_member_uuid,
    service_uuid,
    room_uuid,
    actor_uuid,
    new_starts_at,
    new_ends_at,
    'scheduled',
    new_appointment_type,
    new_channel,
    new_notes,
    source_appointment.id,
    actor_uuid,
    actor_uuid
  )
  returning id into created_appointment_id;

  insert into public.appointment_workflow_events (
    clinic_id,
    appointment_id,
    from_status,
    to_status,
    notes,
    created_by,
    updated_by
  )
  values
    (
      clinic_uuid,
      source_appointment.id,
      source_appointment.status,
      'rescheduled',
      reschedule_reason,
      actor_uuid,
      actor_uuid
    ),
    (
      clinic_uuid,
      created_appointment_id,
      null,
      'scheduled',
      'Novo compromisso criado por remarcação.',
      actor_uuid,
      actor_uuid
    );

  return created_appointment_id;
end;
$$;

revoke all on function public.reschedule_appointment(
  uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.reschedule_appointment(
  uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, uuid
) to service_role;

alter table public.appointment_notifications enable row level security;

drop policy if exists "appointments_select_authorized" on public.appointments;
create policy "appointments_select_authorized"
on public.appointments for select
to authenticated
using (
  deleted_at is null
  and (
    public.user_has_permission(clinic_id, 'schedule', 'manage')
    or (
      public.user_has_permission(clinic_id, 'schedule', 'view')
      and professional_member_id = public.current_clinic_member_id(clinic_id)
    )
  )
);

drop policy if exists "appointments_manage_authorized" on public.appointments;
drop policy if exists "appointments_insert_authorized" on public.appointments;
drop policy if exists "appointments_update_authorized" on public.appointments;
drop policy if exists "appointments_delete_authorized" on public.appointments;

create policy "appointments_insert_authorized"
on public.appointments for insert
to authenticated
with check (public.user_has_permission(clinic_id, 'schedule', 'create'));

create policy "appointments_update_authorized"
on public.appointments for update
to authenticated
using (
  deleted_at is null
  and (
    public.user_has_permission(clinic_id, 'schedule', 'manage')
    or (
      public.user_has_permission(clinic_id, 'schedule', 'edit')
      and professional_member_id = public.current_clinic_member_id(clinic_id)
    )
  )
)
with check (
  public.user_has_permission(clinic_id, 'schedule', 'manage')
  or (
    public.user_has_permission(clinic_id, 'schedule', 'edit')
    and professional_member_id = public.current_clinic_member_id(clinic_id)
  )
);

create policy "appointments_delete_authorized"
on public.appointments for delete
to authenticated
using (public.user_has_permission(clinic_id, 'schedule', 'manage'));

drop policy if exists "schedule_blocks_select_authorized" on public.schedule_blocks;
create policy "schedule_blocks_select_authorized"
on public.schedule_blocks for select
to authenticated
using (
  deleted_at is null
  and (
    public.user_has_permission(clinic_id, 'schedule', 'manage')
    or (
      public.user_has_permission(clinic_id, 'schedule', 'view')
      and professional_member_id = public.current_clinic_member_id(clinic_id)
    )
  )
);

drop policy if exists "schedule_settings_select_authorized" on public.schedule_professional_settings;
create policy "schedule_settings_select_authorized"
on public.schedule_professional_settings for select
to authenticated
using (
  deleted_at is null
  and (
    public.user_has_permission(clinic_id, 'schedule', 'manage')
    or professional_member_id = public.current_clinic_member_id(clinic_id)
  )
);

drop policy if exists "appointment_events_select_authorized" on public.appointment_workflow_events;
create policy "appointment_events_select_authorized"
on public.appointment_workflow_events for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.appointments a
    where a.id = appointment_workflow_events.appointment_id
      and a.clinic_id = appointment_workflow_events.clinic_id
      and a.deleted_at is null
      and (
        public.user_has_permission(a.clinic_id, 'schedule', 'manage')
        or (
          public.user_has_permission(a.clinic_id, 'schedule', 'view')
          and a.professional_member_id = public.current_clinic_member_id(a.clinic_id)
        )
      )
  )
);

drop policy if exists "appointment_notifications_select_authorized"
on public.appointment_notifications;
create policy "appointment_notifications_select_authorized"
on public.appointment_notifications for select
to authenticated
using (
  deleted_at is null
  and public.user_has_permission(clinic_id, 'schedule', 'manage')
);

drop policy if exists "appointment_notifications_manage_authorized"
on public.appointment_notifications;
create policy "appointment_notifications_manage_authorized"
on public.appointment_notifications for all
to authenticated
using (public.user_has_permission(clinic_id, 'schedule', 'manage'))
with check (public.user_has_permission(clinic_id, 'schedule', 'manage'));

insert into public.role_permissions (role, module, action, allowed)
select permission.role, 'schedule'::public.permission_module, 'edit'::public.permission_action, true
from (
  values
    ('doctor'::public.app_role),
    ('nurse'::public.app_role),
    ('professional'::public.app_role)
) as permission(role)
where not exists (
  select 1
  from public.role_permissions rp
  where rp.clinic_id is null
    and rp.role = permission.role
    and rp.module = 'schedule'
    and rp.action = 'edit'
    and rp.deleted_at is null
);
