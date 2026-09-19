import { feedbackRequestSchema } from '@sanjeevani/types';
import { Router } from 'express';
import type { Container } from '../container';
import { parseBody, sanitizeText } from '../lib/validate';
import { clearSessionCookie, requireAuth } from '../middleware/auth';

export function privacyRoutes(c: Container): Router {
  const router = Router();

  router.post('/v1/feedback', async (req, res) => {
    const body = parseBody(feedbackRequestSchema, req.body);
    let conversationId: string | null = null;
    if (req.auth && body.conversationId) {
      const conversation = await c.store.conversations.findForUser(body.conversationId, req.auth.userId);
      conversationId = conversation?.id ?? null;
    }
    await c.store.feedback.add({
      userId: req.auth?.userId ?? null,
      conversationId,
      helpful: body.helpful,
      category: body.category,
      comment: body.comment ? sanitizeText(body.comment).slice(0, 600) : null,
    });
    res.status(201).json({ received: true });
  });

  router.get('/v1/privacy/summary', requireAuth, async (req, res) => {
    const conversations = await c.store.conversations.listForUser(req.auth!.userId, 100);
    res.json({
      anonymous: req.auth!.anonymous,
      conversations: conversations.length,
      retentionDays: c.config.RETENTION_DAYS,
      encryptedAtRest: true,
      locationStorage: 'coarse-area-only',
      oldestExpiry: conversations.map((x) => x.expiresAt.toISOString()).sort()[0] ?? null,
    });
  });

  /** Deletes every conversation and the anonymous identity, then ends the session. */
  router.delete('/v1/privacy/data', requireAuth, async (req, res) => {
    const auth = req.auth!;
    const removed = await c.store.conversations.deleteAllForUser(auth.userId);
    await c.auth.revoke(auth);
    await c.store.users.delete(auth.userId);
    c.auth.forgetUser(auth.userId);
    await c.store.audit.add({ action: 'privacy.data_deleted', resourceType: 'user', requestId: req.requestId, metadata: { conversations: removed } });
    clearSessionCookie(res, c.config.isProduction);
    res.json({ deletedConversations: removed });
  });

  return router;
}
