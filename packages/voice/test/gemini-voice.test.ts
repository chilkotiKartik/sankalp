import { describe, expect, it, vi } from 'vitest';
import { GeminiSpeechToText, GeminiTextToSpeech, createVoiceStack, pcmToWav, readAudio, readText } from '../src';

const gem = {
  apiKey: 'gemini-secret',
  sttModel: 'gemini-3.5-flash-lite',
  ttsModel: 'gemini-2.5-flash-preview-tts',
  voice: 'Kore',
  timeoutMs: 1000,
};
const el = { apiKey: 'el-secret', voiceId: 'v-en', ttsModel: 'eleven_flash_v2_5', sttModel: 'scribe_v2', timeoutMs: 1000 };

/** The Interactions API shape, as documented. */
const interactionsText = (text: string) =>
  new Response(JSON.stringify({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text }] }] }), { status: 200 });

describe('voice stack selection with Gemini', () => {
  it('uses Gemini for both ends when it is the only key', () => {
    expect(createVoiceStack({ mode: 'auto', gemini: gem }).capabilities()).toEqual({ stt: 'gemini', tts: 'gemini' });
  });

  it('prefers ElevenLabs for speech when both keys exist, keeping Gemini as the TTS fallback', () => {
    const stack = createVoiceStack({ mode: 'auto', gemini: gem, elevenLabs: el });
    expect(stack.capabilities().stt).toBe('elevenlabs');
    expect(stack.capabilities().tts).toBe('elevenlabs');
    expect(stack.tts.id).toBe('elevenlabs>gemini');
  });

  it('falls back to Gemini speech when ElevenLabs has a key but no voice id', () => {
    const stack = createVoiceStack({ mode: 'auto', gemini: gem, elevenLabs: { ...el, voiceId: undefined } });
    expect(stack.capabilities()).toEqual({ stt: 'elevenlabs', tts: 'gemini' });
  });

  it('forces browser fallbacks in mock mode even with a key', () => {
    expect(createVoiceStack({ mode: 'mock', gemini: gem }).capabilities()).toEqual({ stt: 'browser', tts: 'browser' });
  });
});

