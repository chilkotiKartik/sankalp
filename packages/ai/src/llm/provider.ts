import type { z } from 'zod';

export type LlmTask = 'understand' | 'phrase';

export interface StructuredRequest<T> {
  task: LlmTask;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Tool description shown to the model. */
  description: string;
  /** Deterministic answer — returned by the mock provider and used upstream on any failure. */
  fallback: T;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LlmProvider {
  readonly name: 'anthropic' | 'gemini' | 'deterministic';
  /** true when the provider adds information beyond the deterministic fallback. */
  readonly enriches: boolean;
  generate<T>(request: StructuredRequest<T>): Promise<T>;
}

export type LlmErrorKind = 'timeout' | 'rate_limited' | 'unavailable' | 'invalid_output' | 'auth' | 'bad_request';

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
