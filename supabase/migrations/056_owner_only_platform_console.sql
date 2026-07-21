-- CliniCore - O console da plataforma pertence somente ao proprietario do SaaS.

update public.platform_operators
set status = 'revoked'
where role <> 'owner'
  and status <> 'revoked';

create or replace function public.enforce_platform_owner_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> 'owner' then
    raise exception 'platform_console_owner_only';
  end if;

  if new.status = 'active' and exists (
    select 1
    from public.platform_operators existing
    where existing.user_id <> new.user_id
      and existing.role = 'owner'
      and existing.status = 'active'
  ) then
    raise exception 'platform_console_single_owner';
  end if;

  return new;
end;
$$;

drop trigger if exists platform_owner_only_guard on public.platform_operators;
create trigger platform_owner_only_guard
before insert or update on public.platform_operators
for each row execute function public.enforce_platform_owner_only();

create or replace function public.platform_operator_can(
  required_scope text,
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
    from public.platform_operators operator
    where operator.user_id = user_uuid
      and operator.role = 'owner'
      and operator.status = 'active'
  );
$$;

insert into public.app_migration_history(migration_name, description, source, notes)
values (
  '056_owner_only_platform_console.sql',
  'Console tecnico exclusivo do proprietario unico do SaaS.',
  'supabase_sql_editor',
  'Operadores secundarios foram revogados e novos papeis diferentes de owner sao bloqueados.'
)
on conflict (migration_name) do nothing;
