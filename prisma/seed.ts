/**
 * Seeds the curated facility directory (Gurugram). Idempotent — safe to run repeatedly.
 * Google Places results are never seeded: they are fetched live and cached briefly.
 */
import 'dotenv/config';
import { createPrismaClient } from '@sanjeevani/db';
import { GURUGRAM_FACILITIES } from '@sanjeevani/maps';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createPrismaClient({ connectionString: url, maxConnections: 2 });
  try {
    for (const f of GURUGRAM_FACILITIES) {
      const data = {
        source: 'CURATED_DIRECTORY' as const,
        regionId: f.regionId,
        name: f.name,
        address: f.address,
        lat: f.lat,
        lng: f.lng,
        coordinatesApprox: f.coordinatesApprox,
        phone: f.phone,
        emergencyPhone: f.emergencyPhone,
        types: [...f.types],
        verifiedSpecialties: [...f.verifiedSpecialties],
        emergency24x7: f.emergency24x7,
        ownership: f.ownership,
        website: f.website,
        sourceUrl: f.sourceUrl,
        verifiedOn: f.verifiedOn,
        active: true,
      };
      await db.facility.upsert({ where: { externalId: f.slug }, create: { externalId: f.slug, ...data }, update: data });
    }
    const count = await db.facility.count({ where: { source: 'CURATED_DIRECTORY' } });
    console.log(`Seeded curated directory: ${count} facilities.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
