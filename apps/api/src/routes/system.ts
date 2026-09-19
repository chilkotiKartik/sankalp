import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { Container } from '../container';
import { requireRole } from '../middleware/auth';

/** Constant-time compare that does not leak the expected length. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function systemRoutes(c: Container): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  router.get('/health/ready', async (_req, res) => {
    const db = await c.store.health();
    res.status(db ? 200 : 503).json({ status: db ? 'ready' : 'degraded', persistence: c.store.kind, database: db });
  });

  router.get('/v1/capabilities', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(c.capabilities());
  });

  /*
   * Retention sweep for hosts that cannot keep a timer alive.
   *
   * On a long-running server the sweep runs hourly inside the process. A serverless
   * function is frozen between requests, so the promise that deletion happens has to
   * be kept by something outside it — the platform scheduler, calling this.
   *
   * It is not an admin route: the scheduler has no session. It is authorised by a
   * shared secret, and when that secret is absent the route does not exist at all,
   * so a misconfigured deployment cannot leave a deletion endpoint open.
   */
  // GET as well as POST: platform schedulers issue a plain GET, and the sweep has to
  // be reachable by the thing that actually runs it. The secret check below is what
  // makes that safe — without it neither verb does anything.
  router.all('/internal/purge', async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      next();
      return;
    }
    const expected = c.config.CRON_SECRET;
    if (!expected) {
      res.status(404).json({ error: { code: 'not_found', message: 'Not found.', requestId: req.requestId } });
      return;
    }
    const header = req.get('authorization') ?? '';
    const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!provided || !secretMatches(provided, expected)) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Not authorised.', requestId: req.requestId } });
      return;
    }
    const purged = await c.store.conversations.purgeExpired(new Date());
    // A count, never the contents. The log line is safe to keep.
    c.logger.info({ purged }, 'scheduled retention sweep');
    res.json({ purged });
  });

  router.get('/v1/admin/metrics', requireRole('ADMIN'), async (_req, res) => {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [emergencies, feedback] = await Promise.all([
      c.store.emergencies.countByCategory(since),
      c.store.feedback.stats(since),
    ]);
    res.json({ windowDays: 7, emergenciesByCategory: emergencies, feedback });
  });

  return router;
}
