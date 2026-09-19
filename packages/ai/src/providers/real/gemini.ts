import { z } from 'zod';
import { LlmError, type LlmProvider, type StructuredRequest } from '../../llm/provider';

export interface GeminiOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const TOOL_NAME = 'submit';

/**
 * Pinning the API revision keeps the request and response shapes stable even when
 * Google ships a breaking change to the unpinned default.
 * @see https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026
 */
export const GEMINI_API_REVISION = '2026-05-20';
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

/* ── Response shapes ────────────────────────────────────────────────────────
 * Two surfaces are in play: the current Interactions API (`steps[]`) and the
 * older `models/*:generateContent` (`candidates[]`). We accept either, because a
 * key issued against an older project can still be routed to the latter, and a
 * fallback that costs twenty lines is cheaper than an outage.
 */

interface InteractionsStep {
  type?: string;
  name?: string;
  arguments?: unknown;
  args?: unknown;
  content?: { type?: string; text?: string }[];
}

interface GenerateContentPart {
  text?: string;
  functionCall?: { name?: string; args?: unknown };
}

interface GeminiResponse {
  steps?: InteractionsStep[];
  candidates?: { content?: { parts?: GenerateContentPart[] } }[];
  error?: { code?: number; message?: string; status?: string };
}

/** Pulls the arguments of the forced function call out of whichever shape came back. */
export function extractToolArguments(body: GeminiResponse, toolName = TOOL_NAME): unknown {
  for (const step of body.steps ?? []) {
    if (step.type === 'function_call' && (step.name === toolName || !step.name)) {
      return step.arguments ?? step.args;
    }
  }
  for (const candidate of body.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.functionCall && (part.functionCall.name === toolName || !part.functionCall.name)) {
        return part.functionCall.args;
      }
    }
  }
  return undefined;
}

/** Last resort: a model that answered in prose despite the forced call may still have emitted JSON. */
export function extractText(body: GeminiResponse): string | undefined {
  const chunks: string[] = [];
  for (const step of body.steps ?? []) {
    for (const item of step.content ?? []) {
      if (item.type === 'text' && item.text) chunks.push(item.text);
    }
  }
  for (const candidate of body.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.text) chunks.push(part.text);
    }
  }
  const joined = chunks.join('').trim();
  return joined.length > 0 ? joined : undefined;
}

function parseLooseJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/**
 * JSON Schema as emitted by Zod carries keywords Gemini's function declarations
 * reject (`$schema`, `additionalProperties`, `const`, …). This keeps the subset the
 * API documents: type, description, enum, properties, required, items.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const source = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  // A single-value const is an enum of one; anyOf/oneOf of consts is a plain enum.
  if (typeof source['const'] === 'string') return { type: 'string', enum: [source['const']] };
  const union = (source['anyOf'] ?? source['oneOf']) as Record<string, unknown>[] | undefined;
  if (Array.isArray(union)) {
    const consts = union.map((m) => m['const']).filter((v): v is string => typeof v === 'string');
    if (consts.length === union.length && consts.length > 0) return { type: 'string', enum: consts };
    // Nullable unions: keep the one real member.
    const real = union.filter((m) => m['type'] !== 'null');
    if (real.length === 1) return toGeminiSchema(real[0]);
  }

  for (const key of ['type', 'description', 'enum', 'format'] as const) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  if (Array.isArray(out['type'])) {
    out['type'] = (out['type'] as string[]).find((t) => t !== 'null') ?? 'string';
  }
  if (source['properties'] && typeof source['properties'] === 'object') {
    const props: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(source['properties'] as Record<string, unknown>)) {
      props[name] = toGeminiSchema(value);
    }
    out['properties'] = props;
    out['type'] ??= 'object';
  }
  if (Array.isArray(source['required']) && source['required'].length > 0) out['required'] = source['required'];
  if (source['items']) {
    out['items'] = toGeminiSchema(source['items']);
    out['type'] ??= 'array';
  }
  return out;
}

function errorKind(status: number): 'rate_limited' | 'auth' | 'bad_request' | 'unavailable' {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (status === 400 || status === 404) return 'bad_request';
  return 'unavailable';
}

/**
 * Gemini via the Interactions API. Structured output is enforced with a forced
 * function call and the arguments are then validated with Zod — invalid output is
 * an error here, never something that reaches a user. The engine above caps what
 * this provider may influence; it can never raise an emergency on its own.
 *
 * @see https://ai.google.dev/api/interactions-api
 * @see https://ai.google.dev/gemini-api/docs/function-calling
 */
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini' as const;
  readonly enriches = true;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: GeminiOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? GEMINI_BASE_URL;
  }

  async generate<T>(request: StructuredRequest<T>): Promise<T> {
    const parameters = toGeminiSchema(z.toJSONSchema(request.schema, { target: 'draft-7', io: 'input' }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? this.options.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1beta/interactions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.options.apiKey,
          'api-revision': GEMINI_API_REVISION,
        },
        body: JSON.stringify({
          model: this.options.model,
          input: request.prompt,
          system_instruction: request.system,
          tools: [{ type: 'function', name: TOOL_NAME, description: request.description, parameters }],
          generation_config: {
            temperature: 0.2,
            max_output_tokens: request.maxTokens ?? 600,
            thinking_level: 'low',
            tool_choice: { allowed_tools: { mode: 'any', tools: [TOOL_NAME] } },
          },
        }),
      });
    } catch (error) {
      if (controller.signal.aborted) throw new LlmError('timeout', `AI request timed out (${request.task})`);
      throw new LlmError('unavailable', `AI request failed: ${(error as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new LlmError(errorKind(response.status), `AI provider responded ${response.status}`, response.status);
    }

    const body = (await response.json()) as GeminiResponse;
    if (body.error) throw new LlmError('unavailable', `AI provider error: ${body.error.status ?? body.error.message ?? 'unknown'}`);

    const args = extractToolArguments(body) ?? (() => {
      const text = extractText(body);
      return text ? parseLooseJson(text) : undefined;
    })();
    if (args === undefined) throw new LlmError('invalid_output', 'AI response had no structured output');

    const parsed = request.schema.safeParse(args);
    if (!parsed.success) {
      throw new LlmError('invalid_output', `AI output failed validation: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
    }
    return parsed.data;
  }
}
