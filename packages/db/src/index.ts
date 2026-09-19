import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

export * from './generated/client';

export interface DbOptions {
  connectionString: string;
  maxConnections?: number;
}

/** Prisma 7 with the node-postgres driver adapter — no native query engine required. */
export function createPrismaClient({ connectionString, maxConnections = 10 }: DbOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString, max: maxConnections });
  return new PrismaClient({ adapter });
}
