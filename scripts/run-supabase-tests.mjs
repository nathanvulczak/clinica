import fs from "node:fs";
import path from "node:path";
import { createDatabaseClient, readSqlFile } from "./database-utils.mjs";

if (process.env.ALLOW_DATABASE_TESTS !== "true" && !process.argv.includes("--allow")) {
  throw new Error("Defina ALLOW_DATABASE_TESTS=true para executar testes SQL transacionais.");
}

const testsDirectory = path.resolve(process.cwd(), "supabase/tests");
const testFiles = fs
  .readdirSync(testsDirectory)
  .filter((file) => file.endsWith(".test.sql"))
  .sort();

const client = createDatabaseClient();
await client.connect();
try {
  for (const file of testFiles) {
    const result = await client.query(readSqlFile(path.join("supabase/tests", file)));
    const rows = Array.isArray(result) ? result.flatMap((item) => item.rows) : result.rows;
    const failures = rows.filter((row) => {
      const value = String(Object.values(row)[0] ?? "");
      return value.startsWith("not ok");
    });
    if (failures.length) throw new Error(`${file}: ${failures.map((row) => Object.values(row)[0]).join("; ")}`);
    console.log(`OK ${file}`);
  }
} finally {
  await client.end();
}
