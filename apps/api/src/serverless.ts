/**
 * The same API, as a serverless function.
 *
 * ## What this is and is not
 *
 * This is not a second implementation of the API. It builds the identical Express
 * app from the identical container — `createApp(createContainer(...))`, exactly as
 * `index.ts` does. The only difference is what happens after: `index.ts` binds a
 * port and owns the process; this hands the app to a platform that owns the process
 * for it. Every route, every middleware, every safety check is the same object.
 *
 * ## What changes when there is no process to own
 *
 * Three things a long-running server can take for granted are gone here, and each
 * one is handled rather than ignored:
 *
 * 1. **Start-up cost is paid repeatedly.** A cold instance boots the container from
 *    scratch. So the boot is cached in a module-level promise: the first request to
 *    an instance pays for it, every later request on that instance does not.
 * 2. **A failed boot must not be permanent.** If the database is briefly unreachable
 *    while an instance starts, caching that rejected promise would poison the
 *    instance for its whole life. The cache is cleared on failure so the next
 *    request tries again.
 * 3. **Timers do not survive.** The hourly retention sweep in `index.ts` is an
 *    interval; a frozen function has no intervals. The sweep moves to a scheduled
 *    call of `POST /internal/purge` (see `routes/system.ts`), so deletion still
 *    happens on time — it is just triggered from outside instead of inside.
 *
 * Connection pooling is the other consequence: many instances each holding a pool
 * would exhaust Postgres, so the deployment points `DATABASE_URL` at a transaction
 * pooler and keeps the per-instance pool small.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ConfigError, loadServerConfig } from '@sanjeevani/config/server';
import { createApp } from './app';
import { createContainer } from './container';
import { createLogger } from './lib/logger';

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;

let booting: Promise<NodeHandler> | null = null;

async function boot(): Promise<NodeHandler> {
  const config = loadServerConfig();
  const logger = createLogger(config.LOG_LEVEL, false);
  const container = await createContainer(config, logger);
  const caps = container.capabilities();
  logger.info(
    { cold: true, ai: caps.ai, stt: caps.stt, tts: caps.tts, maps: caps.maps, persistence: caps.persistence },
    'Sanjeevani API ready (serverless)',
  );
  return createApp(container) as unknown as NodeHandler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    booting ??= boot().catch((error: unknown) => {
      // Never leave a rejected promise cached: a transient failure at cold start
      // would otherwise break this instance permanently.
      booting = null;
      throw error;
    });
    const app = await booting;
    app(req, res);
  } catch (error) {
    // A configuration mistake is the operator's problem and is worth naming in the
    // platform log. Anything else is reported generically — the response body never
    // carries internals, and it always carries the number that works without us.
    const misconfigured = error instanceof ConfigError;
    console.error(misconfigured ? error.message : 'API failed to start:', misconfigured ? '' : error);
    if (res.headersSent) {
      res.end();
      return;
    }
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(
      JSON.stringify({
        error: {
          code: 'service_unavailable',
          message: 'The service is temporarily unavailable. In an emergency, call 112.',
        },
      }),
    );
  }
}

/**
 * Lets the bundled function be run as an ordinary server — `node dist/serverless.js`
 * — which is how the deployment is smoke-tested locally before it is pushed. On the
 * platform the default export is used directly and this never runs.
 */
if (process.env.SERVERLESS_LOCAL_PORT) {
  const port = Number(process.env.SERVERLESS_LOCAL_PORT);
  createServer((req, res) => void handler(req, res)).listen(port, () => {
    console.log(`serverless bundle listening on http://127.0.0.1:${port}`);
  });
}
