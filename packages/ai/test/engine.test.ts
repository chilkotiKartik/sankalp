import type { RankedFacility } from '@sanjeevani/types';
import { describe, expect, it, vi } from 'vitest';
import {
  AnthropicProvider,
  ConversationEngine,
  DeterministicProvider,
  newConversationMemory,
  type ConversationMemory,
  type FacilityFinder,
  type LlmProvider,
  type TurnInput,
} from '../src';

const LOCATION = { lat: 28.4952, lng: 77.0888, origin: 'demo' as const };

function facility(name: string, overrides: Partial<RankedFacility> = {}): RankedFacility {
  return {
    id: `cd_${name.toLowerCase().replace(/\W+/g, '-')}`,
    placeId: null,
    name,
    address: 'Sector 44, Gurugram',
    location: { lat: 28.46, lng: 77.07 },
    coordinatesApproximate: true,
    phone: '+91 124 451 1111',
    emergencyPhone: null,
    types: ['hospital', 'emergency_department'],
    verifiedSpecialties: ['general_medicine', 'emergency_medicine'],
    emergency24x7: true,
    openNow: true,
    ownership: 'private',
    rating: null,
    userRatingCount: null,
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=x',
    website: null,
    source: { provider: 'curated_directory', label: 'test' },
    straightLineMeters: 3000,
    travel: { distanceMeters: 3500, durationSeconds: 600, estimated: true, source: 'haversine_estimate' },
    score: 0.9,
    factors: { relevance: 1, distance: 0.6, operational: 1, service: 1 },
    reasons: ['has_24x7_emergency'],
    directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=x',
    ...overrides,
  };
}

function finder(result: Awaited<ReturnType<FacilityFinder['find']>> = { facilities: [facility('Artemis Hospital')], status: 'ok' }) {
  return { find: vi.fn(async () => result) } satisfies FacilityFinder;
}

function input(text: string, extra: Partial<TurnInput> = {}): TurnInput {
  return { text, inputMode: 'voice', languagePreference: 'auto', recentTurns: [], location: LOCATION, ...extra };
}

async function run(engine: ConversationEngine, lines: string[], extra: Partial<TurnInput> = {}) {
  let memory: ConversationMemory = newConversationMemory();
  const responses = [];
  for (const line of lines) {
    const outcome = await engine.handleTurn(memory, input(line, extra));
    memory = outcome.memory;
    responses.push(outcome);
  }
  return { memory, responses, last: responses.at(-1)! };
}

const deterministic = () => new ConversationEngine({ llm: new DeterministicProvider(), facilities: finder(), aiTimeoutMs: 1000 });

