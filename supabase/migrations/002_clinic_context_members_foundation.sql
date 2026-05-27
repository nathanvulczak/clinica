-- Fase 2 - Contexto ativo de clínica, membros e preferências do usuário.

alter table public.profiles
add column if not exists app_preferences jsonb not null default '{}'::jsonb;

create index if not exists idx_profiles_cpf_active
on public.profiles(cpf)
where deleted_at is null and cpf is not null;

create index if not exists idx_clinic_invitations_status
on public.clinic_invitations(clinic_id, status, created_at desc)
where deleted_at is null;

create or replace function public.repair_missing_profile(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_user record;
begin
  select *
  into auth_user
  from auth.users
  where id = target_user_id;

  if auth_user.id is null then
    raise exception 'auth.users % not found', target_user_id;
  end if;

  insert into public.profiles (id, full_name, cpf, phone, email, created_by, updated_by)
  values (
    auth_user.id,
    coalesce(auth_user.raw_user_meta_data ->> 'full_name', split_part(auth_user.email, '@', 1)),
    nullif(auth_user.raw_user_meta_data ->> 'cpf', ''),
    nullif(auth_user.raw_user_meta_data ->> 'phone', ''),
    auth_user.email,
    auth_user.id,
    auth_user.id
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        cpf = excluded.cpf,
        phone = excluded.phone,
        email = excluded.email,
        updated_at = now();
end;
$$;

create or replace function public.repair_all_missing_profiles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  repaired_count integer := 0;
  auth_user record;
begin
  for auth_user in
    select au.*
    from auth.users au
    left join public.profiles p on p.id = au.id
    where p.id is null
  loop
    perform public.repair_missing_profile(auth_user.id);
    repaired_count := repaired_count + 1;
  end loop;

  return repaired_count;
end;
$$;

-- Se algum cadastro foi feito antes da trigger public.handle_new_user existir, isto cria os profiles faltantes.
select public.repair_all_missing_profiles();
