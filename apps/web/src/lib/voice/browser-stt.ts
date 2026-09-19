import type { Language, LanguagePreference } from '@sanjeevani/types';

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function browserSttSupported(): boolean {
  return ctor() !== null;
}

/** hi-IN recognises Hindi, Hinglish and most English words, so it's the best default for "auto". */
export function recognitionLang(pref: LanguagePreference, _last: Language): string {
  return pref === 'en' ? 'en-IN' : 'hi-IN';
}

export class BrowserSttError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BrowserSttError';
  }
}

/**
 * On-device / browser-provided speech recognition (Web Speech API).
 * Used when no server speech-to-text is configured.
 */
export class BrowserRecognizer {
  private recognition: Recognition | null = null;

  listen(options: { lang: string; onInterim: (text: string) => void; onLevel: (level: number) => void }): Promise<string> {
    const Ctor = ctor();
    if (!Ctor) return Promise.reject(new BrowserSttError('unsupported'));
    const rec = new Ctor();
    this.recognition = rec;
    rec.lang = options.lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let finalText = '';
    let pulse = 0;
    const pulseTimer = window.setInterval(() => {
      pulse *= 0.82;
      options.onLevel(pulse);
    }, 50);

    return new Promise((resolve, reject) => {
      rec.onspeechstart = () => {
        pulse = 0.6;
      };
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]!;
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        pulse = Math.min(1, 0.45 + Math.random() * 0.5);
        options.onInterim((finalText + ' ' + interim).trim());
      };
      rec.onerror = (e) => {
        window.clearInterval(pulseTimer);
        options.onLevel(0);
        if (e.error === 'no-speech' || e.error === 'aborted') resolve('');
        else reject(new BrowserSttError(e.error));
      };
      rec.onend = () => {
        window.clearInterval(pulseTimer);
        options.onLevel(0);
        this.recognition = null;
        resolve(finalText.trim());
      };
      try {
        rec.start();
      } catch {
        window.clearInterval(pulseTimer);
        reject(new BrowserSttError('start_failed'));
      }
    });
  }

  stop() {
    this.recognition?.stop();
  }

  abort() {
    this.recognition?.abort();
  }
}
