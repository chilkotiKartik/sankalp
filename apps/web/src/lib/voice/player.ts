import type { Language } from '@sanjeevani/types';

type LevelFn = (level: number) => void;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Plays assistant speech and reports a live loudness level so the orb can move with the voice.
 * Server audio streams through Media Source Extensions when available (first sound in
 * a few hundred ms); otherwise it falls back to a buffered blob. Browser speech synthesis
 * is the offline/no-key fallback.
 */
export class SpeechPlayer {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private stopped = false;
  private objectUrl: string | null = null;
  private resolveCurrent: (() => void) | null = null;

  constructor(private readonly onLevel: LevelFn) {}

  /** Must be called from a user gesture on iOS/Safari so later playback is allowed. */
  unlock() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctx();
      }
      void this.ctx.resume();
      if (!this.audio) {
        this.audio = new Audio();
        this.audio.preload = 'auto';
        const source = this.ctx.createMediaElementSource(this.audio);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 512;
        source.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      }
      if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
    } catch {
      /* Web Audio unavailable — playback still works without level metering */
    }
  }

  async playResponse(response: Response): Promise<void> {
    this.stopInternal();
    this.stopped = false;
    this.unlock();
    const audio = this.audio ?? new Audio();
    this.audio = audio;

    // Only MP3 is streamed incrementally. Gemini returns a complete WAV, which has a
    // header describing the whole file, so it is played as a blob instead.
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
    const canStream =
      contentType === 'audio/mpeg' &&
      typeof MediaSource !== 'undefined' &&
      MediaSource.isTypeSupported('audio/mpeg') &&
      response.body !== null;

    if (canStream && response.body) {
      const mediaSource = new MediaSource();
      this.objectUrl = URL.createObjectURL(mediaSource);
      audio.src = this.objectUrl;
      const reader = response.body.getReader();
      mediaSource.addEventListener(
        'sourceopen',
        async () => {
          try {
            const sb = mediaSource.addSourceBuffer('audio/mpeg');
            let started = false;
            for (;;) {
              if (this.stopped) {
                await reader.cancel().catch(() => undefined);
                break;
              }
              const { value, done } = await reader.read();
              if (done) break;
              await new Promise<void>((res, rej) => {
                sb.addEventListener('updateend', () => res(), { once: true });
                sb.addEventListener('error', () => rej(new Error('append failed')), { once: true });
                sb.appendBuffer(value as BufferSource);
              });
              if (!started) {
                started = true;
                audio.play().catch(() => this.finish());
              }
            }
            if (mediaSource.readyState === 'open') mediaSource.endOfStream();
            if (!started) this.finish();
          } catch {
            this.finish();
          }
        },
        { once: true },
      );
    }

    const ended = new Promise<void>((resolve) => {
      this.resolveCurrent = resolve;
      audio.onended = () => this.finish();
      audio.onerror = () => this.finish();
      this.meter();
    });

    if (!canStream) {
      const blob = await response.blob();
      if (this.stopped) return;
      this.objectUrl = URL.createObjectURL(blob);
      audio.src = this.objectUrl;
      await audio.play();
    }
    return ended;
  }

  playBrowser(text: string, language: Language, rate: number): Promise<void> {
    this.stopInternal();
    this.stopped = false;
    if (!('speechSynthesis' in window)) return Promise.reject(new Error('unsupported'));
    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const wanted = language === 'en' ? ['en-IN', 'en-GB', 'en-US', 'en'] : ['hi-IN', 'hi'];
    const voice = wanted.map((w) => voices.find((v) => v.lang.replace('_', '-').startsWith(w))).find(Boolean) ?? null;
    // Long utterances get cut off in some browsers — speak sentence by sentence.
    const parts = splitSentences(text);
    let pulse = 0;
    const timer = window.setInterval(() => {
      pulse *= 0.85;
      this.onLevel(Math.max(pulse, synth.speaking ? 0.12 + Math.random() * 0.08 : 0));
    }, 60);

    // Some engines (headless browsers, devices without voices) never fire `end`.
    const budgetMs = 4000 + (text.length * 90) / rate;
    const watchdog = window.setTimeout(() => {
      synth.cancel();
      this.finish();
    }, budgetMs);

    return new Promise<void>((resolve, reject) => {
      this.resolveCurrent = () => {
        window.clearInterval(timer);
        window.clearTimeout(watchdog);
        this.onLevel(0);
        resolve();
      };
      const speakNext = (i: number) => {
        if (this.stopped || i >= parts.length) return this.finish();
        const u = new SpeechSynthesisUtterance(parts[i]);
        u.lang = voice?.lang ?? (language === 'en' ? 'en-IN' : 'hi-IN');
        if (voice) u.voice = voice;
        u.rate = rate;
        u.onboundary = () => {
          pulse = 0.5 + Math.random() * 0.45;
        };
        u.onend = () => speakNext(i + 1);
        u.onerror = (e) => {
          if (e.error === 'interrupted' || e.error === 'canceled') return this.finish();
          window.clearInterval(timer);
          reject(new Error(e.error));
        };
        synth.speak(u);
      };
      synth.cancel();
      speakNext(0);
    });
  }

  private meter() {
    const analyser = this.analyser;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 2; i < 48; i++) sum += data[i]!;
      this.onLevel(Math.min(1, sum / (46 * 180)));
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private finish() {
    cancelAnimationFrame(this.raf);
    this.onLevel(0);
    const resolve = this.resolveCurrent;
    this.resolveCurrent = null;
    resolve?.();
  }

  private stopInternal() {
    this.stopped = true;
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    this.finish();
  }

  /** Barge-in: stop speaking immediately. */
  stop() {
    this.stopInternal();
  }

  dispose() {
    this.stopInternal();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.audio = null;
    this.analyser = null;
  }
}
