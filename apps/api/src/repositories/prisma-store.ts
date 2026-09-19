import type { CuratedFacilityRecord } from '@sanjeevani/maps';
import { createPrismaClient, type PrismaClient } from '@sanjeevani/db';
import type { Facility } from '@sanjeevani/types';
import type { ConversationRecord, Store } from './types';

export function createPrismaStore(connectionString: string, maxConnections?: number): Store & { client: PrismaClient } {
  const db = createPrismaClient({ connectionString, ...(maxConnections ? { maxConnections } : {}) });

  const store: Store & { client: PrismaClient } = {
    kind: 'postgres',
    client: db,

    async health() {
      try {
        await db.$queryRaw`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    },

    async close() {
      await db.$disconnect();
    },

    users: {
      async create(input) {
        return db.user.create({
          data: { anonymous: input.anonymous, role: input.role ?? 'USER', languagePreference: input.languagePreference ?? 'auto' },
        });
      },
      findById: (id) => db.user.findUnique({ where: { id } }),
      async touch(id) {
        await db.user.update({ where: { id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
      },
      async delete(id) {
        await db.user.delete({ where: { id } }).catch(() => undefined);
      },
    },

    sessions: {
      create: (input) => db.session.create({ data: input }),
      findByTokenHash: (tokenHash) => db.session.findUnique({ where: { tokenHash } }),
      async revoke(id) {
        await db.session.update({ where: { id }, data: { revokedAt: new Date() } }).catch(() => undefined);
      },
    },

    conversations: {
      create: (input) => db.conversation.create({ data: input }),
      findForUser: (id, userId) => db.conversation.findFirst({ where: { id, userId } }),
      async listForUser(userId, limit) {
        const rows = await db.conversation.findMany({
          where: { userId, turnCount: { gt: 0 } },
          orderBy: { updatedAt: 'desc' },
          take: limit,
          include: { symptomEvents: { select: { code: true }, orderBy: { createdAt: 'asc' } } },
        });
        return rows.map(({ symptomEvents, ...c }) => ({ ...(c as ConversationRecord), symptomCodes: symptomEvents.map((s) => s.code) }));
      },
      async persistTurn(input) {
        return db.$transaction(async (tx) => {
          const conversation = await tx.conversation.update({
            where: { id: input.conversationId },
            data: input.conversationPatch,
            select: { userId: true },
          });
          await tx.conversationMessage.create({ data: { ...input.userMessage, conversationId: input.conversationId } });
          const assistant = await tx.conversationMessage.create({
            data: { ...input.assistantMessage, conversationId: input.conversationId },
            select: { id: true },
          });
          for (const s of input.symptoms) {
            await tx.symptomEvent.upsert({
              where: { conversationId_code: { conversationId: input.conversationId, code: s.code } },
              create: { conversationId: input.conversationId, ...s },
              update: { severity: s.severity, reportedDurationHours: s.reportedDurationHours },
            });
          }
          if (input.triage) await tx.triageResult.create({ data: { ...input.triage, conversationId: input.conversationId } });
          if (input.emergency) {
            await tx.emergencyEvent.create({
              data: {
                userId: conversation.userId,
                conversationId: input.conversationId,
                category: input.emergency.category,
                ruleIds: input.emergency.ruleIds,
                action: 'DETECTED',
              },
            });
          }
          return { assistantMessageId: assistant.id };
        });
      },
      async delete(id, userId) {
        const result = await db.conversation.deleteMany({ where: { id, userId } });
        return result.count > 0;
      },
      async deleteAllForUser(userId) {
        const result = await db.conversation.deleteMany({ where: { userId } });
        return result.count;
      },
      async purgeExpired(now) {
        const result = await db.conversation.deleteMany({ where: { expiresAt: { lt: now } } });
        await db.facilityCache.deleteMany({ where: { expiresAt: { lt: now } } });
        return result.count;
      },
      async updateState(id, stateCiphertext, phase) {
        await db.conversation.update({ where: { id }, data: { stateCiphertext, phase } });
      },
    },

    messages: {
      async listRecent(conversationId, limit) {
        const rows = await db.conversationMessage.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        return rows.reverse();
      },
    },

    symptoms: {
      list: (conversationId) =>
        db.symptomEvent.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'asc' },
          select: { code: true, severity: true, reportedDurationHours: true, createdAt: true },
        }),
    },

    triage: {
      latest: (conversationId) => db.triageResult.findFirst({ where: { conversationId }, orderBy: { createdAt: 'desc' } }),
    },

    emergencies: {
      async add(input) {
        await db.emergencyEvent.create({ data: input });
      },
      async countByCategory(since) {
        const rows = await db.emergencyEvent.groupBy({
          by: ['category'],
          where: { createdAt: { gte: since }, action: 'DETECTED' },
          _count: { _all: true },
        });
        return Object.fromEntries(rows.map((r) => [r.category ?? 'unknown', r._count._all]));
      },
    },

    feedback: {
      async add(input) {
        await db.feedback.create({ data: input });
      },
      async stats(since) {
        const [total, helpful] = await Promise.all([
          db.feedback.count({ where: { createdAt: { gte: since } } }),
          db.feedback.count({ where: { createdAt: { gte: since }, helpful: true } }),
        ]);
        return { total, helpful };
      },
    },

    audit: {
      async add(input) {
        await db.auditEvent.create({
          data: {
            userId: input.userId ?? null,
            action: input.action,
            resourceType: input.resourceType,
            resourceId: input.resourceId ?? null,
            requestId: input.requestId ?? null,
            ipHash: input.ipHash ?? null,
            metadata: input.metadata ?? {},
          },
        });
      },
    },

    facilities: {
      async listCurated(regionId) {
        const rows = await db.facility.findMany({ where: { regionId, active: true, source: 'CURATED_DIRECTORY' } });
        return rows.map(
          (r): CuratedFacilityRecord => ({
            slug: r.externalId,
            regionId: r.regionId,
            name: r.name,
            address: r.address,
            lat: r.lat,
            lng: r.lng,
            coordinatesApprox: r.coordinatesApprox,
            phone: r.phone,
            emergencyPhone: r.emergencyPhone,
            types: r.types as CuratedFacilityRecord['types'],
            verifiedSpecialties: r.verifiedSpecialties as CuratedFacilityRecord['verifiedSpecialties'],
            emergency24x7: r.emergency24x7,
            ownership: (r.ownership as CuratedFacilityRecord['ownership']) ?? null,
            website: r.website,
            sourceUrl: r.sourceUrl ?? '',
            sourceLabel: r.sourceUrl ? new URL(r.sourceUrl).hostname.replace(/^www\./, '') : 'Curated',
            verifiedOn: r.verifiedOn ?? '',
          }),
        );
      },
    },

    facilityCache: {
      async get(key) {
        const row = await db.facilityCache.findUnique({ where: { cacheKey: key } });
        if (!row || row.expiresAt < new Date()) return null;
        return row.payload as unknown as Facility[];
      },
      async set(key, value, ttlSeconds) {
        if (ttlSeconds <= 0) return;
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        const placeIds = value.map((f) => f.placeId).filter((p): p is string => Boolean(p));
        const payload = JSON.parse(JSON.stringify(value));
        await db.facilityCache.upsert({
          where: { cacheKey: key },
          create: { cacheKey: key, provider: value[0]?.source.provider ?? 'unknown', placeIds, payload, expiresAt },
          update: { placeIds, payload, expiresAt },
        });
      },
    },
  };
  return store;
}
