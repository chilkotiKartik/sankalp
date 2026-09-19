/**
 * Builds the API into a Vercel deployment, using the Build Output API (v3).
 *
 * ## Why this exists instead of letting the platform detect things
 *
 * The workspace packages ship TypeScript source rather than compiled JavaScript —
 * that is what lets the web app and the API share one copy of the safety rules with
 * no build step between them. It also means no framework preset can be pointed at
 * this directory and be expected to work out what to compile.
 *
 * So nothing is detected. `tsup` bundles the API exactly as it already does for a
 * normal server build — same config, same `noExternal` that pulls every
 * `@sanjeevani/*` package into the output — and this script places that bundle into
 * the directory layout the platform reads. What gets deployed is therefore the same
 * artefact that `npm run build` produces locally, which is the point: there is no
 * separate "production build" that could behave differently from the one that was
 * tested.
 *
 * Output:
 *
 *   .vercel/output/
 *     config.json                     routing + the retention schedule
 *     functions/index.func/
 *       index.mjs                     the bundled API
 *       .vc-config.json               runtime, entrypoint, limits
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(root, 'apps/api');
const outRoot = resolve(root, '.vercel/output');
const funcDir = resolve(outRoot, 'functions/index.func');

/** Node major version the function runs on. Must be one the platform offers. */
const RUNTIME = 'nodejs22.x';

/**
 * Seconds a single request may take. Voice turns are the long pole: speech in,
 * a model call, speech out. The ceiling on the lowest plan is 60.
 */
const MAX_DURATION = 60;

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit', env: process.env });
}

console.log('· bundling the API with tsup');
run('npm', ['run', 'build'], apiDir);

const distDir = resolve(apiDir, 'dist');

console.log('· assembling .vercel/output');
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(funcDir, { recursive: true });

/*
 * The whole bundle, not just its entry file. tsup splits shared code into chunks —
 * including the Prisma query compiler, which is a multi-megabyte WebAssembly blob —
 * and the entry is a few kilobytes that import them. Copying the entry alone
 * produces a function that builds cleanly and then fails on its first request,
 * which is the worst kind of broken.
 *
 * Source maps are deliberately left behind: they would put the entire server
 * source, including the shape of the safety rules, one download away.
 */
let bytes = 0;
for (const name of readdirSync(distDir)) {
  if (!name.endsWith('.js') || name.endsWith('.map')) continue;
  // The port-binding entry shares the same chunks but has no business here: it
  // starts a server the moment it is imported.
  if (name === 'index.js') continue;
  cpSync(resolve(distDir, name), resolve(funcDir, name));
  bytes += statSync(resolve(distDir, name)).size;
}

// The bundle is ESM in `.js` files, so the function's own directory has to say so.
writeFileSync(resolve(funcDir, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`);

writeFileSync(
  resolve(funcDir, '.vc-config.json'),
  `${JSON.stringify(
    {
      runtime: RUNTIME,
      handler: 'serverless.js',
      launcherType: 'Nodejs',
      // The app parses its own bodies (JSON with a 32 KB cap, multipart for audio).
      // The platform's helpers would parse them first and break multipart uploads.
      shouldAddHelpers: false,
      supportsResponseStreaming: false,
      maxDuration: MAX_DURATION,
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  resolve(outRoot, 'config.json'),
  `${JSON.stringify(
    {
      version: 3,
      // One function, every path. Express owns its own routing table, including the
      // 404 — so the platform must not answer for paths Express would have handled.
      routes: [{ src: '/(.*)', dest: '/index' }],
      /*
       * Retention is a promise the app makes to the people using it, and on a host
       * with no long-lived process the only thing that can keep it is the platform
       * scheduler. Daily rather than hourly because that is what every plan allows,
       * and because a conversation kept a few hours past its expiry is a far smaller
       * problem than a sweep that silently never runs.
       *
       * 20:30 UTC is 02:00 in India — the quietest hour for the people this serves.
       */
      crons: [{ path: '/internal/purge', schedule: '30 20 * * *' }],
    },
    null,
    2,
  )}\n`,
);

console.log(`✓ API function ready — ${(bytes / 1024 / 1024).toFixed(1)} MB, ${RUNTIME}, max ${MAX_DURATION}s`);
