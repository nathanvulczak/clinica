-- CliniCore - permission namespaces for diagnostics and insurance/TISS.
-- Enum values must be committed before they are referenced by policies.

alter type public.permission_module add value if not exists 'diagnostics';
alter type public.permission_module add value if not exists 'insurance';

insert into public.app_migration_history (migration_name, description, source, notes)
values (
  '039_diagnostics_insurance_permission_modules.sql',
  'Namespaces de permissao para exames, diagnostico, convenios e TISS.',
  'supabase_sql_editor',
  'Separacao RBAC dos novos modulos assistencial e faturamento de saude suplementar.'
)
on conflict (migration_name) do nothing;
