-- Fase 2.2 - Auditoria ampliada, preferências, avatar e reparos de vínculo.

alter table public.profiles
add column if not exists app_preferences jsonb not null default '{}'::jsonb;

update public.profiles
set app_preferences = '{}'::jsonb
where app_preferences is null;

-- Repara clínicas já criadas antes do vínculo automático do proprietário.
insert into public.clinic_members (
  clinic_id,
  user_id,
  role,
  status,
  joined_at,
  created_by,
  updated_by
)
select
  c.id,
  c.created_by,
  'clinic_owner',
  'active',
  coalesce(c.created_at, now()),
  c.created_by,
  c.created_by
from public.clinics c
where c.created_by is not null
  and c.deleted_at is null
  and not exists (
    select 1
    from public.clinic_members cm
    where cm.clinic_id = c.id
      and cm.user_id = c.created_by
      and cm.deleted_at is null
  )
on conflict (clinic_id, user_id) do update
set role = 'clinic_owner',
    status = 'active',
    joined_at = coalesce(public.clinic_members.joined_at, excluded.joined_at),
    updated_by = excluded.updated_by,
    updated_at = now();

update public.profiles p
set platform_role = 'clinic_owner',
    updated_at = now()
where p.platform_role = 'professional'
  and exists (
    select 1
    from public.clinics c
    where c.created_by = p.id
      and c.deleted_at is null
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
on storage.objects for select
to public
using (bucket_id = 'avatars');

drop policy if exists "avatars_users_insert_own_folder" on storage.objects;
create policy "avatars_users_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "avatars_users_update_own_folder" on storage.objects;
create policy "avatars_users_update_own_folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "avatars_users_delete_own_folder" on storage.objects;
create policy "avatars_users_delete_own_folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create or replace function public.audit_table_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_json jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  old_json jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  clinic_uuid uuid;
  actor_uuid uuid;
  affected_id uuid;
  module_name public.permission_module;
  action_name text;
begin
  if tg_table_name = 'audit_logs' then
    return coalesce(new, old);
  end if;

  clinic_uuid := nullif(coalesce(
    new_json ->> 'clinic_id',
    old_json ->> 'clinic_id',
    case when tg_table_name = 'clinics' then coalesce(new_json ->> 'id', old_json ->> 'id') end
  ), '')::uuid;

  actor_uuid := coalesce(
    auth.uid(),
    nullif(coalesce(new_json ->> 'updated_by', old_json ->> 'updated_by'), '')::uuid,
    nullif(coalesce(new_json ->> 'created_by', old_json ->> 'created_by'), '')::uuid,
    nullif(coalesce(new_json ->> 'user_id', old_json ->> 'user_id'), '')::uuid,
    nullif(coalesce(new_json ->> 'owner_user_id', old_json ->> 'owner_user_id'), '')::uuid
  );

  affected_id := nullif(coalesce(new_json ->> 'id', old_json ->> 'id'), '')::uuid;

  module_name := case tg_table_name
    when 'clinics' then 'clinics'::public.permission_module
    when 'clinic_members' then 'members'::public.permission_module
    when 'role_permissions' then 'permissions'::public.permission_module
    when 'member_permissions' then 'permissions'::public.permission_module
    when 'subscriptions' then 'billing'::public.permission_module
    when 'invoices' then 'billing'::public.permission_module
    else null
  end;

  action_name := case tg_op
    when 'INSERT' then 'record_created'
    when 'UPDATE' then 'record_updated'
    when 'DELETE' then 'record_deleted'
  end;

  insert into public.audit_logs (
    clinic_id,
    user_id,
    action_type,
    module,
    record_table,
    record_id,
    old_values,
    new_values,
    level,
    notes,
    created_by,
    updated_by
  )
  values (
    clinic_uuid,
    actor_uuid,
    action_name,
    module_name,
    tg_table_name,
    affected_id,
    old_json,
    new_json,
    'info',
    format('Alteração automática registrada em %s.', tg_table_name),
    actor_uuid,
    actor_uuid
  );

  return coalesce(new, old);
end;
$$;

do $$
declare
  tracked_table text;
begin
  foreach tracked_table in array array[
    'profiles',
    'clinics',
    'clinic_members',
    'subscriptions',
    'invoices',
    'role_permissions',
    'member_permissions'
  ]
  loop
    execute format('drop trigger if exists audit_%I_changes on public.%I', tracked_table, tracked_table);
    execute format(
      'create trigger audit_%I_changes after insert or update or delete on public.%I for each row execute function public.audit_table_changes()',
      tracked_table,
      tracked_table
    );
  end loop;
end $$;

drop policy if exists "audit_logs_read_own_security_events" on public.audit_logs;
create policy "audit_logs_read_own_security_events"
on public.audit_logs for select
to authenticated
using (
  user_id = auth.uid()
  and action_type in (
    'login',
    'logout',
    'password_changed',
    'profile_updated',
    'preferences_updated',
    'avatar_uploaded',
    'record_updated'
  )
);

create index if not exists idx_audit_logs_action_created
on public.audit_logs(action_type, created_at desc)
where deleted_at is null;

create index if not exists idx_profiles_app_preferences
on public.profiles using gin(app_preferences);
