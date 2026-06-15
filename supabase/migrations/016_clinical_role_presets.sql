-- CliniCore - Presets clínicos para profissionais não médicos.
-- Execute depois de 015_clinical_encounter_workflow.sql.

insert into public.role_permissions (role, module, action, allowed)
select preset.role, preset.module, preset.action, true
from (
  values
    ('professional'::public.app_role, 'medical_records'::public.permission_module, 'view'::public.permission_action),
    ('professional'::public.app_role, 'medical_records'::public.permission_module, 'create'::public.permission_action),
    ('professional'::public.app_role, 'medical_records'::public.permission_module, 'edit'::public.permission_action),
    ('professional'::public.app_role, 'medical_records'::public.permission_module, 'access_medical_record'::public.permission_action)
) as preset(role, module, action)
where not exists (
  select 1
  from public.role_permissions rp
  where rp.clinic_id is null
    and rp.role = preset.role
    and rp.module = preset.module
    and rp.action = preset.action
    and rp.deleted_at is null
);
