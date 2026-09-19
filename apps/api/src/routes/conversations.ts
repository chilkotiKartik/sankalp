import {
  createConversationRequestSchema,
  emergencyActionRequestSchema,
  turnRequestSchema,
} from '@sanjeevani/types';
import { Router } from 'express';
import type { Container } from '../container';
import { hashIp } from '../lib/crypto';
import { parseBody, parseId, sanitizeText } from '../lib/validate';
import { requireAuth } from '../middleware/auth';

export function conversationRoutes(c: Container): Router {
  const router = Router();

  router.post('/v1/conversations', requireAuth, async (req, res) => {
    const body = parseBody(createConversationRequestSchema, req.body);
    const created = await c.conversations.create(req.auth!, body.languagePreference);
    res.status(201).json(created);
  });

  router.get('/v1/conversations', requireAuth, async (req, res) => {
    res.json({ conversations: await c.conversations.list(req.auth!) });
  });

  router.get('/v1/conversations/:id', requireAuth, async (req, res) => {
    res.json(await c.conversations.detail(req.auth!, parseId(req.params.id)));
  });

  router.delete('/v1/conversations/:id', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    await c.conversations.remove(req.auth!, id);
    await c.store.audit.add({ userId: req.auth!.userId, action: 'conversation.deleted', resourceType: 'conversation', resourceId: id, requestId: req.requestId });
    res.status(204).end();
  });

  router.post('/v1/conversations/:id/turns', requireAuth, async (req, res) => {
    const id = parseId(req.params.id);
    const raw = parseBody(turnRequestSchema, req.body);
    const text = sanitizeText(raw.text);
    const request = parseBody(turnRequestSchema, { ...raw, text });
    const response = await c.conversations.turn(req.auth!, id, request);
    await c.store.audit
      .add({
        userId: req.auth!.userId,
        action: response.phase === 'emergency' ? 'conversation.emergency' : 'conversation.turn',
        resourceType: 'conversation',
        resourceId: id,
        requestId: req.requestId,
        ipHash: hashIp(req.ip, c.config.JWT_SECRET),
        metadata: {
          phase: response.phase,
          urgency: response.triage?.urgency ?? null,
          emergencyCategory: response.emergency?.category ?? null,
          inputMode: request.inputMode,
          degraded: response.degraded,
        },
      })
      .catch((err) => c.logger.warn({ err }, 'audit write failed'));
    res.json(response);
  });

  router.post('/v1/conversations/:id/emergency-actions', requireAuth, async (req, res) => {
    const conversationId = parseId(req.params.id);
    const body = parseBody(emergencyActionRequestSchema, req.body);
    await c.conversations.recordEmergencyAction(req.auth, { ...body, conversationId });
    res.status(204).end();
  });

  /** SOS button outside a conversation — works without a session too. */
  router.post('/v1/emergency/events', async (req, res) => {
    const body = parseBody(emergencyActionRequestSchema, req.body);
    await c.conversations
      .recordEmergencyAction(req.auth, { ...body, conversationId: undefined })
      .catch((err) => c.logger.warn({ err }, 'emergency event write failed'));
    res.status(204).end();
  });

  return router;
}