describe('Gemini speech-to-text', () => {
  it('posts inline audio with the key in a header and the revision pinned', async () => {
    const fetchImpl = vi.fn(async () => interactionsText('  "mujhe bukhar hai"  '));
    const stt = new GeminiSpeechToText({ ...gem, fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await stt.transcribe({ audio: new Uint8Array([1, 2, 3]), mimeType: 'audio/webm;codecs=opus' });

    expect(out.text).toBe('mujhe bukhar hai');
    expect(out.provider).toBe('gemini');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('gemini-secret');
    expect(headers['api-revision']).toBe('2026-05-20');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gemini-3.5-flash-lite');
    expect(body.input[1]).toMatchObject({ type: 'audio', mime_type: 'audio/webm', data: 'AQID' });
  });

  it('asks for Hinglish in Roman script when no language is fixed', async () => {
    const fetchImpl = vi.fn(async () => interactionsText('ok'));
    const stt = new GeminiSpeechToText({ ...gem, fetchImpl: fetchImpl as unknown as typeof fetch });
    await stt.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.input[0].text).toMatch(/Hinglish/);
  });

  it('rejects an unsupported container and an empty recording', async () => {
    const stt = new GeminiSpeechToText({ ...gem, fetchImpl: (async () => interactionsText('x')) as unknown as typeof fetch });
    await expect(stt.transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/amr' })).rejects.toMatchObject({ kind: 'bad_audio' });
    await expect(stt.transcribe({ audio: new Uint8Array(), mimeType: 'audio/webm' })).rejects.toMatchObject({ kind: 'bad_audio' });
  });

  it('maps HTTP failures to typed errors', async () => {
    const make = (status: number) =>
      new GeminiSpeechToText({ ...gem, fetchImpl: (async () => new Response('{}', { status })) as unknown as typeof fetch });
    await expect(make(429).transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' })).rejects.toMatchObject({ kind: 'rate_limited' });
    await expect(make(403).transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' })).rejects.toMatchObject({ kind: 'auth' });
    await expect(make(500).transcribe({ audio: new Uint8Array([1]), mimeType: 'audio/webm' })).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('Gemini text-to-speech', () => {
  const pcmResponse = (extra: Record<string, unknown> = {}) =>
    new Response(
      JSON.stringify({
        output_audio: { data: Buffer.from(new Uint8Array([1, 2, 3, 4])).toString('base64'), mime_type: 'audio/pcm', sample_rate: 24000, channels: 1, ...extra },
      }),
      { status: 200 },
    );

  it('requests audio output with the chosen voice and wraps PCM in a WAV header', async () => {
    const fetchImpl = vi.fn(async () => pcmResponse());
    const tts = new GeminiTextToSpeech({ ...gem, fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await tts.synthesize({ text: 'Please see a doctor today.', language: 'en' });

    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.response_format).toEqual({ type: 'audio' });
    expect(body.generation_config.speech_config).toEqual([{ voice: 'Kore' }]);
    expect(body.input).toContain('Please see a doctor today.');

    expect(result.mimeType).toBe('audio/wav');
    const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE');
    expect(bytes.byteLength).toBe(44 + 4);
  });

  it('uses the Hindi voice for Hindi and Hinglish when one is configured', async () => {
    const fetchImpl = vi.fn(async () => pcmResponse());
    const tts = new GeminiTextToSpeech({ ...gem, hindiVoice: 'Aoede', fetchImpl: fetchImpl as unknown as typeof fetch });
    await tts.synthesize({ text: 'नमस्ते', language: 'hi' });
    await tts.synthesize({ text: 'namaste', language: 'hinglish' });
    for (const call of fetchImpl.mock.calls) {
      const body = JSON.parse((call as unknown as [string, RequestInit])[1].body as string);
      expect(body.generation_config.speech_config).toEqual([{ voice: 'Aoede' }]);
    }
  });

  it('passes already-containerised audio through untouched', async () => {
    const fetchImpl = vi.fn(async () => pcmResponse({ mime_type: 'audio/mpeg' }));
    const tts = new GeminiTextToSpeech({ ...gem, fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await tts.synthesize({ text: 'hello', language: 'en' });
    expect(result.mimeType).toBe('audio/mpeg');
    expect(new Uint8Array(await new Response(result.stream).arrayBuffer()).byteLength).toBe(4);
  });

  it('fails clearly when no audio comes back', async () => {
    const tts = new GeminiTextToSpeech({ ...gem, fetchImpl: (async () => interactionsText('sorry')) as unknown as typeof fetch });
    await expect(tts.synthesize({ text: 'hi', language: 'en' })).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('response readers accept both documented shapes', () => {
  it('reads text from steps[] and from candidates[]', () => {
    expect(readText({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'a' }] }] })).toBe('a');
    expect(readText({ candidates: [{ content: { parts: [{ text: 'b' }] } }] })).toBe('b');
  });

  it('reads audio from output_audio, from an audio step, and from inlineData', () => {
    expect(readAudio({ output_audio: { data: 'AA', sample_rate: 16000 } })?.sampleRate).toBe(16000);
    expect(readAudio({ steps: [{ content: [{ type: 'audio', data: 'BB' }] }] })?.data).toBe('BB');
    const inline = readAudio({ candidates: [{ content: { parts: [{ inlineData: { data: 'CC', mimeType: 'audio/L16;rate=24000' } }] } }] });
    expect(inline).toMatchObject({ data: 'CC', sampleRate: 24000 });
  });
});

describe('pcmToWav', () => {
  it('writes a valid 44-byte header describing the payload', () => {
    const wav = pcmToWav(new Uint8Array(1000), 24000, 1);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint32(4, true)).toBe(36 + 1000); // RIFF chunk size
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(24000); // sample rate
    expect(view.getUint32(28, true)).toBe(48000); // byte rate = rate * blockAlign
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(40, true)).toBe(1000); // data size
  });
});
