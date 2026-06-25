-- Ajustes de permissões e base para funcionalidades administrativas.

update public.role_permissions
set
  allowed = false,
  updated_at = now()
where clinic_id is null
  and role = 'doctor'::public.app_role
  and module = 'nursing'::public.permission_module
  and action in ('create'::public.permission_action, 'edit'::public.permission_action);

insert into public.role_permissions (clinic_id, role, module, action, allowed)
select preset.clinic_id, preset.role, preset.module, preset.action, preset.allowed
from (
  values
    (null::uuid, 'nurse'::public.app_role, 'nursing'::public.permission_module, 'view'::public.permission_action, true),
    (null::uuid, 'nurse'::public.app_role, 'nursing'::public.permission_module, 'create'::public.permission_action, true),
    (null::uuid, 'nurse'::public.app_role, 'nursing'::public.permission_module, 'edit'::public.permission_action, true),
    (null::uuid, 'doctor'::public.app_role, 'nursing'::public.permission_module, 'view'::public.permission_action, true),
    (null::uuid, 'doctor'::public.app_role, 'nursing'::public.permission_module, 'create'::public.permission_action, false),
    (null::uuid, 'doctor'::public.app_role, 'nursing'::public.permission_module, 'edit'::public.permission_action, false)
) as preset(clinic_id, role, module, action, allowed)
where not exists (
  select 1
  from public.role_permissions existing
  where existing.clinic_id is not distinct from preset.clinic_id
    and existing.role = preset.role
    and existing.module = preset.module
    and existing.action = preset.action
    and existing.deleted_at is null
);

insert into public.audit_logs (
  clinic_id,
  user_id,
  action_type,
  module,
  record_table,
  level,
  notes
)
values (
  null,
  null,
  'permission_preset_aligned',
  'permissions',
  'role_permissions',
  'info',
  'Presets globais alinhados: enfermagem opera pré-consulta; médico visualiza resumo de enfermagem.'
);
