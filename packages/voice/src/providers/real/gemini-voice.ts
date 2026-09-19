import type { Language } from '@sanjeevani/types';
import {
  VoiceError,
  type SpeechToTextProvider,
  type SynthesisRequest,
  type SynthesisResult,
  type TextToSpeechProvider,
  type Transcription,
  type TranscriptionRequest,
} from '../../types';

export const GEMINI_API_REVISION = '2026-05-20';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

export interface GeminiVoiceOptions {
  apiKey: string;
  /** Model used to transcribe audio (any Gemini model with audio input). */
  sttModel: string;
  /** Dedicated speech-generation model. */
  ttsModel: string;
  /** Prebuilt voice name, e.g. "Kore". */
  voice: string;
  /** Optional separate voice for Hindi and Hinglish replies. */
  hindiVoice?: string;
  timeoutMs: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** MIME types the Gemini audio input accepts, mapped from what browsers record. */
const AUDIO_MIME: Record<string, string> = {
  'audio/webm': 'audio/webm',
  'audio/ogg': 'audio/ogg',
  'audio/mp4': 'audio/mp4',
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mp3',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/flac': 'audio/flac',
  'audio/aac': 'audio/aac',
};

function normaliseMime(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const mapped = AUDIO_MIME[base];
  if (!mapped) throw new VoiceError('bad_audio', `Unsupported audio type: ${base || 'unknown'}`);
  return mapped;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function errorKind(status: number): 'rate_limited' | 'auth' | 'bad_audio' | 'unavailable' {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'auth';
  if (status === 400) return 'bad_audio';
  return 'unavailable';
}

interface InteractionsBody {
  steps?: {
    type?: string;
    content?: { type?: string; text?: string; data?: string; mime_type?: string; sample_rate?: number; channels?: number }[];
  }[];
  output_audio?: { data?: string; mime_type?: string; sample_rate?: number; channels?: number };
  candidates?: { content?: { parts?: { text?: string; inlineData?: { data?: string; mimeType?: string } }[] } }[];
  error?: { message?: string; status?: string };
}

/** Text from either the Interactions `steps[]` shape or the older `candidates[]` shape. */
export function readText(body: InteractionsBody): string {
  const chunks: string[] = [];
  for (const step of body.steps ?? []) {
    for (const item of step.content ?? []) {
      if (item.type === 'text' && item.text) chunks.push(item.text);
    }
  }
  for (const candidate of body.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.text) chunks.push(part.text);
    }
  }
  return chunks.join('').trim();
}

export interface AudioOut {
  data: string;
  mimeType: string;
  sampleRate: number;
  channels: number;
}

/** Audio from `output_audio`, from an audio step, or from inline data. */
export function readAudio(body: InteractionsBody): AudioOut | null {
  const out = body.output_audio;
  if (out?.data) {
    return {
      data: out.data,
      mimeType: out.mime_type ?? 'audio/pcm',
      sampleRate: out.sample_rate ?? 24_000,
      channels: out.channels ?? 1,
    };
  }
  for (const step of body.steps ?? []) {
    for (const item of step.content ?? []) {
      if (item.type === 'audio' && item.data) {
        return {
          data: item.data,
          mimeType: item.mime_type ?? 'audio/pcm',
          sampleRate: item.sample_rate ?? 24_000,
          channels: item.channels ?? 1,
        };
      }
    }
  }
  for (const candidate of body.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType ?? 'audio/pcm';
        const rate = /rate=(\d+)/.exec(mimeType)?.[1];
        return { data: part.inlineData.data, mimeType, sampleRate: rate ? Number(rate) : 24_000, channels: 1 };
      }
    }
  }
  return null;
}

/**
 * Gemini returns raw signed 16-bit little-endian PCM. Browsers will not play that,
 * so we prepend a 44-byte RIFF/WAVE header — no re-encoding, no dependency.
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */
export function pcmToWav(pcm: Uint8Array, sampleRate: number, channels: number): Uint8Array {
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.byteLength, true);

  const wav = new Uint8Array(44 + pcm.byteLength);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);
  return wav;
}

/** True when the payload already carries its own container and needs no header. */
function isContainerised(mimeType: string): boolean {
  return /wav|mpeg|mp3|ogg|webm|aac|flac/i.test(mimeType);
}

abstract class GeminiBase {
  protected readonly fetchImpl: typeof fetch;
  protected readonly baseUrl: string;

