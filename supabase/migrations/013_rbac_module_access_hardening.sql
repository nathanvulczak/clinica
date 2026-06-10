-- RBAC hardening:
-- 1. clinic_owner keeps full control;
-- 2. every other role follows presets and clinic/member overrides;
-- 3. an explicit member override has priority, including denied access.

create or replace function public.user_has_permission(
  clinic_uuid uuid,
  permission_module public.permission_module,
  permission_action public.permission_action,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(user_uuid)
    or exists (
      select 1
      from public.clinic_members cm
      where cm.clinic_id = clinic_uuid
        and cm.user_id = user_uuid
        and cm.status = 'active'
        and cm.deleted_at is null
        and (
          cm.role = 'clinic_owner'
          or coalesce(
            (
              select mp.allowed
              from public.member_permissions mp
              where mp.clinic_id = clinic_uuid
                and mp.member_id = cm.id
                and mp.module = permission_module
                and mp.action = permission_action
                and mp.deleted_at is null
              order by mp.updated_at desc
              limit 1
            ),
            (
              select rp.allowed
              from public.role_permissions rp
              where rp.clinic_id = clinic_uuid
                and rp.role = cm.role
                and rp.module = permission_module
                and rp.action = permission_action
                and rp.deleted_at is null
              order by rp.updated_at desc
              limit 1
            ),
            (
              select rp.allowed
              from public.role_permissions rp
              where rp.clinic_id is null
                and rp.role = cm.role
                and rp.module = permission_module
                and rp.action = permission_action
                and rp.deleted_at is null
              order by rp.updated_at desc
              limit 1
            ),
            false
          )
        )
    );
$$;

update public.role_permissions
set allowed = false,
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
where clinic_id is null
  and role not in ('platform_admin', 'clinic_owner')
  and deleted_at is null;

insert into public.role_permissions (role, module, action, allowed)
values
  ('clinic_admin', 'clinics', 'view', true),
  ('clinic_admin', 'clinics', 'edit', true),
  ('clinic_admin', 'members', 'view', true),
  ('clinic_admin', 'members', 'create', true),
  ('clinic_admin', 'members', 'edit', true),
  ('clinic_admin', 'members', 'manage', true),
  ('clinic_admin', 'permissions', 'view', true),
  ('clinic_admin', 'permissions', 'manage', true),
  ('clinic_admin', 'audit', 'view', true),
  ('clinic_admin', 'audit', 'export', true),
  ('clinic_admin', 'patients', 'view', true),
  ('clinic_admin', 'patients', 'create', true),
  ('clinic_admin', 'patients', 'edit', true),
  ('clinic_admin', 'patients', 'delete', true),
  ('clinic_admin', 'patients', 'export', true),
  ('clinic_admin', 'schedule', 'view', true),
  ('clinic_admin', 'schedule', 'create', true),
  ('clinic_admin', 'schedule', 'edit', true),
  ('clinic_admin', 'schedule', 'delete', true),
  ('clinic_admin', 'schedule', 'manage', true),
  ('clinic_admin', 'schedule', 'export', true),
  ('clinic_admin', 'financial', 'view', true),
  ('clinic_admin', 'financial', 'manage', true),
  ('clinic_admin', 'reports', 'view', true),
  ('clinic_admin', 'reports', 'export', true),

  ('doctor', 'patients', 'view', true),
  ('doctor', 'medical_records', 'view', true),
  ('doctor', 'medical_records', 'create', true),
  ('doctor', 'medical_records', 'edit', true),
  ('doctor', 'medical_records', 'access_medical_record', true),
  ('doctor', 'schedule', 'view', true),
  ('doctor', 'schedule', 'edit', true),

  ('nurse', 'patients', 'view', true),
  ('nurse', 'patients', 'edit', true),
  ('nurse', 'medical_records', 'view', true),
  ('nurse', 'medical_records', 'create', true),
  ('nurse', 'medical_records', 'edit', true),
  ('nurse', 'medical_records', 'access_medical_record', true),
  ('nurse', 'schedule', 'view', true),
  ('nurse', 'schedule', 'edit', true),

  ('receptionist', 'patients', 'view', true),
  ('receptionist', 'patients', 'create', true),
  ('receptionist', 'patients', 'edit', true),
  ('receptionist', 'patients', 'export', true),
  ('receptionist', 'schedule', 'view', true),
  ('receptionist', 'schedule', 'create', true),
  ('receptionist', 'schedule', 'edit', true),
  ('receptionist', 'schedule', 'manage', true),
  ('receptionist', 'schedule', 'export', true),

  ('financial', 'billing', 'view', true),
  ('financial', 'financial', 'view', true),
  ('financial', 'financial', 'create', true),
  ('financial', 'financial', 'edit', true),
  ('financial', 'financial', 'manage', true),
  ('financial', 'financial', 'export', true),
  ('financial', 'reports', 'view', true),
  ('financial', 'reports', 'export', true),

  ('professional', 'patients', 'view', true),
  ('professional', 'schedule', 'view', true),
  ('professional', 'schedule', 'edit', true);

grant execute on function public.user_has_permission(
  uuid,
  public.permission_module,
  public.permission_action,
  uuid
) to authenticated;
