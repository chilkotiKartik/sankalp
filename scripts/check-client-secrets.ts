/**
 * Fails if anything secret-looking ended up in the browser bundle.
 * Run after `npm run build`: `npm run check:secrets`
 */
import 'dotenv/config';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT_DIR = join(process.cwd(), 'apps/web/.next/static');
const SECRET_ENV = [
  'JWT_SECRET',
  'DATA_ENCRYPTION_KEY',
  'ELEVENLABS_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_MAPS_API_KEY',
  'DATABASE_URL',
  'ADMIN_ACCESS_KEY',
];
const PATTERNS: [string, RegExp][] = [
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{10,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['Postgres URL with password', /postgres(?:ql)?:\/\/[^:\s"']+:[^@\s"']+@/],
  ['ElevenLabs header', /xi-api-key/],
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let files: string[];
try {
  files = walk(CLIENT_DIR).filter((f) => /\.(js|css|json|html)$/.test(f));
} catch {
  console.error(`No client build found at ${CLIENT_DIR}. Run "npm run build" first.`);
  process.exit(1);
}

const problems: string[] = [];
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const [label, re] of PATTERNS) if (re.test(content)) problems.push(`${label} pattern in ${file}`);
  for (const name of SECRET_ENV) {
    const value = process.env[name];
    if (value && value.length >= 8 && content.includes(value)) problems.push(`Value of ${name} found in ${file}`);
  }
}

if (problems.length) {
  console.error(`Secret check failed:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`Secret check passed (${files.length} client files scanned).`);
