import { loadServerConfig } from '@sanjeevani/config/server';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createContainer, type Container } from '../src/container';
import { FieldCipher, hashIp } from '../src/lib/crypto';
import { createLogger } from '../src/lib/logger';
import { createMemoryStore } from '../src/repositories/memory-store';
import type { Store } from '../src/repositories/types';

const LOCATION = { lat: 28.4952, lng: 77.0888, origin: 'demo' };

async function setup(env: Record<string, string> = {}) {
  const config = loadServerConfig({
    NODE_ENV: 'test',
    PERSISTENCE: 'memory',
    PROVIDER_MODE: 'mock',
    DEMO_MODE: 'true',
    RATE_LIMIT_MAX: '1000',
    ...env,
  });
  const store = createMemoryStore();
  const container = await createContainer(config, createLogger('silent', false), { store });
  const app = createApp(container);
  return { app, container, store };
}

async function session(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  const res = await agent.post('/v1/auth/session').send({});
  expect(res.status).toBe(201);
  return agent;
}

describe('system endpoints', () => {
  it('reports health, readiness and capabilities', async () => {
    const { app } = await setup();
    expect((await request(app).get('/health')).body.status).toBe('ok');
    expect((await request(app).get('/health/ready')).body).toMatchObject({ status: 'ready', persistence: 'memory' });
    const caps = await request(app).get('/v1/capabilities');
    expect(caps.body).toMatchObject({ demoMode: true, stt: 'browser', tts: 'browser', ai: 'rules', maps: 'curated_directory' });
    expect(caps.body.emergencyContacts[0].number).toBe('112');
  });

  it('a single Gemini key lights up understanding, speech-in and speech-out', async () => {
    const { app } = await setup({ PROVIDER_MODE: 'auto', GEMINI_API_KEY: 'test-key' });
    const caps = await request(app).get('/v1/capabilities');
    expect(caps.body).toMatchObject({ ai: 'gemini', stt: 'gemini', tts: 'gemini' });
    // The key itself must never appear in a client-visible response.
    expect(JSON.stringify(caps.body)).not.toContain('test-key');
  });

  it('accepts GOOGLE_API_KEY as an alias for GEMINI_API_KEY', async () => {
    const { app } = await setup({ PROVIDER_MODE: 'auto', GOOGLE_API_KEY: 'aliased-key' });
    expect((await request(app).get('/v1/capabilities')).body.ai).toBe('gemini');
  });

  it('prefers Gemini over Anthropic on auto, and honours an explicit choice', async () => {
    const both = { PROVIDER_MODE: 'auto', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' };
    expect((await request((await setup(both)).app).get('/v1/capabilities')).body.ai).toBe('gemini');
    const pinned = await setup({ ...both, AI_PROVIDER: 'anthropic' });
    expect((await request(pinned.app).get('/v1/capabilities')).body.ai).toBe('anthropic');
    const off = await setup({ ...both, AI_PROVIDER: 'rules' });
    expect((await request(off.app).get('/v1/capabilities')).body.ai).toBe('rules');
  });

  it('sets security headers and never caches API responses', async () => {
    const { app } = await setup();
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('returns safe JSON errors without stack traces', async () => {
    const { app } = await setup();
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'not_found' });
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts/);
    const bad = await request(app).post('/v1/auth/session').set('content-type', 'application/json').send('{bad json');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('bad_request');
  });

  it('only lets allowed origins make credentialed CORS calls', async () => {
    const { app } = await setup({ APP_ORIGIN: 'https://sanjeevani.example' });
    const ok = await request(app).get('/health').set('Origin', 'https://sanjeevani.example');
    expect(ok.headers['access-control-allow-origin']).toBe('https://sanjeevani.example');
    const evil = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  /*
   * The retention sweep is the only route a machine can call without a session, so
   * it is the one place where getting the authorisation wrong would be quiet and
   * serious. These cases pin down all three states it can be in.
   */
  describe('the scheduled retention sweep', () => {
    it('does not exist when no schedule secret is configured', async () => {
      const { app } = await setup();
      const res = await request(app).post('/internal/purge');
      expect(res.status).toBe(404);
      // Absent, not merely unauthorised: nothing should hint that a route is there.
      expect(res.body.error.code).toBe('not_found');
    });

    it('refuses a missing, wrong or truncated secret', async () => {
      const { app } = await setup({ CRON_SECRET: 'a-scheduler-secret-value' });
      expect((await request(app).post('/internal/purge')).status).toBe(401);
      expect((await request(app).post('/internal/purge').set('Authorization', 'Bearer wrong')).status).toBe(401);
      // A prefix of the real secret must not pass.
      expect((await request(app).post('/internal/purge').set('Authorization', 'Bearer a-scheduler-secret')).status).toBe(401);
      // Nor the secret without the scheme the scheduler actually sends.
      expect((await request(app).post('/internal/purge').set('Authorization', 'a-scheduler-secret-value')).status).toBe(401);
    });

    it('runs for the scheduler over GET as well as POST, and reports only a count', async () => {
      const { app } = await setup({ CRON_SECRET: 'a-scheduler-secret-value' });
      const auth = 'Bearer a-scheduler-secret-value';
      for (const res of [
        await request(app).post('/internal/purge').set('Authorization', auth),
        await request(app).get('/internal/purge').set('Authorization', auth),
      ]) {
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ purged: 0 });
      }
    });
  });
});

