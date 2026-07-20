-- CliniCore - Controle global de contas de usuarios sem apagar dados clinicos.

alter table public.profiles
  add column if not exists platform_account_status text not null default 'active'
    check (platform_account_status in ('active', 'suspended')),
  add column if not exists platform_suspended_at timestamptz,
  add column if not exists platform_suspended_by uuid references public.profiles(id),
  add column if not exists platform_suspension_reason text;

create or replace function public.user_has_clinic_access(clinic_uuid uuid, user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_members cm
    join public.clinics c on c.id = cm.clinic_id
    join public.profiles p on p.id = cm.user_id
    where cm.clinic_id = clinic_uuid
      and cm.user_id = user_uuid
      and cm.status = 'active'
      and cm.deleted_at is null
      and p.platform_account_status = 'active'
      and c.platform_status = 'active'
      and c.deleted_at is null
  );
$$;

create or replace function public.user_has_clinic_role(
  clinic_uuid uuid,
  allowed_roles public.app_role[],
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_members cm
    join public.clinics c on c.id = cm.clinic_id
    join public.profiles p on p.id = cm.user_id
    where cm.clinic_id = clinic_uuid
      and cm.user_id = user_uuid
      and cm.role = any(allowed_roles)
      and cm.status = 'active'
      and cm.deleted_at is null
      and p.platform_account_status = 'active'
      and c.platform_status = 'active'
      and c.deleted_at is null
  );
$$;

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

  return exists (
    select 1
    from public.clinic_members cm
    join public.clinics c on c.id = cm.clinic_id
    join public.profiles p on p.id = cm.user_id
    where cm.clinic_id = clinic_uuid
      and cm.user_id = effective_user_uuid
      and cm.status = 'active'
      and cm.deleted_at is null
      and p.platform_account_status = 'active'
      and c.platform_status = 'active'
      and c.deleted_at is null
      and (
        cm.role = 'clinic_owner'
        or coalesce(
          (select mp.allowed from public.member_permissions mp where mp.clinic_id = clinic_uuid and mp.member_id = cm.id and mp.module = permission_module and mp.action = permission_action and mp.deleted_at is null order by mp.updated_at desc limit 1),
          (select rp.allowed from public.role_permissions rp where rp.clinic_id = clinic_uuid and rp.role = cm.role and rp.module = permission_module and rp.action = permission_action and rp.deleted_at is null order by rp.updated_at desc limit 1),
          (select rp.allowed from public.role_permissions rp where rp.clinic_id is null and rp.role = cm.role and rp.module = permission_module and rp.action = permission_action and rp.deleted_at is null order by rp.updated_at desc limit 1),
          false
        )
      )
  );
end;
$$;

revoke execute on function public.user_has_clinic_access(uuid, uuid) from public, anon;
revoke execute on function public.user_has_clinic_role(uuid, public.app_role[], uuid) from public, anon;
grant execute on function public.user_has_clinic_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.user_has_clinic_role(uuid, public.app_role[], uuid) to authenticated, service_role;
grant execute on function public.user_has_permission(uuid, public.permission_module, public.permission_action, uuid) to authenticated, service_role;

insert into public.app_migration_history(migration_name, description, source, notes)
values ('054_platform_user_controls.sql', 'Suspensao e reativacao global de usuarios sem exclusao de dados.', 'supabase_sql_editor', 'Contas suspensas nao recebem autorizacao de clinica; o console registra o motivo e o responsavel.')
on conflict (migration_name) do nothing;
