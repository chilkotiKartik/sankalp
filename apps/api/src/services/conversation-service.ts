import {
  newConversationMemory,
  type ConversationEngine,
  type ConversationMemory,
  type TurnInput,
} from '@sanjeevani/ai';
import { geohash } from '@sanjeevani/maps';
import { languageSchema, triageResultSchema, urgencySchema, type ConversationDetail, type ConversationSummary, type EmergencyActionRequest, type Language, type TurnRequest, type TurnResponse } from '@sanjeevani/types';
import type { FieldCipher } from '../lib/crypto';
import { AppError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { ConversationRecord, EmergencyActionKind, Store } from '../repositories/types';
import type { AuthContext } from './auth-service';

const RECENT_TURNS = 6;

const ACTION_MAP: Record<EmergencyActionRequest['action'], EmergencyActionKind> = {
  call_initiated: 'CALL_INITIATED',
  location_shared: 'LOCATION_SHARED',
  directions_opened: 'DIRECTIONS_OPENED',
  dismissed: 'DISMISSED',
};

function asLanguage(value: string): Language {
  const parsed = languageSchema.safeParse(value);
  return parsed.success ? parsed.data : 'en';
}

export class ConversationService {
  constructor(
    private readonly store: Store,
    private readonly engine: ConversationEngine,
    private readonly cipher: FieldCipher,
    private readonly logger: Logger,
    private readonly retentionDays: number,
  ) {}

  private expiry(): Date {
    // Retention 0 means "keep only for this session" — purge after a day at most.
    const days = this.retentionDays === 0 ? 1 : this.retentionDays;
    return new Date(Date.now() + days * 86_400_000);
  }

  private async requireConversation(id: string, auth: AuthContext): Promise<ConversationRecord> {
    const conversation = await this.store.conversations.findForUser(id, auth.userId);
    if (!conversation) throw AppError.notFound('Conversation not found.');
    return conversation;
  }

  private readMemory(conversation: ConversationRecord): ConversationMemory {
    if (!conversation.stateCiphertext) return newConversationMemory();
    try {
      const memory = this.cipher.decryptJson<ConversationMemory>(conversation.stateCiphertext);
      // Tolerate state written by an older version. Stored triage is re-parsed through
      // the schema so fields added since it was written get their defaults, rather than
      // arriving as undefined in a client that reasonably expects them.
      const restored = { ...newConversationMemory(), ...memory, clinical: { ...newConversationMemory().clinical, ...memory.clinical } };
      if (restored.lastTriage) {
        const parsed = triageResultSchema.safeParse(restored.lastTriage);
        restored.lastTriage = parsed.success ? parsed.data : null;
      }
      return restored;
    } catch (error) {
      this.logger.warn({ err: error, conversationId: conversation.id }, 'could not decrypt conversation state; starting fresh');
      return newConversationMemory();
    }
  }

  async create(auth: AuthContext, languagePreference: string) {
    const language = languagePreference === 'auto' ? 'en' : languagePreference;
    const conversation = await this.store.conversations.create({ userId: auth.userId, language, expiresAt: this.expiry() });
    return { id: conversation.id, createdAt: conversation.createdAt.toISOString(), expiresAt: conversation.expiresAt.toISOString() };
  }

  async turn(auth: AuthContext, conversationId: string, request: TurnRequest): Promise<TurnResponse> {
    // Loading state must never block emergency guidance: on a database failure we run
    // the turn with fresh memory and report the degradation.
    let conversation: ConversationRecord | null = null;
    let memory = newConversationMemory();
    let recentTurns: TurnInput['recentTurns'] = [];
    let persistenceDown = false;
    try {
      conversation = await this.requireConversation(conversationId, auth);
      memory = this.readMemory(conversation);
      const recent = await this.store.messages.listRecent(conversation.id, RECENT_TURNS);
      recentTurns = recent.flatMap((m) => {
        try {
          return [{ role: m.role === 'USER' ? ('user' as const) : ('assistant' as const), text: this.cipher.decrypt(m.contentCiphertext) }];
        } catch {
          return [];
        }
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error({ err: error, conversationId }, 'conversation load failed; continuing without history');
      persistenceDown = true;
    }

    const outcome = await this.engine.handleTurn(memory, {
      text: request.text,
      inputMode: request.inputMode,
      languagePreference: request.languagePreference,
      recentTurns,
      ...(request.sttLanguage ? { sttLanguage: request.sttLanguage } : {}),
      ...(request.location ? { location: request.location } : {}),
    });
    const { response, memory: nextMemory, events, telemetry } = outcome;

    let turnId = `t_${Date.now().toString(36)}`;
    if (conversation && !persistenceDown) {
      try {
        const saved = await this.store.conversations.persistTurn({
          conversationId: conversation.id,
          conversationPatch: {
            language: response.language,
            phase: response.phase,
            urgency: nextMemory.lastTriage?.urgency ?? conversation.urgency,
            emergency: conversation.emergency || response.phase === 'emergency',
            stateCiphertext: this.cipher.encryptJson(nextMemory),
            turnCount: conversation.turnCount + 1,
            areaGeohash: request.location ? geohash(request.location, 5) : conversation.areaGeohash,
            expiresAt: this.expiry(),
          },
          userMessage: {
            role: 'USER',
            contentCiphertext: this.cipher.encrypt(request.text),
            inputMode: request.inputMode,
            language: response.language,
            intent: response.intent,
          },
          assistantMessage: {
            role: 'ASSISTANT',
            contentCiphertext: this.cipher.encrypt(response.reply.display),
            inputMode: null,
            language: response.language,
            intent: response.phase,
          },
          symptoms: events.symptoms.map((s) => ({
            code: s.code,
            severity: s.severity,
            reportedDurationHours: nextMemory.clinical.duration?.hours ?? null,
          })),
          triage: events.triage
            ? {
                urgency: events.triage.urgency,
                emergency: events.triage.emergency,
                emergencyCategory: events.triage.emergencyCategory,
                specialty: events.triage.specialty,
                facilityType: events.triage.requiredFacilityType,
                confidence: events.triage.confidence,
                source: events.triage.source,
                symptomCodes: events.triage.symptoms.map((s) => s.code),
                rationale: events.triage.rationale,
              }
            : null,
          emergency: events.emergency ? { userId: auth.userId, ...events.emergency } : null,
        });
        turnId = saved.assistantMessageId;
      } catch (error) {
        this.logger.error({ err: error, conversationId }, 'failed to persist turn');
        persistenceDown = true;
      }
    }

    this.logger.info(
      {
        conversationId,
        phase: response.phase,
        urgency: events.triage?.urgency ?? null,
        emergency: events.emergency?.category ?? null,
        aiUnderstanding: telemetry.aiUnderstandingUsed,
        aiPhrasing: telemetry.aiPhrasingUsed,
        aiError: telemetry.aiError,
        guardViolations: telemetry.guardViolations,
        engineMs: telemetry.durationMs,
      },
      'turn handled',
    );

    return {
      ...response,
      conversationId,
      turnId,
      degraded: persistenceDown ? [...response.degraded, 'persistence_unavailable'] : response.degraded,
    };
  }

  async recordEmergencyAction(auth: AuthContext | undefined, request: EmergencyActionRequest): Promise<void> {
    let conversationId: string | null = null;
    if (auth && request.conversationId) {
      const conversation = await this.store.conversations.findForUser(request.conversationId, auth.userId);
      if (conversation) {
        conversationId = conversation.id;
        if (request.action === 'dismissed') {
          const memory = this.engine.dismissEmergency(this.readMemory(conversation));
          await this.store.conversations.updateState(conversation.id, this.cipher.encryptJson(memory), memory.phase);
        }
      }
    }
    await this.store.emergencies.add({
      userId: auth?.userId ?? null,
      conversationId,
      category: request.category ?? null,
      ruleIds: [],
      action: ACTION_MAP[request.action],
    });
  }

  async list(auth: AuthContext): Promise<ConversationSummary[]> {
    const rows = await this.store.conversations.listForUser(auth.userId, 30);
    return rows.map((c) => ({
      id: c.id,
      startedAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      language: asLanguage(c.language),
      urgency: c.urgency ? (urgencySchema.safeParse(c.urgency).data ?? null) : null,
      emergency: c.emergency,
      symptomCodes: c.symptomCodes,
      turnCount: c.turnCount,
    }));
  }

  async detail(auth: AuthContext, id: string): Promise<ConversationDetail> {
    const c = await this.requireConversation(id, auth);
    const [messages, symptoms] = await Promise.all([
      this.store.messages.listRecent(c.id, 200),
      this.store.symptoms.list(c.id),
    ]);
    const memory = this.readMemory(c);
    return {
      id: c.id,
      startedAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      language: asLanguage(c.language),
      urgency: c.urgency ? (urgencySchema.safeParse(c.urgency).data ?? null) : null,
      emergency: c.emergency,
      symptomCodes: symptoms.map((s) => s.code),
      turnCount: c.turnCount,
      messages: messages.flatMap((m) => {
        try {
          return [{
            id: m.id,
            role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
            text: this.cipher.decrypt(m.contentCiphertext),
            createdAt: m.createdAt.toISOString(),
          }];
        } catch {
          return [];
        }
      }),
      latestTriage: memory.lastTriage,
      timeline: symptoms.map((s) => ({
        code: s.code,
        severity: s.severity,
        firstReportedAt: s.createdAt.toISOString(),
        reportedDurationHours: s.reportedDurationHours,
      })),
    };
  }

  async remove(auth: AuthContext, id: string): Promise<void> {
    const removed = await this.store.conversations.delete(id, auth.userId);
    if (!removed) throw AppError.notFound('Conversation not found.');
  }
}
