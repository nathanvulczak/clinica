# Supabase

## Ordem das migrations

Execute os arquivos uma única vez e na ordem numérica:

1. `001_initial_enterprise_foundation.sql`
2. `002_clinic_context_members_foundation.sql`
3. `003_billing_profile_hardening.sql`
4. `004_clinic_creation_policy_fix.sql`
5. `005_audit_profile_members_storage.sql`
6. `006_audit_visibility_and_performance.sql`
7. `007_repair_billing_reference_data.sql`
8. `008_schedule_foundation.sql`
9. `009_registration_catalog.sql`
10. `010_professional_registration.sql`
11. `011_member_invite_access.sql`
12. `012_schedule_operations_security.sql`
13. `013_rbac_module_access_hardening.sql`
14. `014_nursing_permission_module.sql`
15. `015_clinical_encounter_workflow.sql`
16. `016_clinical_role_presets.sql`
17. `017_repair_missing_clinical_encounters.sql`
18. `018_nursing_assessments.sql`
19. `019_nursing_module_preferences.sql`
20. `020_medical_records_module.sql`
21. `021_medical_records_documents_lgpd.sql`
22. `022_medical_records_polish.sql`
23. `023_financial_module.sql`
24. `024_financial_reconciliation.sql`
25. `025_financial_enterprise_foundation.sql`
26. `026_financial_payables_documents.sql`
27. `027_financial_commissions_bank_imports.sql`
28. `028_financial_monthly_close_realtime.sql`
29. `029_commission_settlements_clinic_branding.sql`
30. `030_permission_backup_dashboard_alignment.sql`
31. `031_role_permissions_unique_active.sql`
32. `032_documents_inventory_enums.sql`
33. `033_documents_inventory_operations.sql`
34. `034_security_transactions_quality.sql`
35. `035_clinical_encounter_routing_integrity.sql`
36. `036_schedule_dashboard_experience.sql`
37. `037_intelligent_document_issuance.sql`
38. `038_advanced_specialty_clinical_forms.sql`
39. `039_diagnostics_insurance_permission_modules.sql`
40. `040_diagnostics_tiss_foundation.sql`
41. `041_company_registration_profiles.sql`
42. `042_document_editor_page_settings.sql`
43. `043_normalize_document_template_content.sql`
44. `044_specialty_immersion_packs.sql`
45. `045_diagnostic_requests_attachments.sql`
46. `046_clinical_protocol_engine.sql`
47. `047_compliance_governance.sql`
48. `048_reconcile_migration_history.sql`
49. `049_reconcile_rbac_catalog.sql`
50. `050_platform_roles.sql`
51. `051_platform_control_and_clinical_provenance.sql`
52. `052_clinical_timeline_backfill.sql`
53. `053_platform_owner_console.sql`
54. `054_platform_user_controls.sql`
55. `055_secure_invitation_lifecycle.sql`
56. `056_owner_only_platform_console.sql`
57. `057_remove_raw_invitation_tokens.sql`
58. `058_audit_expired_invitations.sql`

As execuções são registradas em `app_migration_history`. Use os scripts do
projeto para validar e aplicar uma migration com checksum, sem colar SQL
manualmente em produção.

## Migration 012

Esta migration:

- restringe profissionais aos próprios compromissos também no RLS;
- mantém visão ampla para quem possui `schedule.manage`;
- valida transições do fluxo operacional no PostgreSQL;
- cria remarcação atômica, preservando o compromisso anterior;
- adiciona timestamps do atendimento;
- cria a caixa de saída `appointment_notifications`;
- prepara envio por e-mail e futura integração oficial com WhatsApp.

## Migration 013

Esta migration:

- remove o acesso administrativo implícito de `clinic_admin`;
- aplica presets objetivos para cada papel da clínica;
- impede médico, enfermagem e recepção de acessar assinatura e auditoria por padrão;
- separa consulta de billing de gerenciamento do plano;
- faz permissões individuais de negação prevalecerem sobre o preset do papel.

## Migrations 014 e 015

Execute estes dois arquivos separadamente e na ordem indicada. A separação é
necessária porque o PostgreSQL precisa confirmar o novo valor do enum de
permissões antes de utilizá-lo.

Estas migrations:

- criam a permissão independente do módulo de Enfermagem;
- configuram pré-consulta por clínica e por serviço;
- geram um encontro clínico único para cada consulta após a chegada;
- mantêm eventos imutáveis para encaminhamento e avanço assistencial;
- permitem corrigir o encaminhamento somente antes do início clínico e com motivo;
- restringem enfermagem, profissionais e visão administrativa por RLS;
- preservam consultas já em andamento por meio de backfill.

## Testes de banco

Os arquivos em `tests/*.test.sql` usam pgTAP e executam tudo dentro de
transações com `rollback`. Eles validam:

- visão ampla do proprietário;
- leitura e edição permitidas ao médico;
- isolamento da agenda do médico;
- visão ampla da recepção;
- bloqueio da agenda clínica para o perfil financeiro;
- bloqueio de assinatura e auditoria para o médico;
- consulta de assinatura, sem gestão, para o financeiro;
- bloqueio de transições inválidas;
- bloqueio total para usuário sem vínculo.
- privilégios de funções administrativas e policies de anexos clínicos;
- integridade entre pagamentos confirmados e ledger;
- transações completas de pré-consulta, prontuário e baixa financeira.

Com Supabase CLI:

```bash
supabase test db
```

Com a conexão de banco configurada localmente:

```bash
$env:ALLOW_DATABASE_TESTS="true"
npm run test:database
```

No SQL Editor, o teste também pode ser executado manualmente em um projeto de
desenvolvimento. Nunca execute testes com fixtures em produção.

## Configuração do Auth

- Habilite autenticação por e-mail e senha.
- Configure `Site URL` com a URL de produção.
- Adicione URLs locais e de produção em `Redirect URLs`.
- Aplique o template de convite documentado em `docs/supabase-invite-template.md`.

## Integrações

- Stripe webhook: `/api/stripe/webhook`
- Confirmação pública do paciente: `/confirmar-consulta/[token]`
- E-mail de agenda: configure `RESEND_API_KEY` e `RESEND_FROM_EMAIL`

As tabelas operacionais utilizam `clinic_id`. `profiles`, `clinic_plans` e
partes do billing permanecem globais por design para separar autenticação,
assinatura e vínculo com clínicas.
