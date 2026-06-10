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

## Testes de banco

O arquivo `tests/001_schedule_rls.test.sql` usa pgTAP e executa tudo dentro de
uma transação com `rollback`. Ele valida:

- visão ampla do proprietário;
- leitura e edição permitidas ao médico;
- isolamento da agenda do médico;
- visão ampla da recepção;
- visão restrita do perfil financeiro;
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
