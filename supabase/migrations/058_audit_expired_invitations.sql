-- CliniCore - Auditoria de expiracao automatica de convites.

create or replace function public.expire_clinic_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation record;
  affected integer := 0;
begin
  for invitation in
    select id, clinic_id, email, status, expires_at
    from public.clinic_invitations
    where status in ('pending', 'sent')
      and expires_at <= now()
      and deleted_at is null
  loop
    update public.clinic_invitations
    set status = 'expired',
        updated_at = now(),
        failure_reason = coalesce(failure_reason, 'O prazo de validade do convite foi atingido.')
    where id = invitation.id
      and status in ('pending', 'sent')
      and expires_at <= now();

    if found then
      affected := affected + 1;
      insert into public.audit_logs (
        clinic_id,
        user_id,
        action_type,
        module,
        record_table,
        record_id,
        old_values,
        new_values,
        level,
        notes
      )
      values (
        invitation.clinic_id,
        null,
        'member_invite_expired',
        'members'::public.permission_module,
        'clinic_invitations',
        invitation.id,
        jsonb_build_object('status', invitation.status, 'expires_at', invitation.expires_at),
        jsonb_build_object('status', 'expired'),
        'security'::public.audit_level,
        'Convite expirado automaticamente pelo sistema.'
      );
    end if;
  end loop;

  return affected;
end;
$$;

revoke all on function public.expire_clinic_invitations() from public, anon, authenticated;
grant execute on function public.expire_clinic_invitations() to service_role;

insert into public.app_migration_history(migration_name, description, source, notes)
values (
  '058_audit_expired_invitations.sql',
  'Registra na auditoria a expiracao automatica de convites.',
  'supabase_sql_editor',
  'A expiracao permanece sem usuario responsavel e e identificada como evento automatico de seguranca.'
)
on conflict (migration_name) do nothing;
