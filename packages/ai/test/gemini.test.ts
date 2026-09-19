import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GeminiProvider, extractToolArguments, toGeminiSchema } from '../src';

const schema = z.object({
  urgency: z.enum(['routine', 'urgent']),
  note: z.string().max(40),
  symptoms: z.array(z.string()).optional(),
});

const request = {
  task: 'understand' as const,
  system: 'You are a triage assistant.',
  prompt: 'mujhe do din se bukhar hai',
  schema,
  description: 'Return the structured reading.',
  fallback: { urgency: 'routine' as const, note: 'fallback' },
};

const toolCall = (args: unknown) =>
  new Response(JSON.stringify({ status: 'requires_action', steps: [{ type: 'function_call', name: 'submit', id: 'c1', arguments: args }] }), { status: 200 });

describe('Gemini provider', () => {
  it('forces the submit function and pins the API revision', async () => {
    const fetchImpl = vi.fn(async () => toolCall({ urgency: 'urgent', note: 'see a doctor today' }));
    const provider = new GeminiProvider({ apiKey: 'k', model: 'gemini-3.5-flash-lite', timeoutMs: 1000, fetchImpl: fetchImpl as unknown as typeof fetch });

    const out = await provider.generate(request);
    expect(out).toEqual({ urgency: 'urgent', note: 'see a doctor today' });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('k');
    expect(headers['api-revision']).toBe('2026-05-20');

    const body = JSON.parse(init.body as string);
    expect(body.system_instruction).toBe('You are a triage assistant.');
    expect(body.tools[0]).toMatchObject({ type: 'function', name: 'submit' });
    expect(body.generation_config.tool_choice).toEqual({ allowed_tools: { mode: 'any', tools: ['submit'] } });
  });

  it('rejects output that fails the schema rather than passing it on', async () => {
    const provider = new GeminiProvider({
      apiKey: 'k',
      model: 'm',
      timeoutMs: 1000,
      fetchImpl: (async () => toolCall({ urgency: 'emergency', note: 'x' })) as unknown as typeof fetch,
    });
    await expect(provider.generate(request)).rejects.toMatchObject({ kind: 'invalid_output' });
  });

  it('reads a function call from the older candidates[] shape too', async () => {
    const body = {
      candidates: [{ content: { parts: [{ functionCall: { name: 'submit', args: { urgency: 'routine', note: 'rest' } } }] } }],
    };
    const provider = new GeminiProvider({
      apiKey: 'k',
      model: 'm',
      timeoutMs: 1000,
      fetchImpl: (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch,
    });
    await expect(provider.generate(request)).resolves.toEqual({ urgency: 'routine', note: 'rest' });
  });

  it('recovers JSON from a fenced prose reply when the call was not made', async () => {
    const text = 'Here you go:\n```json\n{"urgency":"routine","note":"rest and fluids"}\n```';
    const provider = new GeminiProvider({
      apiKey: 'k',
      model: 'm',
      timeoutMs: 1000,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'text', text }] }] }), { status: 200 })) as unknown as typeof fetch,
    });
    await expect(provider.generate(request)).resolves.toEqual({ urgency: 'routine', note: 'rest and fluids' });
  });

  it('errors when there is no structured output at all', async () => {
    const provider = new GeminiProvider({
      apiKey: 'k',
      model: 'm',
      timeoutMs: 1000,
      fetchImpl: (async () => new Response(JSON.stringify({ steps: [] }), { status: 200 })) as unknown as typeof fetch,
    });
    await expect(provider.generate(request)).rejects.toMatchObject({ kind: 'invalid_output' });
  });

  it('maps HTTP status codes to typed errors', async () => {
    const make = (status: number) =>
      new GeminiProvider({ apiKey: 'k', model: 'm', timeoutMs: 1000, fetchImpl: (async () => new Response('{}', { status })) as unknown as typeof fetch });
    await expect(make(429).generate(request)).rejects.toMatchObject({ kind: 'rate_limited' });
    await expect(make(401).generate(request)).rejects.toMatchObject({ kind: 'auth' });
    await expect(make(404).generate(request)).rejects.toMatchObject({ kind: 'bad_request' });
    await expect(make(503).generate(request)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('times out rather than hanging a turn', async () => {
    const provider = new GeminiProvider({
      apiKey: 'k',
      model: 'm',
      timeoutMs: 10,
      fetchImpl: ((_u: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })) as unknown as typeof fetch,
    });
    await expect(provider.generate(request)).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('never puts the key in the URL', async () => {
    const fetchImpl = vi.fn(async () => toolCall({ urgency: 'routine', note: 'ok' }));
    const provider = new GeminiProvider({ apiKey: 'super-secret', model: 'm', timeoutMs: 1000, fetchImpl: fetchImpl as unknown as typeof fetch });
    await provider.generate(request);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).not.toContain('super-secret');
  });
});

describe('toGeminiSchema', () => {
  it('drops keywords the function declaration format rejects', () => {
    const json = z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
    const out = toGeminiSchema(json) as Record<string, unknown>;
    expect(out['$schema']).toBeUndefined();
    expect(out['additionalProperties']).toBeUndefined();
    expect(out['type']).toBe('object');
    expect(Object.keys(out['properties'] as object)).toEqual(['urgency', 'note', 'symptoms']);
    expect(out['required']).toEqual(['urgency', 'note']);
  });

  it('turns an enum union into a plain string enum', () => {
    const out = toGeminiSchema({ anyOf: [{ const: 'a' }, { const: 'b' }] });
    expect(out).toEqual({ type: 'string', enum: ['a', 'b'] });
  });

  it('keeps the real member of a nullable union', () => {
    expect(toGeminiSchema({ anyOf: [{ type: 'string' }, { type: 'null' }] })).toEqual({ type: 'string' });
  });

  it('collapses an array type list to a single type', () => {
    expect(toGeminiSchema({ type: ['string', 'null'] })).toEqual({ type: 'string' });
  });

  it('recurses into array items', () => {
    const out = toGeminiSchema({ type: 'array', items: { type: 'string', additionalProperties: false } }) as Record<string, unknown>;
    expect(out['items']).toEqual({ type: 'string' });
  });
});

describe('extractToolArguments', () => {
  it('accepts both `arguments` and `args` keys', () => {
    expect(extractToolArguments({ steps: [{ type: 'function_call', name: 'submit', arguments: { a: 1 } }] })).toEqual({ a: 1 });
    expect(extractToolArguments({ steps: [{ type: 'function_call', name: 'submit', args: { a: 2 } }] })).toEqual({ a: 2 });
  });

  it('ignores steps that are not function calls', () => {
    expect(extractToolArguments({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'hi' }] }] })).toBeUndefined();
  });
});
