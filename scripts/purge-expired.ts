/**
 * Hard-deletes conversations past their retention window (and expired facility cache rows).
 * Run from cron, e.g. hourly: `npm run db:purge`
 */
import 'dotenv/config';
import { createPrismaClient } from '@sanjeevani/db';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createPrismaClient({ connectionString: url, maxConnections: 1 });
  try {
    const now = new Date();
    const conversations = await db.conversation.deleteMany({ where: { expiresAt: { lt: now } } });
    const cache = await db.facilityCache.deleteMany({ where: { expiresAt: { lt: now } } });
    const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
    const audit = await db.auditEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } } });
    console.log(
      `Purged ${conversations.count} conversations, ${cache.count} cache rows, ${sessions.count} sessions, ${audit.count} audit events (>90 days).`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error('Purge failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
