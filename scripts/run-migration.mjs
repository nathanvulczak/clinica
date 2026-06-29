import crypto from "node:crypto";
import path from "node:path";
import { createDatabaseClient, readSqlFile } from "./database-utils.mjs";

const migrationPath = process.argv[2];
const apply = process.argv.includes("--apply");

if (!migrationPath) {
  throw new Error("Uso: node scripts/run-migration.mjs <migration.sql> [--apply]");
}

const sql = readSqlFile(migrationPath);
const checksum = crypto.createHash("sha256").update(sql).digest("hex");
const client = createDatabaseClient();

await client.connect();
try {
  await client.query("begin");
  await client.query(sql);
  await client.query(
    `insert into public.app_migration_history (
       migration_name, description, checksum, source, notes
     ) values ($3, 'Migration executada pelo pipeline do projeto.', $1, $2, 'Registro automático.')
     on conflict (migration_name) do update
     set checksum = excluded.checksum,
         source = excluded.source,
         applied_at = case when $2 = 'cli_apply' then now() else public.app_migration_history.applied_at end`,
    [checksum, apply ? "cli_apply" : "cli_validation", path.basename(migrationPath)],
  );
  if (apply) {
    await client.query("commit");
    console.log(`Migration aplicada: ${migrationPath} (${checksum.slice(0, 12)})`);
  } else {
    await client.query("rollback");
    console.log(`Migration validada e revertida: ${migrationPath} (${checksum.slice(0, 12)})`);
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