describe('conversation engine (demo providers)', () => {
  it('runs the full Hinglish journey: symptoms → follow-up → advice → directions', async () => {
    const engine = deterministic();
    const { responses } = await run(engine, ['Mujhe do din se bahut tez bukhar hai aur body pain ho raha hai.', 'nahi', 'haan']);

    const [first, second, third] = responses.map((r) => r.response);
    expect(first!.phase).toBe('follow_up');
    expect(first!.language).toBe('hinglish');
    expect(first!.reply.display).toMatch(/Samajh gayi/);
    expect(first!.quickReplies.map((q) => q.value)).toEqual(['haan', 'nahi']);

    expect(second!.phase).toBe('advice');
    expect(second!.triage?.urgency).toBe('urgent');
    expect(second!.facilities[0]?.name).toBe('Artemis Hospital');
    expect(second!.reply.display).toMatch(/Artemis Hospital/);
    expect(second!.reply.display).toMatch(/aaj/);
    expect(second!.reply.speech).not.toMatch(/24×7|—/);

    // "haan" to "Shall I show directions?"
    expect(third!.intent).toBe('directions');
    expect(third!.reply.display).toMatch(/rasta/);
  });

  it('stops everything for an emergency and never waits long on maps', async () => {
    const slowFinder: FacilityFinder = { find: () => new Promise((r) => setTimeout(() => r({ facilities: [], status: 'ok' }), 5000)) };
    const engine = new ConversationEngine({ llm: new DeterministicProvider(), facilities: slowFinder, aiTimeoutMs: 1000, emergencyFacilityTimeoutMs: 50 });
    const started = Date.now();
    const { last } = await run(engine, ['मेरे पापा के सीने में तेज़ दर्द है']);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(last.response.phase).toBe('emergency');
    expect(last.response.emergency?.category).toBe('cardiac');
    expect(last.response.emergency?.contacts[0]?.number).toBe('112');
    expect(last.response.reply.speech).toMatch(/1 1 2/);
    expect(last.response.degraded).toContain('maps_unavailable');
    expect(last.events.emergency?.ruleIds).toContain('cardiac.chest_pain');
  });

  it('puts Tele-MANAS first for self-harm and skips facility search', async () => {
    const f = finder();
    const engine = new ConversationEngine({ llm: new DeterministicProvider(), facilities: f, aiTimeoutMs: 1000 });
    const { last } = await run(engine, ['I want to end my life']);
    expect(last.response.emergency?.contacts[0]?.number).toBe('14416');
    expect(f.find).not.toHaveBeenCalled();
  });

  it('allows the user to dismiss a composite emergency and continue', async () => {
    const engine = deterministic();
    const { memory } = await run(engine, ['I have chest pain']);
    expect(memory.phase).toBe('emergency');
    const dismissed = engine.dismissEmergency(memory);
    const next = await engine.handleTurn(dismissed, input('it is only when I cough, I also have a cough'));
    expect(next.response.phase).not.toBe('emergency');
  });

  it('asks for location when it has none', async () => {
    const engine = deterministic();
    const { last } = await run(engine, ['I have had a mild headache since yesterday', 'no', 'mild'], { location: undefined });
    expect(last.response.phase).toBe('advice');
    expect(last.response.facilitiesStatus).toBe('needs_location');
    expect(last.response.reply.display).toMatch(/location/i);
  });

  it('reports maps outages gracefully', async () => {
    const engine = new ConversationEngine({ llm: new DeterministicProvider(), facilities: finder({ facilities: [], status: 'unavailable' }), aiTimeoutMs: 1000 });
    const { last } = await run(engine, ['kutte ne kaat liya', 'mere liye']);
    expect(last.response.phase).toBe('advice');
    expect(last.response.degraded).toContain('maps_unavailable');
    expect(last.response.reply.display).toMatch(/112/);
  });

  it('greets, clarifies and resets', async () => {
    const engine = deterministic();
    const hello = await engine.handleTurn(newConversationMemory(), input('namaste'));
    expect(hello.response.phase).toBe('greeting');
    expect(hello.response.language).toBe('hinglish');
    const reset = await engine.handleTurn(hello.memory, input('start over'));
    expect(reset.response.intent).toBe('reset');
    expect(reset.memory.clinical.symptoms).toEqual([]);
  });

  it('switches language mid-conversation', async () => {
    const engine = deterministic();
    const { responses } = await run(engine, ['I have a fever', 'नहीं, कुछ नहीं']);
    expect(responses[0]!.response.language).toBe('en');
    expect(responses[1]!.response.language).toBe('hi');
  });

  it('honours an explicit language preference', async () => {
    const engine = deterministic();
    const { last } = await run(engine, ['I have a fever'], { languagePreference: 'hi' });
    expect(last.response.language).toBe('hi');
    expect(last.response.reply.display).toMatch(/बुखार/);
  });
});

