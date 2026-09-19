import type { LlmProvider, StructuredRequest } from '../../llm/provider';

/**
 * Offline provider for demo mode and tests. It never invents content: every task
 * returns the deterministic fallback computed by the rules engine and templates.
 */
export class DeterministicProvider implements LlmProvider {
  readonly name = 'deterministic' as const;
  readonly enriches = false;

  async generate<T>(request: StructuredRequest<T>): Promise<T> {
    return request.schema.parse(request.fallback);
  }
}
