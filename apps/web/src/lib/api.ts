import type {
  Capabilities,
  ClientLocation,
  ConversationDetail,
  ConversationSummary,
  EmergencyActionRequest,
  FacilitiesResponse,
  FeedbackRequest,
  Language,
  LanguagePreference,
  RankedFacility,
  TranscriptionResponse,
  TurnResponse,
} from '@sanjeevani/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork() {
    return this.status === 0;
  }
}

const BASE = '/api';
let sessionPromise: Promise<void> | null = null;

function linkSignal(external: AbortSignal | null | undefined, controller: AbortController) {
  if (!external) return;
  if (external.aborted) controller.abort();
  else external.addEventListener('abort', () => controller.abort(), { once: true });
}

async function raw(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  linkSignal(init.signal, controller);
  const signal = controller.signal;
  try {
    return await fetch(`${BASE}${path}`, { credentials: 'same-origin', ...init, signal });
  } catch (error) {
    if ((error as Error).name === 'AbortError' && init.signal?.aborted) throw error;
    throw new ApiError(0, controller.signal.aborted ? 'timeout' : 'network', 'You seem to be offline. Emergency numbers still work.');
  } finally {
    clearTimeout(timer);
  }
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(res.status, body.error?.code ?? 'error', body.error?.message ?? 'Something went wrong.');
  } catch {
    return new ApiError(res.status, 'error', res.status === 502 || res.status === 504 ? 'The service is unreachable right now.' : 'Something went wrong.');
  }
}

export function ensureSession(force = false): Promise<void> {
  if (!sessionPromise || force) {
    sessionPromise = raw('/v1/auth/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }).then(async (res) => {
      if (!res.ok) {
        sessionPromise = null;
        throw await toError(res);
      }
    });
  }
  return sessionPromise;
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}, auth = true): Promise<T> {
  if (auth) await ensureSession();
  let res = await raw(path, init);
  if (res.status === 401 && auth) {
    await ensureSession(true);
    res = await raw(path, init);
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  capabilities: () => request<Capabilities>('/v1/capabilities', {}, false),

  createConversation: (languagePreference: LanguagePreference) =>
    request<{ id: string }>('/v1/conversations', json({ languagePreference })),

  sendTurn: (
    conversationId: string,
    body: { text: string; inputMode: 'voice' | 'text' | 'quick_reply'; sttLanguage?: string; languagePreference: LanguagePreference; location?: ClientLocation },
    signal?: AbortSignal,
  ) => request<TurnResponse>(`/v1/conversations/${conversationId}/turns`, { ...json(body), timeoutMs: 30_000, ...(signal ? { signal } : {}) }),

  listConversations: () => request<{ conversations: ConversationSummary[] }>('/v1/conversations'),
  conversation: (id: string) => request<ConversationDetail>(`/v1/conversations/${id}`),
  deleteConversation: (id: string) => request<void>(`/v1/conversations/${id}`, { method: 'DELETE' }),

  emergencyAction: (body: EmergencyActionRequest) =>
    body.conversationId
      ? request<void>(`/v1/conversations/${body.conversationId}/emergency-actions`, json(body))
      : request<void>('/v1/emergency/events', json(body), false),

  facilities: (params: { lat: number; lng: number; type?: string; specialty?: string; urgency?: string; limit?: number; language?: Language }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
    return request<FacilitiesResponse & { provider: string }>(`/v1/facilities?${q}`, {}, false);
  },

  facility: (id: string, params: { lat?: number; lng?: number; language?: Language }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
    return request<{ facility: RankedFacility; hasOrigin: boolean }>(`/v1/facilities/${encodeURIComponent(id)}?${q}`, {}, false);
  },

  transcribe: async (audio: Blob, languageHint?: Language) => {
    const form = new FormData();
    form.append('audio', audio, `speech.${audio.type.includes('mp4') ? 'mp4' : 'webm'}`);
    if (languageHint) form.append('languageHint', languageHint);
    return request<TranscriptionResponse>('/v1/voice/transcribe', { method: 'POST', body: form, timeoutMs: 25_000 });
  },

  /** Returns the streaming response so audio can start playing before it fully downloads. */
  speak: async (text: string, language: Language, signal?: AbortSignal) => {
    await ensureSession();
    const res = await raw('/v1/voice/speak', { ...json({ text, language }), timeoutMs: 20_000, ...(signal ? { signal } : {}) });
    if (!res.ok) throw await toError(res);
    return res;
  },

  feedback: (body: FeedbackRequest) => request<{ received: boolean }>('/v1/feedback', json(body)),
  privacySummary: () =>
    request<{ conversations: number; retentionDays: number; encryptedAtRest: boolean; oldestExpiry: string | null }>('/v1/privacy/summary'),
  deleteAllData: async () => {
    const result = await request<{ deletedConversations: number }>('/v1/privacy/data', { method: 'DELETE' });
    sessionPromise = null;
    return result;
  },
};