function anthropicReturning(bodies: unknown[]) {
  const queue = [...bodies];
  const fetchImpl = vi.fn(async () => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (typeof next === 'number') return new Response('{}', { status: next });
    return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return { provider: new AnthropicProvider({ apiKey: 'test', model: 'claude-test', timeoutMs: 500, fetchImpl: fetchImpl as unknown as typeof fetch }), fetchImpl };
}

const toolUse = (input: unknown) => ({ content: [{ type: 'tool_use', name: 'submit', input }], stop_reason: 'tool_use' });

describe('conversation engine with an AI provider', () => {
  it('sends a forced tool call with the right headers', async () => {
    const { provider, fetchImpl } = anthropicReturning([toolUse({ reply: 'Samajh gayi. Kripya aaj hi doctor ko dikhayein. Artemis Hospital lagbhag 3.5 km door hai.' })]);
    const engine = new ConversationEngine({ llm: provider, facilities: finder(), aiTimeoutMs: 500 });
    const memory = (await deterministic().handleTurn(newConversationMemory(), input('Mujhe do din se bahut tez bukhar hai'))).memory;
    const out = await engine.handleTurn(memory, input('nahi'));
    expect(out.telemetry.aiPhrasingUsed).toBe(true);
    expect(out.response.reply.display).toMatch(/Artemis Hospital/);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(String(init.body));
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'submit' });
  });

  it('rejects unsafe AI phrasing and falls back to the template', async () => {
    const { provider } = anthropicReturning([toolUse({ reply: 'You have dengue. Take 500 mg paracetamol. Artemis Hospital is today.' })]);
    const engine = new ConversationEngine({ llm: provider, facilities: finder(), aiTimeoutMs: 500 });
    const memory = (await deterministic().handleTurn(newConversationMemory(), input('I have had a high fever for two days'))).memory;
    const out = await engine.handleTurn(memory, input('no'));
    expect(out.telemetry.aiPhrasingUsed).toBe(false);
    expect(out.response.reply.display).not.toMatch(/dengue|500 mg/);
    expect(out.response.degraded).toContain('ai_invalid_output');
  });

  it('rejects phrasing that drops the urgency or facility', async () => {
    const { provider } = anthropicReturning([toolUse({ reply: 'Rest well and drink water.' })]);
    const engine = new ConversationEngine({ llm: provider, facilities: finder(), aiTimeoutMs: 500 });
    const memory = (await deterministic().handleTurn(newConversationMemory(), input('I have had a high fever for two days'))).memory;
    const out = await engine.handleTurn(memory, input('no'));
    expect(out.response.reply.display).toMatch(/Artemis Hospital/);
  });

  it('survives AI timeouts, rate limits and invalid JSON', async () => {
    for (const failure of [429, 500, new Error('socket hang up'), { content: [{ type: 'text', text: 'hi' }] }, toolUse({ reply: 42 })]) {
      const { provider } = anthropicReturning([failure]);
      const engine = new ConversationEngine({ llm: provider, facilities: finder(), aiTimeoutMs: 500 });
      const memory = (await deterministic().handleTurn(newConversationMemory(), input('I have had a high fever for two days'))).memory;
      const out = await engine.handleTurn(memory, input('no'));
      expect(out.response.phase).toBe('advice');
      expect(out.response.reply.display.length).toBeGreaterThan(20);
      expect(out.response.degraded.some((d) => d.startsWith('ai_'))).toBe(true);
    }
  });

  it('uses AI understanding only as a suspicion that needs deterministic confirmation', async () => {
    const understanding = {
      intent: 'symptom_report',
      language: 'en',
      symptoms: [{ code: 'chest_pain', severity: 'severe' }],
      duration_hours: null,
      age_group: 'adult',
      answer_to_question: null,
      possible_emergency: true,
      emergency_category: 'cardiac',
    };
    const { provider } = anthropicReturning([toolUse(understanding)]);
    const engine = new ConversationEngine({ llm: provider, facilities: finder(), aiTimeoutMs: 500 });
    const first = await engine.handleTurn(newConversationMemory(), input('there is an elephant sitting on me'));
    expect(first.response.phase).toBe('follow_up');
    expect(first.response.emergency).toBeNull();
    expect(first.memory.clinical.pendingSlot).toEqual({ kind: 'red_flag', screen: 'ai_emergency_confirm' });

    const confirmed = await deterministic().handleTurn(first.memory, input('yes'));
    expect(confirmed.response.phase).toBe('emergency');
    expect(confirmed.response.emergency?.category).toBe('cardiac');
  });

  it('ignores AI symptoms that the user negated', async () => {
    const understanding = {
      intent: 'symptom_report', language: 'en', symptoms: [{ code: 'fever', severity: 'mild' }], duration_hours: null,
      age_group: 'unknown', answer_to_question: null, possible_emergency: false, emergency_category: null,
    };
    const { provider } = anthropicReturning([toolUse(understanding)]);
    const engine = new ConversationEngine({ llm: provider, facilities: finder(), aiTimeoutMs: 500 });
    const out = await engine.handleTurn(newConversationMemory(), input('no fever at all, feeling off'));
    expect(out.memory.clinical.aiSymptoms).toEqual([]);
  });

  it('does not call the AI when the rules already understood the message', async () => {
    const llm: LlmProvider = { name: 'anthropic', enriches: true, generate: vi.fn(async (r) => r.fallback) };
    const engine = new ConversationEngine({ llm, facilities: finder(), aiTimeoutMs: 500 });
    await engine.handleTurn(newConversationMemory(), input('I have a fever'));
    expect(llm.generate).not.toHaveBeenCalled();
  });
});

