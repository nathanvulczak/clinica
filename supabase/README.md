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

Não execute novamente migrations já aplicadas. Para conferir o controle do
ambiente hospedado, registre a execução em uma planilha de implantação ou adote
o Supabase CLI antes da próxima entrega de produção.

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

O arquivo `tests/001_schedule_rls.test.sql` usa pgTAP e executa tudo dentro de
uma transação com `rollback`. Ele valida:

- visão ampla do proprietário;
- leitura e edição permitidas ao médico;
- isolamento da agenda do médico;
- visão ampla da recepção;
- bloqueio da agenda clínica para o perfil financeiro;
- bloqueio de assinatura e auditoria para o médico;
- consulta de assinatura, sem gestão, para o financeiro;
- bloqueio de transições inválidas;
- bloqueio total para usuário sem vínculo.

Com Supabase CLI:

```bash
supabase test db
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
