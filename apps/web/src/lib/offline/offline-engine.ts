import type { ConversationEngine, ConversationMemory } from '@sanjeevani/ai';
import type { TurnRequest, TurnResponse } from '@sanjeevani/types';

/**
 * Triage that keeps working when the network does not.
 *
 * ## Why this exists
 *
 * The people this app is for are disproportionately on patchy connections — and the
 * moment you most need to know whether something is an emergency is not a moment to
 * discover that the server is unreachable. The safety rules have no dependency on the
 * network: they are deterministic TypeScript over a lexicon. So they can run here.
 *
 * ## It is the same engine, not a copy
 *
 * This loads `ConversationEngine` — the identical class the API runs — with the
 * deterministic provider and a facility finder that returns nothing. There is no second
 * implementation of the rules to drift out of step with the first. Whatever the server
 * would have decided about urgency, this decides too.
 *
 * ## What is honestly lost offline
 *
 * - **Hospitals.** Finding them needs a network, full stop. Results say `needs_location`
 *   and the UI explains why rather than showing a stale list.
 * - **Natural phrasing.** Replies come from the localised templates. No model is called.
 * - **History.** Nothing is persisted server-side, so the turn does not appear in
 *   History. The response is marked `persistence_unavailable`, the same flag the server
 *   uses when its own database is unreachable.
 *
 * What is *not* lost: language detection, symptom extraction, the emergency circuit
 * breaker, follow-up questions, triage and every warning sign. The emergency numbers
 * are bundled client-side already, so a full emergency screen works with no network at
 * all.
 */

/**
 * Loaded on demand and kept, so the cost is paid once and never on the critical path.
 * The types are imported statically (erased at build time); only the implementation is
 * pulled in dynamically.
 */
let enginePromise: Promise<{ engine: ConversationEngine; freshMemory: () => ConversationMemory }> | null = null;

async function load() {
  const { ConversationEngine, DeterministicProvider, newConversationMemory } = await import('@sanjeevani/ai');
  const engine = new ConversationEngine({
    llm: new DeterministicProvider(),
    // Facilities need a network. Saying so is better than showing a stale list.
    facilities: { find: async () => ({ facilities: [], status: 'needs_location' as const }) },
    aiTimeoutMs: 0,
  });
  return { engine, freshMemory: newConversationMemory };
}

/**
 * Builds the engine and keeps it, so the cost is paid once. The caller decides *when*
 * — this module is itself dynamically imported, so simply reaching this function has
 * already pulled the code across.
 */
export function warmOfflineEngine(): void {
  if (enginePromise) return;
  enginePromise = load().catch((error: unknown) => {
    // A failed warm-up must never break the online app; it is retried on first use.
    enginePromise = null;
    throw error;
  });
  void enginePromise.catch(() => undefined);
}

/** In-memory conversation state for the offline session. */
const memories = new Map<string, ConversationMemory>();

export const OFFLINE_CONVERSATION_ID = 'offline';

/**
 * Runs one turn entirely in the browser.
 *
 * Throws if the engine could not be loaded — the caller must treat that as "offline
 * triage unavailable" and say so, rather than silently producing nothing.
 */
export async function offlineTurn(request: TurnRequest, conversationId = OFFLINE_CONVERSATION_ID): Promise<TurnResponse> {
  enginePromise ??= load();
  const { engine, freshMemory } = await enginePromise;

  const previous = memories.get(conversationId) ?? freshMemory();
  const outcome = await engine.handleTurn(previous, {
    text: request.text,
    inputMode: request.inputMode ?? 'text',
    languagePreference: request.languagePreference ?? 'auto',
    ...(request.sttLanguage ? { sttLanguage: request.sttLanguage } : {}),
    // Location is deliberately dropped: with no network there is nothing to look up,
    // and passing it would only produce an empty list that looks like a failure.
    recentTurns: [],
  });
  memories.set(conversationId, outcome.memory);

  return {
    ...outcome.response,
    conversationId,
    turnId: `offline-${Date.now().toString(36)}`,
    // Nothing was written anywhere. The UI uses this to explain the missing history.
    degraded: [...new Set([...outcome.response.degraded, 'persistence_unavailable' as const])],
  };
}

/** Clears offline state — used by "new conversation" and by privacy deletion. */
export function resetOffline(conversationId?: string): void {
  if (conversationId) memories.delete(conversationId);
  else memories.clear();
}

/** True once the engine is loaded and a turn can be served without a network. */
export function offlineReady(): boolean {
  return enginePromise !== null;
}
