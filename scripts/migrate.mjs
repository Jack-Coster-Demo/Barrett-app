// Applies any new files in supabase/migrations to the database this deployment uses.
//
// Runs as part of `npm run build`. On a Vercel production deploy it connects with the
// connection string the Supabase integration put in the project's environment, so the
// database that gets migrated is always the one the live app reads from. A failed
// migration fails the build, and the previous deployment stays live.
//
// Everywhere else (local builds, preview deploys) it does nothing, unless you point it
// at a database yourself:  MIGRATE_DATABASE_URL=postgres://... node scripts/migrate.mjs
//
// Applied files are recorded in supabase_migrations.schema_migrations, the same table
// the Supabase CLI uses, so `supabase db push` and this script agree on what has run.

import { readdir, readFile } from "node:fs/promises";
import pg from "pg";

const DIR = new URL("../supabase/migrations/", import.meta.url);
const manual = process.env.MIGRATE_DATABASE_URL;
const production = process.env.VERCEL_ENV === "production";

if (!manual && !production) {
  console.log("migrate: skipped (not a production deploy)");
  process.exit(0);
}

// Session connection first. The pooled one is a fallback and works too, because
// everything below happens inside a single transaction.
const urls = manual ? [manual] : [process.env.POSTGRES_URL_NON_POOLING, process.env.POSTGRES_URL].filter(Boolean);
if (!urls.length) {
  console.error("migrate: no database connection string. Expected POSTGRES_URL_NON_POOLING from the Supabase integration.");
  process.exit(1);
}

async function connect(raw) {
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  // Supabase serves a certificate signed by its own CA, which Node does not know.
  // The link is still encrypted; sslmode is dropped so pg does not insist on the chain.
  url.searchParams.delete("sslmode");
  const client = new pg.Client({
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  return client;
}

async function main() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  const migrations = files.map((file) => {
    const m = /^(\d+)_(.+)\.sql$/.exec(file);
    if (!m) throw new Error(`${file} is not named like 0003_what_it_does.sql`);
    return { file, version: m[1], name: m[2] };
  });

  let client;
  let lastError;
  for (const raw of urls) {
    try {
      client = await connect(raw);
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!client) throw new Error(`could not connect to the database: ${lastError?.message}`);

  const { rows: where } = await client.query("select current_database() as db, inet_server_addr() as host");
  console.log(`migrate: connected to ${where[0].db}${where[0].host ? ` at ${where[0].host}` : ""}`);

  try {
    await client.query("begin");
    // Two deploys building at once take turns.
    await client.query("select pg_advisory_xact_lock(727274)");
    await client.query("create schema if not exists supabase_migrations");
    await client.query(
      "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)",
    );
    const { rows } = await client.query("select version from supabase_migrations.schema_migrations");
    const done = new Set(rows.map((r) => r.version));
    const pending = migrations.filter((m) => !done.has(m.version));

    for (const m of pending) {
      console.log(`migrate: applying ${m.file}`);
      const sql = await readFile(new URL(m.file, DIR), "utf8");
      try {
        await client.query(sql);
      } catch (err) {
        throw new Error(`${m.file} failed: ${err.message}`);
      }
      await client.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)", [
        m.version,
        m.name,
        [sql],
      ]);
    }
    await client.query("commit");
    console.log(pending.length ? `migrate: applied ${pending.length} migration(s)` : `migrate: database is up to date (${migrations.length} applied)`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`migrate: ${err.message}`);
  console.error("migrate: nothing was changed. Fix the migration and deploy again.");
  process.exit(1);
});
