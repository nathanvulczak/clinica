-- CliniCore - Reconciliacao dos presets RBAC usados pelo RLS.
-- Mantem permissoes individuais da clinica acima do preset global.

with preset(role, module, action) as (
  values
    ('clinic_admin'::public.app_role, 'clinics'::public.permission_module, 'view'::public.permission_action),
    ('clinic_admin', 'clinics', 'edit'), ('clinic_admin', 'members', 'view'), ('clinic_admin', 'members', 'create'), ('clinic_admin', 'members', 'edit'), ('clinic_admin', 'members', 'manage'),
    ('clinic_admin', 'permissions', 'view'), ('clinic_admin', 'permissions', 'manage'), ('clinic_admin', 'audit', 'view'), ('clinic_admin', 'audit', 'export'),
    ('clinic_admin', 'patients', 'view'), ('clinic_admin', 'patients', 'create'), ('clinic_admin', 'patients', 'edit'), ('clinic_admin', 'patients', 'delete'), ('clinic_admin', 'patients', 'export'),
    ('clinic_admin', 'schedule', 'view'), ('clinic_admin', 'schedule', 'create'), ('clinic_admin', 'schedule', 'edit'), ('clinic_admin', 'schedule', 'delete'), ('clinic_admin', 'schedule', 'manage'), ('clinic_admin', 'schedule', 'export'),
    ('clinic_admin', 'nursing', 'view'), ('clinic_admin', 'financial', 'view'), ('clinic_admin', 'financial', 'manage'), ('clinic_admin', 'financial', 'approve'),
    ('clinic_admin', 'documents', 'view'), ('clinic_admin', 'documents', 'create'), ('clinic_admin', 'documents', 'edit'), ('clinic_admin', 'documents', 'manage'), ('clinic_admin', 'documents', 'export'),
    ('clinic_admin', 'inventory', 'view'), ('clinic_admin', 'inventory', 'create'), ('clinic_admin', 'inventory', 'edit'), ('clinic_admin', 'inventory', 'manage'), ('clinic_admin', 'inventory', 'export'),
    ('clinic_admin', 'diagnostics', 'view'), ('clinic_admin', 'diagnostics', 'manage'), ('clinic_admin', 'diagnostics', 'export'),
    ('clinic_admin', 'insurance', 'view'), ('clinic_admin', 'insurance', 'manage'), ('clinic_admin', 'insurance', 'approve'), ('clinic_admin', 'insurance', 'export'),
    ('clinic_admin', 'reports', 'view'), ('clinic_admin', 'reports', 'export'),

    ('doctor', 'patients', 'view'), ('doctor', 'medical_records', 'view'), ('doctor', 'medical_records', 'create'), ('doctor', 'medical_records', 'edit'), ('doctor', 'medical_records', 'access_medical_record'), ('doctor', 'nursing', 'view'), ('doctor', 'inventory', 'view'), ('doctor', 'inventory', 'create'), ('doctor', 'schedule', 'view'), ('doctor', 'schedule', 'edit'), ('doctor', 'diagnostics', 'view'), ('doctor', 'diagnostics', 'create'), ('doctor', 'diagnostics', 'edit'), ('doctor', 'diagnostics', 'approve'), ('doctor', 'diagnostics', 'export'),
    ('nurse', 'patients', 'view'), ('nurse', 'patients', 'edit'), ('nurse', 'nursing', 'view'), ('nurse', 'nursing', 'create'), ('nurse', 'nursing', 'edit'), ('nurse', 'inventory', 'view'), ('nurse', 'inventory', 'create'), ('nurse', 'medical_records', 'view'), ('nurse', 'medical_records', 'access_medical_record'), ('nurse', 'schedule', 'view'), ('nurse', 'schedule', 'edit'), ('nurse', 'diagnostics', 'view'), ('nurse', 'diagnostics', 'create'), ('nurse', 'diagnostics', 'edit'),
    ('receptionist', 'patients', 'view'), ('receptionist', 'patients', 'create'), ('receptionist', 'patients', 'edit'), ('receptionist', 'patients', 'export'), ('receptionist', 'schedule', 'view'), ('receptionist', 'schedule', 'create'), ('receptionist', 'schedule', 'edit'), ('receptionist', 'schedule', 'manage'), ('receptionist', 'schedule', 'export'), ('receptionist', 'financial', 'create'), ('receptionist', 'diagnostics', 'view'), ('receptionist', 'insurance', 'view'), ('receptionist', 'insurance', 'create'),
    ('financial', 'billing', 'view'), ('financial', 'financial', 'view'), ('financial', 'financial', 'create'), ('financial', 'financial', 'edit'), ('financial', 'financial', 'manage'), ('financial', 'financial', 'approve'), ('financial', 'financial', 'export'), ('financial', 'inventory', 'view'), ('financial', 'inventory', 'create'), ('financial', 'reports', 'view'), ('financial', 'reports', 'export'), ('financial', 'insurance', 'view'), ('financial', 'insurance', 'create'), ('financial', 'insurance', 'edit'), ('financial', 'insurance', 'approve'), ('financial', 'insurance', 'manage'), ('financial', 'insurance', 'export'),
    ('professional', 'patients', 'view'), ('professional', 'medical_records', 'view'), ('professional', 'medical_records', 'create'), ('professional', 'medical_records', 'edit'), ('professional', 'medical_records', 'access_medical_record'), ('professional', 'schedule', 'view'), ('professional', 'schedule', 'edit'), ('professional', 'diagnostics', 'view'), ('professional', 'diagnostics', 'create'), ('professional', 'diagnostics', 'edit'), ('professional', 'diagnostics', 'approve')
)
insert into public.role_permissions (clinic_id, role, module, action, allowed, created_by, updated_by)
select null, preset.role, preset.module, preset.action, true, null, null
from preset
where not exists (
  select 1
  from public.role_permissions current_permission
  where current_permission.clinic_id is null
    and current_permission.role = preset.role
    and current_permission.module = preset.module
    and current_permission.action = preset.action
    and current_permission.deleted_at is null
);

insert into public.app_migration_history (migration_name, description, source, notes)
values (
  '049_reconcile_rbac_catalog.sql',
  'Reconcile os presets globais de permissao usados pelo RLS com os presets da aplicacao.',
  'pipeline',
  'Permissoes individuais e overrides por clinica continuam prevalecendo.'
)
on conflict (migration_name) do nothing;