  constructor(protected readonly options: GeminiVoiceOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? GEMINI_BASE_URL;
  }

  protected async post(body: unknown, what: string): Promise<InteractionsBody> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1beta/interactions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.options.apiKey,
          'api-revision': GEMINI_API_REVISION,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (controller.signal.aborted) throw new VoiceError('timeout', `${what} timed out`);
      throw new VoiceError('unavailable', `${what} failed: ${(error as Error).message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new VoiceError(errorKind(response.status), `${what} responded ${response.status}`, response.status);
    }
    const parsed = (await response.json()) as InteractionsBody;
    if (parsed.error) throw new VoiceError('unavailable', `${what}: ${parsed.error.status ?? parsed.error.message ?? 'error'}`);
    return parsed;
  }
}

const LANGUAGE_NAME: Record<Language, string> = {
  en: 'English',
  hi: 'Hindi (Devanagari script)',
  hinglish: 'Hinglish — Hindi spoken with English words, written in Roman script',
};

/**
 * Speech-to-text through Gemini's audio understanding. The prompt asks for a bare
 * transcript, and the reply is treated as text only — it is never allowed to act as
 * an instruction, because the audio comes from an untrusted caller.
 *
 * @see https://ai.google.dev/gemini-api/docs/interactions/audio
 */
export class GeminiSpeechToText extends GeminiBase implements SpeechToTextProvider {
  readonly id = 'gemini';

  async transcribe(request: TranscriptionRequest): Promise<Transcription> {
    if (request.audio.byteLength === 0) throw new VoiceError('bad_audio', 'Empty recording');
    // The API caps a whole request at 20 MB; base64 inflates bytes by about a third.
    if (request.audio.byteLength > 14 * 1024 * 1024) throw new VoiceError('too_large', 'That recording is too long.');
    const mimeType = normaliseMime(request.mimeType);

    const hint = request.languageHint
      ? ` The speaker is using ${LANGUAGE_NAME[request.languageHint]}.`
      : ' The speaker may use Hindi, English, or both mixed together (Hinglish). Write Hindi in Devanagari and Hinglish in Roman script, exactly as spoken.';

    const body = await this.post(
      {
        model: this.options.sttModel,
        input: [
          {
            type: 'text',
            text:
              'Transcribe this audio verbatim. Reply with the transcript only — no preamble, no translation, ' +
              'no commentary, no quotation marks. If there is no intelligible speech, reply with nothing.' +
              hint,
          },
          { type: 'audio', data: toBase64(request.audio), mime_type: mimeType },
        ],
        generation_config: { temperature: 0, max_output_tokens: 256, thinking_level: 'low' },
      },
      'Transcription',
    );

    const text = readText(body).replace(/^["'\s]+|["'\s]+$/g, '');
    return {
      text,
      // The transcription endpoint does not report a language; detection happens downstream.
      languageCode: request.languageHint ?? null,
      languageProbability: null,
      provider: this.id,
    };
  }
}

/**
 * Text-to-speech through a Gemini speech-generation model. The style prompt is
 * fixed by us; only the sentence to speak varies, and that has already been through
 * the medical output guard.
 *
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 */
export class GeminiTextToSpeech extends GeminiBase implements TextToSpeechProvider {
  readonly id = 'gemini';

  async synthesize(request: SynthesisRequest): Promise<SynthesisResult> {
    const voice = (request.language === 'en' ? this.options.voice : this.options.hindiVoice ?? this.options.voice) || 'Kore';
    const style =
      request.language === 'en'
        ? 'Say this calmly and warmly, at an unhurried pace, as if reassuring someone who is worried:'
        : 'Say this calmly and warmly in the same language as the text, at an unhurried pace, as if reassuring someone who is worried:';

    const body = await this.post(
      {
        model: this.options.ttsModel,
        input: `${style} ${request.text}`,
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice }] },
      },
      'Speech synthesis',
    );

    const audio = readAudio(body);
    if (!audio?.data) throw new VoiceError('unavailable', 'Speech synthesis returned no audio');

    const raw = new Uint8Array(Buffer.from(audio.data, 'base64'));
    const playable = isContainerised(audio.mimeType) ? raw : pcmToWav(raw, audio.sampleRate, audio.channels);
    const mimeType = isContainerised(audio.mimeType) ? audio.mimeType.split(';')[0]! : 'audio/wav';

    return {
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(playable);
          controller.close();
        },
      }),
      mimeType,
      provider: this.id,
    };
  }
}
