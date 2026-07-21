-- CliniCore - Remove tokens brutos de convites legados.

-- Preserva somente uma impressao irreversivel antes de invalidar o token legado.
update public.clinic_invitations
set token_hash = encode(digest(token, 'sha256'), 'hex')
where token is not null
  and (token_hash is null or token_hash = '');

alter table public.clinic_invitations
  alter column token drop default,
  alter column token drop not null;

update public.clinic_invitations
set token = null
where token is not null;

insert into public.app_migration_history(migration_name, description, source, notes)
values (
  '057_remove_raw_invitation_tokens.sql',
  'Remove tokens brutos de convites legados e invalida links antigos.',
  'supabase_sql_editor',
  'O novo fluxo usa o convite do Supabase Auth e o identificador da invitacao; nenhum token bruto e armazenado.'
)
on conflict (migration_name) do nothing;
