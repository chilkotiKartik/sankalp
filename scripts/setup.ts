/**
 * One-command setup. Writes .env with freshly generated secrets, keeping any values
 * already there, then prepares the database if one is reachable.
 *
 *   npm run setup
 *
 * Safe to run more than once: existing values are never overwritten.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ENV_PATH = resolve(ROOT, '.env');
const EXAMPLE_PATH = resolve(ROOT, '.env.example');

const dim = (s: string) => `\u001b[2m${s}\u001b[0m`;
const bold = (s: string) => `\u001b[1m${s}\u001b[0m`;
const green = (s: string) => `\u001b[32m${s}\u001b[0m`;
const yellow = (s: string) => `\u001b[33m${s}\u001b[0m`;

function parseEnv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return out;
}

/** Rewrites `KEY=` lines in place so the file keeps its comments and ordering. */
function applyValues(template: string, values: Map<string, string>): string {
  const seen = new Set<string>();
  const lines = template.split('\n').map((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) return line;
    const [, key] = match;
    const value = values.get(key!);
    if (value === undefined) return line;
    seen.add(key!);
    return `${key}=${value}`;
  });
  const extra = [...values.entries()].filter(([k]) => !seen.has(k));
  if (extra.length > 0) {
    lines.push('', '# Added by npm run setup', ...extra.map(([k, v]) => `${k}=${v}`));
  }
  return lines.join('\n');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const nonInteractive = args.has('--yes') || args.has('-y') || !process.stdin.isTTY;

  console.log(bold('\n  Sanjeevani Voice — setup\n'));

  if (!existsSync(EXAMPLE_PATH)) {
    console.error('  .env.example is missing — run this from the project root.');
    process.exit(1);
  }
  const template = readFileSync(EXAMPLE_PATH, 'utf8');
  const existing = existsSync(ENV_PATH) ? parseEnv(readFileSync(ENV_PATH, 'utf8')) : new Map<string, string>();
  const values = new Map(existing);

  // Secrets: generate once, then leave alone. Rotating them would orphan stored data.
  if (!values.get('JWT_SECRET')) {
    values.set('JWT_SECRET', randomBytes(48).toString('base64url'));
    console.log(`  ${green('+')} generated JWT_SECRET`);
  }
  if (!values.get('DATA_ENCRYPTION_KEY')) {
    values.set('DATA_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
    console.log(`  ${green('+')} generated DATA_ENCRYPTION_KEY`);
  }

  // Ask for a Gemini key — the one credential that turns the whole app on.
  if (!values.get('GEMINI_API_KEY') && !values.get('GOOGLE_API_KEY') && !nonInteractive) {
    console.log(dim('\n  A Gemini API key enables natural understanding and a real voice.'));
    console.log(dim('  Get one free at https://aistudio.google.com/apikey — or press Enter to skip.'));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const key = (await rl.question('\n  Gemini API key (optional): ')).trim();
    rl.close();
    if (key) {
      values.set('GEMINI_API_KEY', key);
      console.log(`  ${green('+')} saved GEMINI_API_KEY`);
    } else {
      console.log(dim('  Skipped — the app still runs on its built-in rules and the browser voice.'));
    }
  }

  writeFileSync(ENV_PATH, applyValues(template, values), 'utf8');
  console.log(`\n  ${green('✓')} wrote .env`);

  // Database is optional: without it, demo mode keeps everything in memory.
  const databaseUrl = values.get('DATABASE_URL');
  if (databaseUrl) {
    console.log(dim('\n  Preparing the database…'));
    const migrate = spawnSync('npx', ['tsx', 'scripts/migrate.ts'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl } });
    if (migrate.status === 0) {
      spawnSync('npx', ['tsx', 'prisma/seed.ts'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl } });
      console.log(`  ${green('✓')} database ready`);
    } else {
      console.log(`  ${yellow('!')} could not reach the database — starting in memory-only demo mode.`);
      console.log(dim('    Start PostgreSQL and run "npm run db:migrate && npm run db:seed" when you want history to persist.'));
    }
  } else {
    console.log(dim('\n  No DATABASE_URL set — conversations will be kept in memory only.'));
    console.log(dim('  That is fine for trying it out; add one later for history that survives a restart.'));
  }

  console.log(bold('\n  Ready. Start it with:\n'));
  console.log('    npm run dev\n');
  console.log(dim('  Then open http://localhost:3000\n'));
}

main().catch((error: unknown) => {
  console.error('\n  Setup failed:', (error as Error).message);
  process.exit(1);
});
