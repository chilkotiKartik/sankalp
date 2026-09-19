import { z } from 'zod';
import { LlmError, type LlmProvider, type StructuredRequest } from '../../llm/provider';

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface AnthropicContentBlock {
  type: string;
  name?: string;
  input?: unknown;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  error?: { type?: string; message?: string };
}

const TOOL_NAME = 'submit';

/**
 * Claude via the Messages API. Structured output is enforced with a forced tool call;
 * the tool input is then validated with Zod — invalid output is an error, never passed on.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;
  readonly enriches = true;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: AnthropicOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
  }

  async generate<T>(request: StructuredRequest<T>): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? this.options.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.options.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: request.maxTokens ?? 600,
          temperature: 0.2,
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
          tools: [
            {
              name: TOOL_NAME,
              description: request.description,
              input_schema: z.toJSONSchema(request.schema, { target: 'draft-7', io: 'input' }),
            },
          ],
          tool_choice: { type: 'tool', name: TOOL_NAME },
        }),
      });
    } catch (error) {
      if (controller.signal.aborted) throw new LlmError('timeout', `AI request timed out (${request.task})`);
      throw new LlmError('unavailable', `AI request failed: ${(error as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const kind =
        response.status === 429 ? 'rate_limited'
        : response.status === 401 || response.status === 403 ? 'auth'
        : response.status === 400 ? 'bad_request'
        : 'unavailable';
      throw new LlmError(kind, `AI provider responded ${response.status}`, response.status);
    }

    const body = (await response.json()) as AnthropicResponse;
    const block = body.content?.find((b) => b.type === 'tool_use' && b.name === TOOL_NAME);
    if (!block) throw new LlmError('invalid_output', 'AI response had no structured output');
    const parsed = request.schema.safeParse(block.input);
    if (!parsed.success) {
      throw new LlmError('invalid_output', `AI output failed validation: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
    }
    return parsed.data;
  }
}
