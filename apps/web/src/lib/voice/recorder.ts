export type MicErrorKind = 'denied' | 'unavailable' | 'unsupported' | 'failed';

export class MicError extends Error {
  constructor(readonly kind: MicErrorKind, message: string) {
    super(message);
    this.name = 'MicError';
  }
}

export interface RecordOptions {
  onLevel: (level: number) => void;
  /** Called once when voice activity is first detected. */
  onSpeechStart?: () => void;
  silenceMs?: number;
  noSpeechMs?: number;
  maxMs?: number;
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

/**
 * Microphone capture with a lightweight energy-based voice activity detector:
 * it calibrates to the room for ~300 ms, ends the turn after a pause, and gives up
 * politely if nobody speaks.
 */
export class MicRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private raf = 0;
  private chunks: Blob[] = [];
  private finish: ((blob: Blob | null) => void) | null = null;
  private timers: number[] = [];

  static isSupported(): boolean {
    return typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(pickMime());
  }

  async record(options: RecordOptions): Promise<Blob | null> {
    const { silenceMs = 1300, noSpeechMs = 7000, maxMs = 25_000 } = options;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (error) {
      const name = (error as DOMException).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicError('denied', 'Microphone permission denied');
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new MicError('unavailable', 'No microphone');
      throw new MicError('failed', 'Microphone could not start');
    }

    const mimeType = pickMime();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    const done = new Promise<Blob | null>((resolve) => {
      this.finish = resolve;
    });
    let heardSpeech = false;
    this.recorder.onstop = () => {
      const blob = heardSpeech && this.chunks.length ? new Blob(this.chunks, { type: this.recorder?.mimeType || mimeType || 'audio/webm' }) : null;
      this.cleanup();
      this.finish?.(blob);
      this.finish = null;
    };
    this.recorder.start(250);

    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const source = this.ctx.createMediaStreamSource(this.stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);

    const started = performance.now();
    let floor = 0.01;
    let calibrating = true;
    let lastVoice = started;

    const tick = () => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i]! * buffer[i]!;
      const rms = Math.sqrt(sum / buffer.length);
      const now = performance.now();
      if (calibrating) {
        floor = floor * 0.8 + rms * 0.2;
        if (now - started > 300) calibrating = false;
      }
      const threshold = Math.max(0.018, floor * 2.8);
      const level = Math.min(1, Math.max(0, (rms - floor) / 0.12));
      options.onLevel(level);
      if (!calibrating && rms > threshold) {
        if (!heardSpeech) {
          heardSpeech = true;
          options.onSpeechStart?.();
        }
        lastVoice = now;
      } else if (!calibrating && rms < threshold * 0.8) {
        floor = floor * 0.995 + rms * 0.005;
      }
      if (heardSpeech && now - lastVoice > silenceMs) return this.stop();
      if (!heardSpeech && now - started > noSpeechMs) return this.stop();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.timers.push(window.setTimeout(() => this.stop(), maxMs));
    return done;
  }

  /** Ends the turn and returns what was recorded. */
  stop(): void {
    cancelAnimationFrame(this.raf);
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    else {
      this.cleanup();
      this.finish?.(null);
      this.finish = null;
    }
  }

  /** Discards the recording. */
  cancel(): void {
    this.chunks = [];
    this.stop();
  }

  private cleanup() {
    cancelAnimationFrame(this.raf);
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