describe('authentication and authorization', () => {
  it('requires a session for conversations', async () => {
    const { app } = await setup();
    expect((await request(app).post('/v1/conversations').send({})).status).toBe(401);
    expect((await request(app).get('/v1/conversations')).status).toBe(401);
  });

  it('issues an httpOnly session cookie and resumes it', async () => {
    const { app } = await setup();
    const res = await request(app).post('/v1/auth/session').send({});
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/sv_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const again = await request(app).post('/v1/auth/session').set('Cookie', cookie.split(';')[0]!).send({});
    expect(again.body.resumed).toBe(true);
  });

  it('rejects tampered and revoked tokens', async () => {
    const { app } = await setup();
    const agent = await session(app);
    expect((await request(app).get('/v1/auth/session').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
    expect((await agent.delete('/v1/auth/session')).status).toBe(204);
    expect((await agent.get('/v1/auth/session')).status).toBe(401);
  });

  it('hides other users’ conversations', async () => {
    const { app } = await setup();
    const alice = await session(app);
    const bob = await session(app);
    const { body } = await alice.post('/v1/conversations').send({});
    expect((await bob.get(`/v1/conversations/${body.id}`)).status).toBe(404);
    expect((await bob.post(`/v1/conversations/${body.id}/turns`).send({ text: 'hi' })).status).toBe(404);
    expect((await bob.delete(`/v1/conversations/${body.id}`)).status).toBe(404);
    expect((await alice.get(`/v1/conversations/${body.id}`)).status).toBe(200);
  });

  it('keeps the admin endpoint disabled unless configured, and role-protected', async () => {
    const { app } = await setup();
    expect((await request(app).post('/v1/auth/admin').send({ accessKey: 'x' })).status).toBe(404);
    const user = await session(app);
    expect((await user.get('/v1/admin/metrics')).status).toBe(403);

    const key = 'a-very-long-operator-access-key-123';
    const configured = await setup({ ADMIN_ACCESS_KEY: key });
    expect((await request(configured.app).post('/v1/auth/admin').send({ accessKey: 'wrong' })).status).toBe(401);
    const login = await request(configured.app).post('/v1/auth/admin').send({ accessKey: key });
    expect(login.status).toBe(201);
    const metrics = await request(configured.app).get('/v1/admin/metrics').set('Authorization', `Bearer ${login.body.token}`);
    expect(metrics.status).toBe(200);
    expect(metrics.body).toHaveProperty('feedback');
  });
});

describe('conversation API', () => {
  let app: ReturnType<typeof createApp>;
  let store: Store;
  let container: Container;
  beforeEach(async () => {
    ({ app, store, container } = await setup());
  });

  it('runs a complete journey and stores only encrypted text', async () => {
    const agent = await session(app);
    const { body: conv } = await agent.post('/v1/conversations').send({});

    const first = await agent.post(`/v1/conversations/${conv.id}/turns`).send({ text: 'Mujhe do din se bahut tez bukhar hai aur body pain ho raha hai.', inputMode: 'voice', location: LOCATION });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ phase: 'follow_up', language: 'hinglish', conversationId: conv.id });

    const second = await agent.post(`/v1/conversations/${conv.id}/turns`).send({ text: 'nahi', inputMode: 'quick_reply', location: LOCATION });
    expect(second.body.phase).toBe('advice');
    expect(second.body.triage.urgency).toBe('urgent');
    expect(second.body.facilities.length).toBeGreaterThan(0);
    expect(second.body.facilities[0].directionsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
    expect(second.body.disclaimer).toMatch(/112/);

    const detail = await agent.get(`/v1/conversations/${conv.id}`);
    expect(detail.body.messages).toHaveLength(4);
    expect(detail.body.timeline.map((t: { code: string }) => t.code).sort()).toEqual(['body_ache', 'fever']);
    expect(detail.body.latestTriage.urgency).toBe('urgent');

    const list = await agent.get('/v1/conversations');
    expect(list.body.conversations[0]).toMatchObject({ id: conv.id, urgency: 'urgent', turnCount: 2 });

    // Stored content is ciphertext, and location is only a coarse geohash.
    const stored = await store.messages.listRecent(conv.id, 10);
    for (const m of stored) {
      expect(m.contentCiphertext.startsWith('v1.')).toBe(true);
      expect(m.contentCiphertext).not.toMatch(/bukhar/);
    }
    const record = await store.conversations.findForUser(conv.id, detail.body ? (await agent.get('/v1/auth/session')).body.userId : '');
    expect(record?.areaGeohash).toHaveLength(5);
    expect(container.cipher.decryptJson<{ phase: string }>(record!.stateCiphertext!).phase).toBe('advice');
  });

  it('returns an emergency response and records the event', async () => {
    const agent = await session(app);
    const { body: conv } = await agent.post('/v1/conversations').send({});
    const res = await agent.post(`/v1/conversations/${conv.id}/turns`).send({ text: 'my father collapsed and is not breathing', location: LOCATION });
    expect(res.body.phase).toBe('emergency');
    expect(res.body.emergency.contacts[0].number).toBe('112');
    expect(res.body.facilities[0].emergency24x7).toBe(true);
    const counts = await store.emergencies.countByCategory(new Date(0));
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(1);

    expect((await agent.post(`/v1/conversations/${conv.id}/emergency-actions`).send({ action: 'call_initiated', contactNumber: '112' })).status).toBe(204);
    expect((await agent.post(`/v1/conversations/${conv.id}/emergency-actions`).send({ action: 'teleport' })).status).toBe(400);
  });

  it('accepts SOS events without a session', async () => {
    expect((await request(app).post('/v1/emergency/events').send({ action: 'call_initiated' })).status).toBe(204);
  });

  it('validates and sanitises turn input', async () => {
    const agent = await session(app);
    const { body: conv } = await agent.post('/v1/conversations').send({});
    expect((await agent.post(`/v1/conversations/${conv.id}/turns`).send({ text: '' })).status).toBe(400);
    expect((await agent.post(`/v1/conversations/${conv.id}/turns`).send({ text: 'x'.repeat(1001) })).status).toBe(400);
    const bad = await agent.post(`/v1/conversations/${conv.id}/turns`).send({ text: 'fever', location: { lat: 200, lng: 0 } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toContain('location');
    expect((await agent.get('/v1/conversations/not-an-id')).status).toBe(404);

    const html = await agent.post(`/v1/conversations/${conv.id}/turns`).send({ text: '<script>alert(1)</script>I have fever' });
    expect(html.status).toBe(200);
    const detail = await agent.get(`/v1/conversations/${conv.id}`);
    expect(detail.body.messages[0].text).not.toMatch(/<script>/);
  });

  it('deletes a conversation and all data on request', async () => {
    const agent = await session(app);
    const { body: conv } = await agent.post('/v1/conversations').send({});
    await agent.post(`/v1/conversations/${conv.id}/turns`).send({ text: 'I have fever' });
    expect((await agent.get('/v1/privacy/summary')).body.conversations).toBe(1);
    const res = await agent.delete('/v1/privacy/data');
    expect(res.body.deletedConversations).toBe(1);
    expect(res.headers['set-cookie']?.[0]).toMatch(/sv_session=;/);
    expect((await agent.get('/v1/conversations')).status).toBe(401);
  });

  it('keeps giving guidance if persistence fails mid-turn', async () => {
    const agent = await session(app);
    const { body: conv } = await agent.post('/v1/conversations').send({});
    store.conversations.persistTurn = async () => {
      throw new Error('db down');
    };
    const res = await agent.post(`/v1/conversations/${conv.id}/turns`).send({ text: 'I can’t breathe' });
    expect(res.status).toBe(200);
    expect(res.body.phase).toBe('emergency');
    expect(res.body.degraded).toContain('persistence_unavailable');
  });
});

describe('facilities, voice, feedback', () => {
  it('ranks nearby facilities and validates the query', async () => {
    const { app } = await setup();
    const res = await request(app).get('/v1/facilities').query({ lat: LOCATION.lat, lng: LOCATION.lng, type: 'emergency_department', urgency: 'emergency', limit: 3 });
    expect(res.status).toBe(200);
    expect(res.body.facilities).toHaveLength(3);
    expect(res.body.provider).toBe('curated_directory');
    expect((await request(app).get('/v1/facilities').query({ lat: 'x', lng: 1 })).status).toBe(400);

    const detail = await request(app).get('/v1/facilities/cd_artemis-hospital-gurugram').query({ lat: LOCATION.lat, lng: LOCATION.lng });
    expect(detail.body.facility.name).toBe('Artemis Hospital');
    expect(detail.body.facility.travel.distanceMeters).toBeGreaterThan(0);
    expect((await request(app).get('/v1/facilities/cd_unknown')).status).toBe(404);
    expect((await request(app).get('/v1/facilities/../../etc')).status).toBe(404);
  });

  it('tells the client to use on-device voice when none is configured', async () => {
    const { app } = await setup();
    const agent = await session(app);
    const speak = await agent.post('/v1/voice/speak').send({ text: 'hello', language: 'en' });
    expect(speak.status).toBe(501);
    expect(speak.body.error.code).toBe('voice_not_configured');
    const noFile = await agent.post('/v1/voice/transcribe');
    expect(noFile.status).toBe(400);
    const stt = await agent.post('/v1/voice/transcribe').attach('audio', Buffer.from([1, 2, 3]), { filename: 'a.webm', contentType: 'audio/webm' });
    expect(stt.status).toBe(501);
    const wrongType = await agent.post('/v1/voice/transcribe').attach('audio', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(wrongType.status).toBe(400);
  });

  it('proxies ElevenLabs audio when configured, without exposing the key', async () => {
    const config = loadServerConfig({ NODE_ENV: 'test', PERSISTENCE: 'memory', ELEVENLABS_API_KEY: 'el-secret', ELEVENLABS_VOICE_ID: 'v1' });
    const seen: string[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push(`${url} ${(init.headers as Record<string, string>)['xi-api-key']}`);
      return new Response(new Uint8Array([0xff, 0xfb, 0x90]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }) as unknown as typeof fetch;
    const container = await createContainer(config, createLogger('silent', false), { store: createMemoryStore(), fetchImpl });
    const app = createApp(container);
    const agent = await session(app);
    const res = await agent.post('/v1/voice/speak').send({ text: 'नमस्ते', language: 'hi' }).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect((res.body as Buffer).length).toBe(3);
    expect(seen[0]).toContain('/v1/text-to-speech/v1/stream');
    expect(JSON.stringify(res.headers)).not.toContain('el-secret');
    expect((await request(app).get('/v1/capabilities')).body.tts).toBe('elevenlabs');
  });

  it('rate-limits voice endpoints', async () => {
    const { app } = await setup({ RATE_LIMIT_VOICE_MAX: '2' });
    const agent = await session(app);
    await agent.post('/v1/voice/speak').send({ text: 'a' });
    await agent.post('/v1/voice/speak').send({ text: 'a' });
    const limited = await agent.post('/v1/voice/speak').send({ text: 'a' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.message).toMatch(/112/);
  });

  it('stores feedback with a sanitised comment', async () => {
    const { app, store } = await setup();
    const res = await request(app).post('/v1/feedback').send({ helpful: true, category: 'voice', comment: '<b>Great</b> voice' });
    expect(res.status).toBe(201);
    expect((await store.feedback.stats(new Date(0))).total).toBe(1);
    expect((await request(app).post('/v1/feedback').send({ helpful: 'yes' })).status).toBe(400);
  });
});

describe('crypto helpers', () => {
  it('round-trips and detects tampering', () => {
    const cipher = new FieldCipher(Buffer.alloc(32, 7).toString('base64'));
    const env = cipher.encrypt('मुझे बुखार है');
    expect(cipher.decrypt(env)).toBe('मुझे बुखार है');
    expect(cipher.encrypt('same')).not.toBe(cipher.encrypt('same'));
    const parts = env.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });

  it('hashes IPs with a secret', () => {
    expect(hashIp('1.2.3.4', 'a')).not.toBe(hashIp('1.2.3.4', 'b'));
    expect(hashIp(undefined, 'a')).toBeNull();
  });
});

describe('configuration', () => {
  it('refuses unsafe production configuration', () => {
    expect(() => loadServerConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => loadServerConfig({ NODE_ENV: 'development', DATA_ENCRYPTION_KEY: 'short' })).toThrow(/32 bytes/);
    expect(() => loadServerConfig({ REGION_ID: 'atlantis' })).toThrow(/region/i);
  });
});
