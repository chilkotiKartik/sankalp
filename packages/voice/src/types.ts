import type { Language } from '@sanjeevani/types';

export interface TranscriptionRequest {
  audio: Uint8Array;
  mimeType: string;
  /** Only set when the user fixed a language; otherwise the engine auto-detects (needed for Hinglish). */
  languageHint?: Language;
}

export interface Transcription {
  text: string;
  languageCode: string | null;
  languageProbability: number | null;
  provider: string;
}

export interface SynthesisRequest {
  text: string;
  language: Language;
}

export interface SynthesisResult {
  /** Audio bytes as they arrive — pipe straight to the client for low latency. */
  stream: ReadableStream<Uint8Array>;
  mimeType: string;
  provider: string;
}

export interface SpeechToTextProvider {
  readonly id: string;
  transcribe(request: TranscriptionRequest): Promise<Transcription>;
}

export interface TextToSpeechProvider {
  readonly id: string;
  synthesize(request: SynthesisRequest): Promise<SynthesisResult>;
}

export type VoiceEngine = 'elevenlabs' | 'gemini' | 'browser';

/**
 * Server-side voice stack. When a capability is "browser", the server has no
 * provider for it and the client uses the Web Speech API instead.
 */
export interface VoiceProvider {
  readonly stt: SpeechToTextProvider;
  readonly tts: TextToSpeechProvider;
  capabilities(): { stt: VoiceEngine; tts: VoiceEngine };
}

export type VoiceErrorKind = 'not_configured' | 'timeout' | 'rate_limited' | 'unavailable' | 'auth' | 'bad_audio' | 'too_large';

export class VoiceError extends Error {
  constructor(
    readonly kind: VoiceErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'VoiceError';
  }
}
