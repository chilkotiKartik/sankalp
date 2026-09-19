import { AnthropicProvider, ConversationEngine, DeterministicProvider, GeminiProvider, type LlmProvider } from '@sanjeevani/ai';
import { INDIA_EMERGENCY_CONTACTS, getRegion, type RegionConfig } from '@sanjeevani/config';
import type { ServerConfig } from '@sanjeevani/config/server';
import {
  CuratedDirectoryProvider,
  EstimatedRoutingProvider,
  FacilityService,
  GooglePlacesProvider,
  GoogleRoutesProvider,
  type HospitalProvider,
  type RoutingProvider,
} from '@sanjeevani/maps';
import type { Capabilities } from '@sanjeevani/types';
import { createVoiceStack, type VoiceProvider } from '@sanjeevani/voice';
import { FieldCipher } from './lib/crypto';
import type { Logger } from './lib/logger';
import { createMemoryStore } from './repositories/memory-store';
import { createPrismaStore } from './repositories/prisma-store';
import type { Store } from './repositories/types';
import { AuthService } from './services/auth-service';
import { ConversationService } from './services/conversation-service';

export interface Container {
  config: ServerConfig;
  logger: Logger;
  region: RegionConfig;
  store: Store;
  auth: AuthService;
  cipher: FieldCipher;
  voice: VoiceProvider;
  llm: LlmProvider;
  facilities: FacilityService;
  engine: ConversationEngine;
  conversations: ConversationService;
  capabilities(): Capabilities;
  close(): Promise<void>;
}

async function createStore(config: ServerConfig, logger: Logger): Promise<Store> {
  const wantPostgres = config.PERSISTENCE === 'postgres' || (config.PERSISTENCE === 'auto' && Boolean(config.DATABASE_URL));
  if (!wantPostgres || !config.DATABASE_URL) {
    if (!config.DEMO_MODE && !config.isTest) throw new Error('DATABASE_URL is required unless DEMO_MODE is enabled.');
    logger.warn('Using in-memory persistence (demo mode). Data is lost on restart.');
    return createMemoryStore();
  }
  const store = createPrismaStore(config.DATABASE_URL, config.DATABASE_POOL_MAX);
  try {
    await store.client.$queryRaw`SELECT 1`;
    return store;
  } catch (error) {
    logger.error({ err: error }, 'database connection failed');
  }
  await store.close().catch(() => undefined);
  if (config.PERSISTENCE === 'postgres' || !config.DEMO_MODE) throw new Error('Database is unreachable.');
  logger.warn('Database unreachable — falling back to in-memory persistence because DEMO_MODE is on.');
  return createMemoryStore();
}

/**
 * Which model answers. `auto` prefers Gemini, because one Gemini key also covers
 * speech in and out — so a single credential lights up the whole app. Either
 * provider is wrapped by the same validation and safety caps upstream; neither can
 * raise an emergency on its own.
 */
