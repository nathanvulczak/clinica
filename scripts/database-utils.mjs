import fs from "node:fs";
import path from "node:path";
import pg from "pg";

export function loadLocalEnvironment() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

export function resolveDatabaseUrl() {
  loadLocalEnvironment();
  const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Configure SUPABASE_DB_URL ou DATABASE_URL antes de acessar o banco.");
  }
  return databaseUrl;
}

export function createDatabaseClient() {
  return new pg.Client({
    connectionString: resolveDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60_000,
    query_timeout: 60_000,
  });
}

export function readSqlFile(relativePath) {
  const filePath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`Arquivo SQL não encontrado: ${relativePath}`);
  return fs.readFileSync(filePath, "utf8");
}
