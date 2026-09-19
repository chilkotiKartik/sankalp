import { randomBytes } from 'node:crypto';
import { GURUGRAM_FACILITIES, InMemoryFacilityCache } from '@sanjeevani/maps';
import type {
  ConversationRecord,
  MessageRecord,
  SessionRecord,
  Store,
  SymptomEventRecord,
  TriageRecord,
  UserRecord,
} from './types';

/** cuid-shaped ids so route validation behaves the same as with Postgres. */
function id(): string {
  return `c${Date.now().toString(36)}${randomBytes(12).toString('hex')}`.slice(0, 25);
}

/**
 * In-process store for demo mode and tests. Same contract as the Postgres store;
 * data disappears on restart, which is exactly what an anonymous demo wants.
 */
export function createMemoryStore(): Store {
  const users = new Map<string, UserRecord>();
  const sessions = new Map<string, SessionRecord>();
  const conversations = new Map<string, ConversationRecord>();
  const messages = new Map<string, MessageRecord[]>();
  const symptoms = new Map<string, Map<string, SymptomEventRecord>>();
  const triage = new Map<string, (TriageRecord & { createdAt: Date })[]>();
  const emergencies: { category: string | null; action: string; createdAt: Date; userId: string | null; conversationId: string | null }[] = [];
  const feedback: { helpful: boolean; createdAt: Date; userId: string | null; conversationId: string | null }[] = [];

  const dropConversation = (cid: string) => {
    conversations.delete(cid);
    messages.delete(cid);
    symptoms.delete(cid);
    triage.delete(cid);
    for (const e of emergencies) if (e.conversationId === cid) e.conversationId = null;
    for (const f of feedback) if (f.conversationId === cid) f.conversationId = null;
  };

  return {
    kind: 'memory',
    health: async () => true,
    close: async () => undefined,

    users: {
      async create(input) {
        const user: UserRecord = {
          id: id(),
          anonymous: input.anonymous,
          role: input.role ?? 'USER',
          languagePreference: input.languagePreference ?? 'auto',
          createdAt: new Date(),
        };
        users.set(user.id, user);
        return user;
      },
      findById: async (uid) => users.get(uid) ?? null,
      touch: async () => undefined,
      async delete(uid) {
        users.delete(uid);
        for (const [sid, s] of sessions) if (s.userId === uid) sessions.delete(sid);
        for (const [cid, c] of conversations) if (c.userId === uid) dropConversation(cid);
      },
    },

    sessions: {
      async create(input) {
        const session: SessionRecord = { id: id(), revokedAt: null, ...input };
        sessions.set(session.id, session);
        return session;
      },
      findByTokenHash: async (hash) => [...sessions.values()].find((s) => s.tokenHash === hash) ?? null,
      async revoke(sid) {
        const s = sessions.get(sid);
        if (s) s.revokedAt = new Date();
      },
    },

    conversations: {
      async create(input) {
        const now = new Date();
        const c: ConversationRecord = {
          id: id(),
          userId: input.userId,
          language: input.language,
          phase: 'greeting',
          urgency: null,
          emergency: false,
          stateCiphertext: null,
          turnCount: 0,
          areaGeohash: null,
          createdAt: now,
          updatedAt: now,
          expiresAt: input.expiresAt,
        };
        conversations.set(c.id, c);
        return c;
      },
      async findForUser(cid, uid) {
        const c = conversations.get(cid);
        return c && c.userId === uid ? { ...c } : null;
      },
      async listForUser(uid, limit) {
        return [...conversations.values()]
          .filter((c) => c.userId === uid && c.turnCount > 0)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, limit)
          .map((c) => ({ ...c, symptomCodes: [...(symptoms.get(c.id)?.keys() ?? [])] }));
      },
      async persistTurn(input) {
        const c = conversations.get(input.conversationId);
        if (!c) throw new Error('Conversation not found');
        Object.assign(c, input.conversationPatch, { updatedAt: new Date() });
        const list = messages.get(c.id) ?? [];
        const now = Date.now();
        list.push({ ...input.userMessage, id: id(), conversationId: c.id, createdAt: new Date(now) });
        const assistant: MessageRecord = { ...input.assistantMessage, id: id(), conversationId: c.id, createdAt: new Date(now + 1) };
        list.push(assistant);
        messages.set(c.id, list);
        const sym = symptoms.get(c.id) ?? new Map<string, SymptomEventRecord>();
        for (const s of input.symptoms) {
          const prev = sym.get(s.code);
          sym.set(s.code, { ...s, createdAt: prev?.createdAt ?? new Date() });
        }
        symptoms.set(c.id, sym);
        if (input.triage) {
          const t = triage.get(c.id) ?? [];
          t.push({ ...input.triage, conversationId: c.id, createdAt: new Date() });
          triage.set(c.id, t);
        }
        if (input.emergency) {
          emergencies.push({ category: input.emergency.category, action: 'DETECTED', createdAt: new Date(), userId: c.userId, conversationId: c.id });
        }
        return { assistantMessageId: assistant.id };
      },
      async delete(cid, uid) {
        const c = conversations.get(cid);
        if (!c || c.userId !== uid) return false;
        dropConversation(cid);
        return true;
      },
      async deleteAllForUser(uid) {
        let n = 0;
        for (const [cid, c] of conversations) {
          if (c.userId === uid) {
            dropConversation(cid);
            n++;
          }
        }
        return n;
      },
      async purgeExpired(now) {
        let n = 0;
        for (const [cid, c] of conversations) {
          if (c.expiresAt < now) {
            dropConversation(cid);
            n++;
          }
        }
        return n;
      },
      async updateState(cid, stateCiphertext, phase) {
        const c = conversations.get(cid);
        if (c) Object.assign(c, { stateCiphertext, phase, updatedAt: new Date() });
      },
    },

    messages: {
      listRecent: async (cid, limit) => (messages.get(cid) ?? []).slice(-limit),
    },
    symptoms: {
      list: async (cid) => [...(symptoms.get(cid)?.values() ?? [])],
    },
    triage: {
      latest: async (cid) => triage.get(cid)?.at(-1) ?? null,
    },
    emergencies: {
      async add(input) {
        emergencies.push({ ...input, createdAt: new Date() });
      },
      async countByCategory(since) {
        const out: Record<string, number> = {};
        for (const e of emergencies) {
          if (e.createdAt >= since && e.action === 'DETECTED') out[e.category ?? 'unknown'] = (out[e.category ?? 'unknown'] ?? 0) + 1;
        }
        return out;
      },
    },
    feedback: {
      async add(input) {
        feedback.push({ helpful: input.helpful, createdAt: new Date(), userId: input.userId, conversationId: input.conversationId });
      },
      async stats(since) {
        const rows = feedback.filter((f) => f.createdAt >= since);
        return { total: rows.length, helpful: rows.filter((f) => f.helpful).length };
      },
    },
    audit: {
      add: async () => undefined,
    },
    facilities: {
      listCurated: async (regionId) => GURUGRAM_FACILITIES.filter((f) => f.regionId === regionId),
    },
    facilityCache: new InMemoryFacilityCache(),
  };
}