function createLlm(config: ServerConfig, real: boolean, fetchImpl?: typeof fetch): LlmProvider {
  const choice = config.AI_PROVIDER;
  if (!real || choice === 'rules') return new DeterministicProvider();
  const wantGemini = choice === 'gemini' || (choice === 'auto' && Boolean(config.GEMINI_API_KEY));
  if (wantGemini && config.GEMINI_API_KEY) {
    return new GeminiProvider({
      apiKey: config.GEMINI_API_KEY,
      model: config.GEMINI_MODEL,
      timeoutMs: config.AI_TIMEOUT_MS,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  }
  if (choice !== 'gemini' && config.ANTHROPIC_API_KEY) {
    return new AnthropicProvider({
      apiKey: config.ANTHROPIC_API_KEY,
      model: config.ANTHROPIC_MODEL,
      timeoutMs: config.AI_TIMEOUT_MS,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
  }
  return new DeterministicProvider();
}

export async function createContainer(config: ServerConfig, logger: Logger, overrides: Partial<Pick<Container, 'store' | 'llm' | 'voice'>> & { fetchImpl?: typeof fetch } = {}): Promise<Container> {
  const region = getRegion(config.REGION_ID);
  const store = overrides.store ?? (await createStore(config, logger));
  const cipher = new FieldCipher(config.DATA_ENCRYPTION_KEY);
  const auth = new AuthService(store, config.JWT_SECRET, config.SESSION_TTL_HOURS);
  const real = config.PROVIDER_MODE === 'auto';
  const fetchImpl = overrides.fetchImpl;

  const llm: LlmProvider = overrides.llm ?? createLlm(config, real, fetchImpl);

  const voice =
    overrides.voice ??
    createVoiceStack({
      mode: config.PROVIDER_MODE,
      gemini: {
        apiKey: config.GEMINI_API_KEY,
        sttModel: config.GEMINI_STT_MODEL,
        ttsModel: config.GEMINI_TTS_MODEL,
        voice: config.GEMINI_VOICE,
        hindiVoice: config.GEMINI_VOICE_HI,
        timeoutMs: config.VOICE_TIMEOUT_MS,
      },
      elevenLabs: {
        apiKey: config.ELEVENLABS_API_KEY,
        voiceId: config.ELEVENLABS_VOICE_ID,
        hindiVoiceId: config.ELEVENLABS_VOICE_ID_HI,
        ttsModel: config.ELEVENLABS_TTS_MODEL,
        sttModel: config.ELEVENLABS_STT_MODEL,
        timeoutMs: config.VOICE_TIMEOUT_MS,
      },
      ...(fetchImpl ? { fetchImpl } : {}),
      onFailure: (provider, error) => logger.warn({ provider, err: error }, 'tts provider failed'),
    });

  const curated = new CuratedDirectoryProvider(() => store.facilities.listCurated(region.id));
  const estimate = new EstimatedRoutingProvider(region.roadDistanceFactor, region.estimatedUrbanSpeedKmh);
  let primary: HospitalProvider = curated;
  let fallback: HospitalProvider | undefined;
  let routing: RoutingProvider = estimate;
  if (real && config.GOOGLE_MAPS_API_KEY) {
    primary = new GooglePlacesProvider({ apiKey: config.GOOGLE_MAPS_API_KEY, timeoutMs: config.MAPS_TIMEOUT_MS, ...(fetchImpl ? { fetchImpl } : {}) });
    fallback = curated;
    routing = new GoogleRoutesProvider({ apiKey: config.GOOGLE_MAPS_API_KEY, timeoutMs: config.MAPS_TIMEOUT_MS, fallback: estimate, ...(fetchImpl ? { fetchImpl } : {}) });
  }
  const facilities = new FacilityService({
    primary,
    ...(fallback ? { fallback } : {}),
    routing,
    estimateRouting: estimate,
    cache: store.facilityCache,
    cacheTtlSeconds: config.FACILITY_CACHE_TTL_S,
    radiusMeters: config.FACILITY_SEARCH_RADIUS_M,
    onError: (err, context) => logger.warn({ err, context }, 'maps provider error'),
  });

  const engine = new ConversationEngine({
    llm,
    aiTimeoutMs: config.AI_TIMEOUT_MS,
    facilities: {
      find: async (q) => {
        const result = await facilities.find(q);
        return { facilities: result.facilities, status: result.status };
      },
    },
  });
  const conversations = new ConversationService(store, engine, cipher, logger, config.RETENTION_DAYS);

  return {
    config,
    logger,
    region,
    store,
    auth,
    cipher,
    voice,
    llm,
    facilities,
    engine,
    conversations,
    capabilities: () => {
      const v = voice.capabilities();
      return {
        demoMode: config.DEMO_MODE,
        stt: v.stt,
        tts: v.tts,
        ai: llm.name === 'deterministic' ? 'rules' : llm.name,
        maps: primary.id,
        routing: routing.id,
        persistence: store.kind,
        region: {
          id: region.id,
          name: region.name,
          center: region.center,
          demoLocation: region.demoLocation,
          demoLocationLabel: region.demoLocationLabel,
        },
        emergencyContacts: [...INDIA_EMERGENCY_CONTACTS],
        retentionDays: config.RETENTION_DAYS,
      };
    },
    close: () => store.close(),
  };
}
