-- Fase 2.3 - Visibilidade completa da auditoria do próprio usuário e índices de filtros.

drop policy if exists "audit_logs_read_own_security_events" on public.audit_logs;
drop policy if exists "audit_logs_read_own_events" on public.audit_logs;

create policy "audit_logs_read_own_events"
on public.audit_logs for select
to authenticated
using (user_id = auth.uid());

create index if not exists idx_audit_logs_user_action_created
on public.audit_logs(user_id, action_type, created_at desc)
where deleted_at is null;

create index if not exists idx_audit_logs_clinic_filters_created
on public.audit_logs(clinic_id, action_type, module, level, created_at desc)
where deleted_at is null;
