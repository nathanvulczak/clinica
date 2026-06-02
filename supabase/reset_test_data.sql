-- CliniCore - Reset de dados de teste.
-- Use apenas em ambiente de desenvolvimento/teste.
-- Mantém estrutura, planos, catálogo de permissões e role_permissions globais.
-- Remove usuários, clínicas, assinaturas, invoices, auditoria, convites e avatars.
--
-- Importante: isto não apaga clientes/assinaturas no painel da Stripe.
-- Para um teste 100% limpo, cancele/remova também os clientes de teste na Stripe
-- ou use um novo e-mail de teste.

begin;

delete from storage.objects
where bucket_id = 'avatars';

delete from public.member_permissions;
delete from public.clinic_invitations;
delete from public.clinic_members;
delete from public.audit_logs;
delete from public.billing_events;
delete from public.invoices;
delete from public.subscriptions;
delete from public.clinics;
delete from public.profiles;
delete from auth.users;

commit;
