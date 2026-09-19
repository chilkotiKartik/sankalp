/**
 * Integration test against a real PostgreSQL database.
 * Runs only when TEST_DATABASE_URL points at a migrated, disposable database:
 *   TEST_DATABASE_URL=postgresql://…/sanjeevani_test npm test
 */
import { loadServerConfig } from '@sanjeevani/config/server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createContainer, type Container } from '../src/container';
import { createLogger } from '../src/lib/logger';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('Postgres persistence', () => {
  let container: Container;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    const config = loadServerConfig({ NODE_ENV: 'test', PERSISTENCE: 'postgres', DATABASE_URL: url, PROVIDER_MODE: 'mock' });
    container = await createContainer(config, createLogger('silent', false));
    app = createApp(container);
  });

  afterAll(async () => {
    await container?.close();
  });

  it('persists a full turn transactionally and supports deletion', async () => {
    expect(container.store.kind).toBe('postgres');
    const agent = request.agent(app);
    await agent.post('/v1/auth/session').send({});
    const { body: conv } = await agent.post('/v1/conversations').send({});
    const location = { lat: 28.4952, lng: 77.0888, origin: 'demo' };
    await agent.post(`/v1/conversations/${conv.id}/turns`).send({ text: 'I have had a high fever for two days', location });
    const advice = await agent.post(`/v1/conversations/${conv.id}/turns`).send({ text: 'no', location });
    expect(advice.body.phase).toBe('advice');
    expect(advice.body.degraded).not.toContain('persistence_unavailable');

    const detail = await agent.get(`/v1/conversations/${conv.id}`);
    expect(detail.body.messages).toHaveLength(4);
    expect(detail.body.timeline[0].code).toBe('fever');
    const latest = await container.store.triage.latest(conv.id);
    expect(latest?.urgency).toBe('urgent');

    const emergency = await agent.post(`/v1/conversations/${conv.id}/turns`).send({ text: 'now he is unconscious', location });
    expect(emergency.body.phase).toBe('emergency');
    await agent.post(`/v1/conversations/${conv.id}/emergency-actions`).send({ action: 'dismissed' });

    const cached = await container.store.facilityCache.get('curated_directory|emergency_department|emergency_medicine|en|28.495|77.089');
    expect(Array.isArray(cached)).toBe(true);

    const { userId } = (await agent.get('/v1/auth/session')).body as { userId: string };
    expect(await container.store.conversations.findForUser(conv.id, userId)).not.toBeNull();
    expect((await agent.delete('/v1/privacy/data')).status).toBe(200);
    expect(await container.store.conversations.findForUser(conv.id, userId)).toBeNull();
    expect(await container.store.users.findById(userId)).toBeNull();
  });

  it('serves the seeded curated directory', async () => {
    const records = await container.store.facilities.listCurated('gurugram');
    expect(records.length).toBeGreaterThanOrEqual(6);
  });
});
