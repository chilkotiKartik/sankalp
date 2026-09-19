import { BrowserDelegateSpeechToText, BrowserDelegateTextToSpeech } from './providers/mock/browser-delegate';
import { ElevenLabsSpeechToText, ElevenLabsTextToSpeech } from './providers/real/elevenlabs';
import { GeminiSpeechToText, GeminiTextToSpeech } from './providers/real/gemini-voice';
import {
  VoiceError,
  type SpeechToTextProvider,
  type SynthesisRequest,
  type SynthesisResult,
  type TextToSpeechProvider,
  type VoiceEngine,
  type VoiceProvider,
} from './types';

/** Tries each TTS provider in order; the last error is surfaced if all fail. */
export class FallbackTextToSpeech implements TextToSpeechProvider {
  readonly id: string;

  constructor(
    private readonly providers: TextToSpeechProvider[],
    private readonly onFailure?: (provider: string, error: unknown) => void,
  ) {
    this.id = providers.map((p) => p.id).join('>');
  }

  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    let lastError: unknown = new VoiceError('not_configured', 'No text-to-speech provider');
    for (const provider of this.providers) {
      try {
        return await provider.synthesize(req);
      } catch (error) {
        lastError = error;
        this.onFailure?.(provider.id, error);
        if (error instanceof VoiceError && error.kind === 'bad_audio') break;
      }
    }
    throw lastError;
  }
}

export interface VoiceStackConfig {
  mode: 'auto' | 'mock';
  elevenLabs?: {
    apiKey?: string;
    voiceId?: string;
    hindiVoiceId?: string;
    ttsModel: string;
    sttModel: string;
    timeoutMs: number;
  };
  gemini?: {
    apiKey?: string;
    sttModel: string;
    ttsModel: string;
    voice: string;
    hindiVoice?: string;
    timeoutMs: number;
  };
  fetchImpl?: typeof fetch;
  onFailure?: (provider: string, error: unknown) => void;
}

/** The engine name a provider id maps to, so capabilities never drift from reality. */
function engineOf(id: string): VoiceEngine {
  if (id.startsWith('elevenlabs')) return 'elevenlabs';
  if (id.startsWith('gemini')) return 'gemini';
  return 'browser';
}

/**
 * Chooses the server-side voice providers from whatever credentials exist.
 *
 * ElevenLabs is preferred when configured, because it is purpose-built for
 * low-latency streamed speech. Gemini is used when it is the only key available —
 * which is the common case, since one Gemini key also covers understanding — and
 * is kept as the second rung of the TTS fallback when both are present. Anything
 * still unresolved falls through to the browser's own speech engines.
 */
export function createVoiceStack(config: VoiceStackConfig): VoiceProvider {
  const auto = config.mode === 'auto';
  const el = auto && config.elevenLabs?.apiKey ? config.elevenLabs : undefined;
  const gem = auto && config.gemini?.apiKey ? config.gemini : undefined;

  let stt: SpeechToTextProvider = new BrowserDelegateSpeechToText();
  let tts: TextToSpeechProvider = new BrowserDelegateTextToSpeech();
  const ttsChain: TextToSpeechProvider[] = [];

  if (el?.apiKey) {
    const base = {
      apiKey: el.apiKey,
      voiceId: el.voiceId ?? '',
      ttsModel: el.ttsModel,
      sttModel: el.sttModel,
      timeoutMs: el.timeoutMs,
      ...(el.hindiVoiceId ? { hindiVoiceId: el.hindiVoiceId } : {}),
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    };
    stt = new ElevenLabsSpeechToText(base);
    // TTS needs a voice id; without one this rung is skipped.
    if (el.voiceId) ttsChain.push(new ElevenLabsTextToSpeech(base));
  }

  if (gem?.apiKey) {
    const base = {
      apiKey: gem.apiKey,
      sttModel: gem.sttModel,
      ttsModel: gem.ttsModel,
      voice: gem.voice,
      timeoutMs: gem.timeoutMs,
      ...(gem.hindiVoice ? { hindiVoice: gem.hindiVoice } : {}),
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    };
    if (stt.id === 'browser') stt = new GeminiSpeechToText(base);
    ttsChain.push(new GeminiTextToSpeech(base));
  }

  if (ttsChain.length === 1) tts = ttsChain[0]!;
  else if (ttsChain.length > 1) tts = new FallbackTextToSpeech(ttsChain, config.onFailure);

  return {
    stt,
    tts,
    capabilities: () => ({ stt: engineOf(stt.id), tts: engineOf(tts.id) }),
  };
}
