import { z } from 'zod';
import { REGIONS } from './regions';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const DEV_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me-please-0123456789';
// 32 zero-ish bytes, base64 — development only.
const DEV_ENCRYPTION_KEY = 'ZGV2LW9ubHktZW5jcnlwdGlvbi1rZXktMzJieXRlcyE=';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    HOST: z.string().default('0.0.0.0'),
    APP_ORIGIN: z.string().default('http://localhost:3000'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DEMO_MODE: booleanish.default(true),
    /** auto = real provider when its credentials exist, otherwise the local fallback. */
    PROVIDER_MODE: z.enum(['auto', 'mock']).default('auto'),
    REGION_ID: z.string().default('gurugram'),

    DATABASE_URL: optionalSecret,
    /** memory is allowed only when DEMO_MODE is on or in tests. */
    PERSISTENCE: z.enum(['auto', 'postgres', 'memory']).default('auto'),
    /**
     * Postgres connections held by one instance of this process.
     *
     * On a single long-running server, ten is generous and harmless. On a serverless
     * host there is no single process: a traffic spike becomes dozens of instances,
     * each opening its own pool, and ten apiece will exhaust the database long before
     * the traffic is interesting. Those deployments set this to 1–2 and let the
     * connection pooler in front of Postgres do the multiplexing.
     */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    JWT_SECRET: optionalSecret,
    DATA_ENCRYPTION_KEY: optionalSecret,
    /** Enables POST /v1/auth/admin for operator metrics. Min 24 chars. */
    ADMIN_ACCESS_KEY: optionalSecret,
    /**
     * Authorises the scheduled retention sweep. On a long-running server the sweep
     * is an internal timer and this is unused; on a serverless host there is no
     * timer, so the platform's scheduler calls `POST /internal/purge` and proves it
     * is the scheduler with this shared secret. Without it, that route is disabled
     * entirely rather than left open.
     */
    CRON_SECRET: optionalSecret,
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 30),
    RETENTION_DAYS: z.coerce.number().int().min(0).max(365).default(7),

    ELEVENLABS_API_KEY: optionalSecret,
    ELEVENLABS_VOICE_ID: optionalSecret,
    ELEVENLABS_VOICE_ID_HI: optionalSecret,
    ELEVENLABS_TTS_MODEL: z.string().default('eleven_flash_v2_5'),
    ELEVENLABS_STT_MODEL: z.string().default('scribe_v2'),
    VOICE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),

    ANTHROPIC_API_KEY: optionalSecret,
    ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5-20251001'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(7000),

    /**
     * One Gemini key covers understanding, speech-to-text and text-to-speech.
     * GOOGLE_API_KEY is accepted as an alias because that is what Google's own
     * quickstarts export.
     */
    GEMINI_API_KEY: optionalSecret,
    GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
    /** Any Gemini model with audio input; kept separate so it can be tuned independently. */
    GEMINI_STT_MODEL: z.string().default('gemini-3.5-flash-lite'),
    GEMINI_TTS_MODEL: z.string().default('gemini-2.5-flash-preview-tts'),
    /** Prebuilt voice names from the speech-generation docs. */
    GEMINI_VOICE: z.string().default('Kore'),
    GEMINI_VOICE_HI: z.string().optional(),
    /** Prefer Gemini for understanding when both it and an Anthropic key are present. */
    AI_PROVIDER: z.enum(['auto', 'gemini', 'anthropic', 'rules']).default('auto'),

    GOOGLE_MAPS_API_KEY: optionalSecret,
    FACILITY_SEARCH_RADIUS_M: z.coerce.number().int().min(500).max(50000).default(15000),
    FACILITY_CACHE_TTL_S: z.coerce.number().int().min(0).max(3600).default(600),
    MAPS_TIMEOUT_MS: z.coerce.number().int().min(500).max(20000).default(6000),

    RATE_LIMIT_WINDOW_S: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
    RATE_LIMIT_VOICE_MAX: z.coerce.number().int().min(1).default(40),
    /** New anonymous sessions per IP per 10 minutes. Generous: mobile carriers share IPs (CGNAT). */
    RATE_LIMIT_SESSION_MAX: z.coerce.number().int().min(1).default(300),
  })
  .superRefine((env, ctx) => {
    if (!REGIONS[env.REGION_ID]) {
      ctx.addIssue({ code: 'custom', path: ['REGION_ID'], message: `Unknown region ${env.REGION_ID}` });
    }
    if (env.NODE_ENV === 'production') {
      if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
        ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'JWT_SECRET (>=32 chars) is required in production' });
      }
      if (!env.DATA_ENCRYPTION_KEY) {
        ctx.addIssue({ code: 'custom', path: ['DATA_ENCRYPTION_KEY'], message: 'DATA_ENCRYPTION_KEY is required in production' });
      }
      if (!env.DEMO_MODE && !env.DATABASE_URL) {
        ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'DATABASE_URL is required in production' });
      }
    }
    if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['GEMINI_API_KEY'], message: 'AI_PROVIDER=gemini needs GEMINI_API_KEY' });
    }
    if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['ANTHROPIC_API_KEY'], message: 'AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY' });
    }
    if (env.DATA_ENCRYPTION_KEY && Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64').length !== 32) {
      ctx.addIssue({ code: 'custom', path: ['DATA_ENCRYPTION_KEY'], message: 'Must be 32 bytes, base64-encoded' });
    }
  });

export type RawServerEnv = z.infer<typeof envSchema>;

export interface ServerConfig extends RawServerEnv {
  JWT_SECRET: string;
  DATA_ENCRYPTION_KEY: string;
  isProduction: boolean;
  isTest: boolean;
  allowedOrigins: string[];
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid server configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

export function loadServerConfig(source: Record<string, string | undefined> = process.env): ServerConfig {
  // Google's own quickstarts export GOOGLE_API_KEY; accept it so a copied key just works.
  const normalised =
    !source['GEMINI_API_KEY'] && source['GOOGLE_API_KEY']
      ? { ...source, GEMINI_API_KEY: source['GOOGLE_API_KEY'] }
      : source;
  const parsed = envSchema.safeParse(normalised);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const env = parsed.data;
  return {
    ...env,
    JWT_SECRET: env.JWT_SECRET ?? DEV_JWT_SECRET,
    DATA_ENCRYPTION_KEY: env.DATA_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    allowedOrigins: env.APP_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
  };
}
