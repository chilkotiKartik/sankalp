import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Container } from '../container';
import { hashIp, safeEqual } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { parseBody } from '../lib/validate';
import { clearSessionCookie, requireAuth, setSessionCookie } from '../middleware/auth';
import { languagePreferenceSchema } from '@sanjeevani/types';

export function authRoutes(c: Container, sessionLimit: RequestHandler): Router {
  const router = Router();
  const secure = c.config.isProduction;

  /** Starts (or resumes) an anonymous session. No personal data is requested. */
  router.post('/v1/auth/session', sessionLimit, async (req, res) => {
    if (req.auth) {
      res.json({ userId: req.auth.userId, anonymous: req.auth.anonymous, resumed: true });
      return;
    }
    const body = parseBody(z.object({ languagePreference: languagePreferenceSchema.default('auto') }), req.body);
    const session = await c.auth.createAnonymousSession(body.languagePreference);
    setSessionCookie(res, session, secure);
    await c.store.audit.add({
      userId: session.context.userId,
      action: 'session.created',
      resourceType: 'session',
      resourceId: session.context.sessionId,
      requestId: req.requestId,
      ipHash: hashIp(req.ip, c.config.JWT_SECRET),
    });
    res.status(201).json({ userId: session.context.userId, anonymous: true, expiresAt: session.expiresAt.toISOString() });
  });

  router.get('/v1/auth/session', requireAuth, (req, res) => {
    res.json({ userId: req.auth!.userId, anonymous: req.auth!.anonymous, role: req.auth!.role });
  });

  router.delete('/v1/auth/session', requireAuth, async (req, res) => {
    await c.auth.revoke(req.auth!);
    clearSessionCookie(res, secure);
    res.status(204).end();
  });

  /**
   * Operator sign-in for the metrics endpoint. Disabled unless ADMIN_ACCESS_KEY is set.
   * Returns a bearer token; the key itself is compared in constant time.
   */
  router.post('/v1/auth/admin', sessionLimit, async (req, res) => {
    const configured = c.config.ADMIN_ACCESS_KEY;
    if (!configured || configured.length < 24) throw AppError.notFound('This endpoint does not exist.');
    const { accessKey } = parseBody(z.object({ accessKey: z.string().min(1).max(256) }), req.body);
    if (!safeEqual(accessKey, configured)) {
      await c.store.audit.add({ action: 'admin.login_failed', resourceType: 'session', requestId: req.requestId, ipHash: hashIp(req.ip, c.config.JWT_SECRET) });
      throw AppError.unauthorized('Invalid access key.');
    }
    const session = await c.auth.createAdminSession();
    await c.store.audit.add({ userId: session.context.userId, action: 'admin.login', resourceType: 'session', requestId: req.requestId });
    res.status(201).json({ token: session.token, expiresAt: session.expiresAt.toISOString() });
  });

  return router;
}
