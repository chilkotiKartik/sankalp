import { describe, expect, it, vi } from 'vitest';
import {
  ElevenLabsSpeechToText,
  ElevenLabsTextToSpeech,
  FallbackTextToSpeech,
  VoiceError,
  createVoiceStack,
  type TextToSpeechProvider,
} from '../src';

const base = { apiKey: 'secret', voiceId: 'voice-en', hindiVoiceId: 'voice-hi', ttsModel: 'eleven_flash_v2_5', sttModel: 'scribe_v2', timeoutMs: 1000 };

describe('voice stack selection', () => {
  it('uses browser speech when no key is configured', () => {
    const stack = createVoiceStack({ mode: 'auto', elevenLabs: { ...base, apiKey: undefined } });
    expect(stack.capabilities()).toEqual({ stt: 'browser', tts: 'browser' });
  });

  it('uses ElevenLabs when configured, and needs a voice id for TTS', () => {
    expect(createVoiceStack({ mode: 'auto', elevenLabs: base }).capabilities()).toEqual({ stt: 'elevenlabs', tts: 'elevenlabs' });
    expect(createVoiceStack({ mode: 'auto', elevenLabs: { ...base, voiceId: undefined } }).capabilities()).toEqual({ stt: 'elevenlabs', tts: 'browser' });
  });

  it('forces local fallbacks in mock mode', () => {
    expect(createVoiceStack({ mode: 'mock', elevenLabs: base }).capabilities()).toEqual({ stt: 'browser', tts: 'browser' });
  });

  it('browser delegates fail with a clear not_configured error', async () => {
    const stack = createVoiceStack({ mode: 'mock' });
    await expect(stack.tts.synthesize({ text: 'hi', language: 'en' })).rejects.toMatchObject({ kind: 'not_configured' });
    await expect(stack.stt.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' })).rejects.toMatchObject({ kind: 'not_configured' });
  });
});

describe('ElevenLabs speech-to-text', () => {
  it('posts multipart audio and lets the model auto-detect language by default', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ text: ' mujhe bukhar hai ', language_code: 'hin', language_probability: 0.93 }), { status: 200 }));
    const stt = new ElevenLabsSpeechToText({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await stt.transcribe({ audio: new Uint8Array([1, 2, 3]), mimeType: 'audio/webm;codecs=opus' });
    expect(out).toEqual({ text: 'mujhe bukhar hai', languageCode: 'hin', languageProbability: 0.93, provider: 'elevenlabs' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('secret');
    const form = init.body as FormData;
    expect(form.get('model_id')).toBe('scribe_v2');
    expect(form.get('language_code')).toBeNull();
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('rejects empty audio and maps provider errors', async () => {
    const stt = new ElevenLabsSpeechToText({ ...base, fetchImpl: (async () => new Response('', { status: 401 })) as unknown as typeof fetch });
    await expect(stt.transcribe({ audio: new Uint8Array(), mimeType: 'audio/webm' })).rejects.toMatchObject({ kind: 'bad_audio' });
    await expect(stt.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' })).rejects.toMatchObject({ kind: 'auth' });
  });

  it('times out slow requests', async () => {
    const never = ((_: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;
    const stt = new ElevenLabsSpeechToText({ ...base, timeoutMs: 30, fetchImpl: never });
    await expect(stt.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' })).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('ElevenLabs text-to-speech', () => {
  it('streams audio with the language-appropriate voice', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([0xff, 0xfb]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
    const tts = new ElevenLabsTextToSpeech({ ...base, fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await tts.synthesize({ text: 'नमस्ते', language: 'hi' });
    expect(out.mimeType).toBe('audio/mpeg');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice-hi/stream?output_format=mp3_44100_128');
    expect(JSON.parse(String(init.body))).toMatchObject({ text: 'नमस्ते', model_id: 'eleven_flash_v2_5', language_code: 'hi' });

    await tts.synthesize({ text: 'hello', language: 'en' });
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toContain('/voice-en/');
  });

  it('tries the next provider when one fails', async () => {
    const failing: TextToSpeechProvider = { id: 'a', synthesize: async () => Promise.reject(new VoiceError('unavailable', 'down')) };
    const working: TextToSpeechProvider = {
      id: 'b',
      synthesize: async () => ({ stream: new Response('x').body!, mimeType: 'audio/mpeg', provider: 'b' }),
    };
    const onFailure = vi.fn();
    const chain = new FallbackTextToSpeech([failing, working], onFailure);
    expect((await chain.synthesize({ text: 'hi', language: 'en' })).provider).toBe('b');
    expect(onFailure).toHaveBeenCalledWith('a', expect.any(VoiceError));
  });
});