describe('pipeline trace', () => {
  /** Anything a user typed must never appear in a trace that is shown back to them. */
  const SENSITIVE = ['bukhar', 'fever', 'chest', 'seene', 'dard', 'pain', 'sweating'];

  const assertClean = (trace: { stage: string; detail: string | null }[]) => {
    const blob = JSON.stringify(trace).toLowerCase();
    for (const word of SENSITIVE) expect(blob).not.toContain(word);
  };

  it('records the stages in the order they ran, with the emergency check before generation', async () => {
    const engine = deterministic();
    const { last } = await run(engine, ['Mujhe do din se tez bukhar hai']);
    const stages = last.response.trace.map((t) => t.stage);

    expect(stages.slice(0, 4)).toEqual(['language', 'extraction', 'emergency_check', 'intent']);
    expect(stages.indexOf('emergency_check')).toBeLessThan(stages.indexOf('triage'));
    expect(last.response.totalMs).toBeGreaterThanOrEqual(0);
    assertClean(last.response.trace);
  });

  it('marks the stages that did not need to run rather than hiding them', async () => {
    const engine = deterministic();
    const { last } = await run(engine, ['I have had a headache for two days'], { location: undefined as never });
    const ai = last.response.trace.find((t) => t.stage === 'ai_understanding');
    expect(ai).toMatchObject({ ran: false, ms: 0 });
  });

  it('shows that an emergency skipped triage, phrasing and the guard entirely', async () => {
    const engine = deterministic();
    const { last } = await run(engine, ['my father has severe chest pain and is sweating']);
    expect(last.response.emergency).not.toBeNull();

    const byStage = Object.fromEntries(last.response.trace.map((t) => [t.stage, t]));
    expect(byStage['emergency_check']).toMatchObject({ ran: true, detail: 'cardiac' });
    expect(byStage['phrasing']).toMatchObject({ ran: false, detail: 'fixed instructions' });
    expect(byStage['output_guard']).toMatchObject({ ran: false, detail: 'nothing generated' });
    assertClean(last.response.trace);
  });

  it('names which engine answered, so a user can see whether a model was involved', async () => {
    const engine = deterministic();
    const { last } = await run(engine, ['Mujhe do din se bahut tez bukhar hai aur body pain ho raha hai.', 'nahi']);
    const byStage = Object.fromEntries(last.response.trace.map((t) => [t.stage, t]));
    expect(byStage['triage']).toMatchObject({ ran: true });
    // No AI key in this test, so the reply is a template and the guard has nothing to check.
    expect(byStage['phrasing']).toMatchObject({ ran: true, detail: 'template' });
    expect(byStage['output_guard']).toMatchObject({ ran: false });
  });

  it('always reports the full pipeline, with each stage exactly once', async () => {
    const engine = deterministic();
    for (const lines of [['hello'], ['I have had a headache for two days'], ['my father has severe chest pain and is sweating']]) {
      const { last } = await run(engine, lines);
      const stages = last.response.trace.map((t) => t.stage);
      expect(new Set(stages).size).toBe(stages.length);
      expect(stages).toEqual([
        'language',
        'extraction',
        'emergency_check',
        'intent',
        'ai_understanding',
        'follow_up',
        'triage',
        'facilities',
        'phrasing',
        'output_guard',
      ]);
    }
  });
});
