import type { Language } from '@sanjeevani/types';
import {
  VoiceError,
  type SpeechToTextProvider,
  type SynthesisRequest,
  type SynthesisResult,
  type TextToSpeechProvider,
  type Transcription,
  type TranscriptionRequest,
  type VoiceErrorKind,
} from '../../types';

/**
 * ElevenLabs
 *  - STT: POST https://api.elevenlabs.io/v1/speech-to-text (multipart: model_id, file[, language_code])
 *  - TTS: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream?output_format=…
 * The API key stays on the server; the browser only ever sees audio bytes.
 */
export interface ElevenLabsOptions {
  apiKey: string;
  voiceId: string;
  /** Optional voice tuned for Hindi / Hinglish. */
  hindiVoiceId?: string;
  ttsModel: string;
  sttModel: string;
  timeoutMs: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function errorKind(status: number): VoiceErrorKind {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (status === 400 || status === 422) return 'bad_audio';
  return 'unavailable';
}

abstract class ElevenLabsBase {
  protected readonly fetchImpl: typeof fetch;
  protected readonly baseUrl: string;

  constructor(protected readonly options: ElevenLabsOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.elevenlabs.io';
  }

  protected async request(path: string, init: RequestInit, timeoutMs = this.options.timeoutMs): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { ...(init.headers as Record<string, string>), 'xi-api-key': this.options.apiKey },
      });
      if (!res.ok) throw new VoiceError(errorKind(res.status), `ElevenLabs responded ${res.status}`, res.status);
      return res;
    } catch (error) {
      if (error instanceof VoiceError) throw error;
      if (controller.signal.aborted) throw new VoiceError('timeout', 'ElevenLabs request timed out');
      throw new VoiceError('unavailable', `ElevenLabs request failed: ${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

export class ElevenLabsSpeechToText extends ElevenLabsBase implements SpeechToTextProvider {
  readonly id = 'elevenlabs';

  async transcribe(req: TranscriptionRequest): Promise<Transcription> {
    if (req.audio.byteLength === 0) throw new VoiceError('bad_audio', 'Empty audio');
    if (req.audio.byteLength > MAX_AUDIO_BYTES) throw new VoiceError('too_large', 'Audio exceeds 10 MB');
    const form = new FormData();
    form.append('model_id', this.options.sttModel);
    const extension = req.mimeType.includes('mp4') ? 'mp4' : req.mimeType.includes('ogg') ? 'ogg' : req.mimeType.includes('wav') ? 'wav' : 'webm';
    form.append('file', new Blob([req.audio], { type: req.mimeType }), `utterance.${extension}`);
    if (req.languageHint === 'hi') form.append('language_code', 'hin');
    if (req.languageHint === 'en') form.append('language_code', 'eng');
    form.append('tag_audio_events', 'false');

    const res = await this.request('/v1/speech-to-text', { method: 'POST', body: form });
    const body = (await res.json()) as { text?: string; language_code?: string; language_probability?: number };
    return {
      text: (body.text ?? '').trim(),
      languageCode: body.language_code ?? null,
      languageProbability: typeof body.language_probability === 'number' ? body.language_probability : null,
      provider: this.id,
    };
  }
}

export class ElevenLabsTextToSpeech extends ElevenLabsBase implements TextToSpeechProvider {
  readonly id = 'elevenlabs';

  private voiceFor(language: Language): string {
    return language !== 'en' && this.options.hindiVoiceId ? this.options.hindiVoiceId : this.options.voiceId;
  }

  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    const voiceId = encodeURIComponent(this.voiceFor(req.language));
    const body: Record<string, unknown> = {
      text: req.text,
      model_id: this.options.ttsModel,
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: 0.95 },
    };
    // Devanagari text benefits from an explicit Hindi hint; romanised Hinglish is left to auto-detection.
    if (req.language === 'hi' && this.options.ttsModel !== 'eleven_multilingual_v2') body.language_code = 'hi';
    const res = await this.request(`/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    });
    if (!res.body) throw new VoiceError('unavailable', 'ElevenLabs returned no audio');
    return { stream: res.body, mimeType: 'audio/mpeg', provider: this.id };
  }
}
