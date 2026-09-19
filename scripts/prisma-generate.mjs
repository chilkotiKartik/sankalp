#!/usr/bin/env node
// Generates the Prisma client. Client generation doesn't need the native schema
// engine, but the Prisma CLI tries to download it eagerly. On networks where
// binaries.prisma.sh is blocked we retry with a stub so installs don't fail.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(env) {
  return spawnSync('npx', ['prisma', 'generate'], { stdio: 'pipe', encoding: 'utf8', env: { ...process.env, ...env } });
}

let result = run({});
if (result.status !== 0 && /binaries\.prisma\.sh|Failed to fetch/i.test(`${result.stdout}${result.stderr}`)) {
  const dir = mkdtempSync(join(tmpdir(), 'prisma-stub-'));
  const stub = join(dir, 'schema-engine-stub');
  writeFileSync(stub, '#!/bin/sh\necho "schema engine unavailable" >&2\nexit 1\n');
  chmodSync(stub, 0o755);
  console.warn('[prisma] Engine download blocked — generating client without the schema engine.');
  result = run({ PRISMA_SCHEMA_ENGINE_BINARY: stub });
}

process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
