# Qualidade, Segurança e Migrations

## Portas de qualidade

Toda entrega deve passar por:

```bash
npm run lint
npm run typecheck
npm run build
```

O workflow `.github/workflows/quality.yml` executa essas etapas em pushes para
`main` e em pull requests.

## Migrations

1. Crie uma migration numerada e idempotente em `supabase/migrations`.
2. Valide em uma transação que será revertida:

```bash
node scripts/run-migration.mjs supabase/migrations/NNN_nome.sql
```

3. Execute os testes SQL.
4. Aplique somente depois das validações:

```bash
node scripts/run-migration.mjs supabase/migrations/NNN_nome.sql --apply
```

O executor registra nome, checksum, origem e data em
`public.app_migration_history`. Nunca altere uma migration já publicada sem
revalidar o checksum e confirmar que ela permanece idempotente.

## Testes do banco

```bash
$env:ALLOW_DATABASE_TESTS="true"
npm run test:database
npm run db:health
```

Os testes usam rollback e cobrem RLS, permissões, transições clínicas,
prontuário, pré-consulta, baixa financeira e ledger. O health check confirma
RLS em todas as tabelas públicas, histórico de migrations, funções
administrativas restritas e ausência de pagamentos sem ledger.

## Transações críticas

- `save_nursing_assessment_transaction`: ficha e avanço da pré-consulta.
- `save_medical_record_transaction`: prontuário e conclusão do atendimento.
- `create_financial_payment_transaction`: pagamento, saldo, evento e ledger.

Essas operações são atômicas. Qualquer falha reverte o conjunto inteiro.

## Segredos e acesso

- Chaves públicas podem ser usadas no navegador somente quando começam com
  `NEXT_PUBLIC_`.
- `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e
  `SUPABASE_DB_URL` existem apenas no servidor e na Vercel.
- Segredos expostos em chat, log ou commit devem ser rotacionados.
- A service role não substitui autorização: ações administrativas validam o
  usuário responsável e a permissão da clínica antes da gravação.

## Auditoria

O banco preserva logs técnicos e a aplicação registra eventos humanos com
contexto. A interface remove duplicações técnicas próximas sem apagar a trilha
bruta, mantendo valores anteriores, novos valores, responsável e horário.
