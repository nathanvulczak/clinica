import { createDatabaseClient } from "./database-utils.mjs";

const checks = [
  {
    name: "migrations registradas",
    sql: "select count(*)::integer as value from public.app_migration_history",
    validate: (value) => value >= 34,
  },
  {
    name: "tabelas publicas sem RLS",
    sql: `select count(*)::integer as value
          from pg_tables
          where schemaname = 'public' and rowsecurity = false`,
    validate: (value) => value === 0,
  },
  {
    name: "pagamentos confirmados sem ledger",
    sql: `select count(*)::integer as value
          from public.financial_payments fp
          where fp.status = 'confirmed'
            and fp.deleted_at is null
            and not exists (
              select 1 from public.financial_ledger_entries fle
              where fle.payment_id = fp.id and fle.source_type = 'payment'
            )`,
    validate: (value) => value === 0,
  },
  {
    name: "funcoes administrativas expostas a authenticated",
    sql: `select count(*)::integer as value
          from (values
            (has_function_privilege('authenticated', 'public.repair_missing_profile(uuid)', 'EXECUTE')),
            (has_function_privilege('authenticated', 'public.repair_all_missing_profiles()', 'EXECUTE'))
          ) as checks(exposed)
          where exposed`,
    validate: (value) => value === 0,
  },
];

const client = createDatabaseClient();
await client.connect();
let failed = false;
try {
  for (const check of checks) {
    const { rows } = await client.query(check.sql);
    const value = Number(rows[0]?.value ?? 0);
    const ok = check.validate(value);
    failed ||= !ok;
    console.log(`${ok ? "OK" : "FAIL"} ${check.name}: ${value}`);
  }
} finally {
  await client.end();
}

if (failed) process.exitCode = 1;
