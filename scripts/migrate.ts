/**
 * Applies committed Prisma migrations.
 *
 * Uses `prisma migrate deploy` when the Prisma schema engine is available. If it can't be
 * downloaded (locked-down networks), falls back to applying the same SQL files directly and
 * records them in `_prisma_migrations` exactly as Prisma does, so both paths stay compatible.
 *
 *   tsx scripts/migrate.ts            apply pending migrations
 *   tsx scripts/migrate.ts --reset    drop the schema first (development only)
 *   tsx scripts/migrate.ts --sql      force the SQL runner
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');
const args = new Set(process.argv.slice(2));
const url = process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and set it.');
  process.exit(1);
}

async function reset(client: pg.Client) {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset a production database.');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  console.log('Schema reset.');
}

function tryPrismaDeploy(): boolean {
  const res = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'pipe', encoding: 'utf8' });
  const output = `${res.stdout}${res.stderr}`;
  if (res.status === 0) {
    process.stdout.write(res.stdout);
    return true;
  }
  if (/binaries\.prisma\.sh|Failed to fetch|schema engine/i.test(output)) {
    console.warn('Prisma schema engine unavailable — using the built-in SQL migration runner.');
    return false;
  }
  process.stderr.write(output);
  process.exit(res.status ?? 1);
}

async function sqlRunner(client: pg.Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );`);
  const applied = new Set(
    (await client.query<{ migration_name: string }>(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    )).rows.map((r) => r.migration_name),
  );
  const names = readdirSync(MIGRATIONS_DIR)
    .filter((n) => statSync(join(MIGRATIONS_DIR, n)).isDirectory())
    .sort();

  let count = 0;
  for (const name of names) {
    if (applied.has(name)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const id = randomUUID();
    await client.query('BEGIN');
    try {
      await client.query(
        'INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at) VALUES ($1, $2, $3, now())',
        [id, checksum, name],
      );
      await client.query(sql);
      await client.query(
        'UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1',
        [id],
      );
      await client.query('COMMIT');
      console.log(`Applied ${name}`);
      count++;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log(count === 0 ? 'Database is up to date.' : `${count} migration(s) applied.`);
}

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (args.has('--reset')) await reset(client);
    if (args.has('--sql') || !tryPrismaDeploy()) await sqlRunner(client);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
