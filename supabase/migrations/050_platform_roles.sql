-- CliniCore - Papéis globais do control plane.
-- Esta migration é isolada porque o PostgreSQL exige commit antes do uso de novos valores enum.

do $$
begin
  if not exists (select 1 from pg_enum where enumtypid = 'public.app_role'::regtype and enumlabel = 'platform_support') then
    alter type public.app_role add value 'platform_support';
  end if;
  if not exists (select 1 from pg_enum where enumtypid = 'public.app_role'::regtype and enumlabel = 'platform_billing') then
    alter type public.app_role add value 'platform_billing';
  end if;
  if not exists (select 1 from pg_enum where enumtypid = 'public.app_role'::regtype and enumlabel = 'platform_security') then
    alter type public.app_role add value 'platform_security';
  end if;
end $$;

insert into public.app_migration_history(migration_name, description, source, notes)
values (
  '050_platform_roles.sql',
  'Papéis globais separados para administração, suporte, billing e segurança da plataforma.',
  'pipeline',
  'Os papéis não recebem permissões de clínica por padrão.'
)
on conflict (migration_name) do nothing;
