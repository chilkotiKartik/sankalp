import type { LanguagePreference } from '@sanjeevani/types';

export interface Preferences {
  language: LanguagePreference;
  textSize: 'normal' | 'large' | 'xlarge';
  highContrast: boolean;
  /** null follows the operating-system setting. */
  reduceMotion: boolean | null;
  theme: 'system' | 'light' | 'dark';
  voiceReplies: boolean;
  autoListen: boolean;
  speechRate: 'slow' | 'normal';
  greeted: boolean;
  /**
   * One trusted person to reach in an emergency. Held only in this browser and
   * never sent to any server — a phone number is exactly the kind of detail that
   * should not leave the device to make a feature work.
   */
  emergencyContact: EmergencyContact | null;
  /** Patchy or metered connection: skip server audio and map tiles. */
  dataSaver: boolean;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  /** Free text, e.g. "Brother", "Neighbour" — shown so the right person is obvious. */
  relation?: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  language: 'auto',
  textSize: 'normal',
  highContrast: false,
  reduceMotion: null,
  theme: 'system',
  voiceReplies: true,
  autoListen: true,
  speechRate: 'normal',
  greeted: false,
  emergencyContact: null,
  dataSaver: false,
};

/**
 * Accepts the shapes people actually type: +91 98765 43210, 098765-43210, 011 2345 6789.
 * Deliberately permissive about formatting and strict only about length, because a
 * number rejected here is a person not reached.
 */
export function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^[+\d][\d\s\-()]*$/.test(trimmed)) return null;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 3 || digits.length > 15) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

export const PREFS_KEY = 'sv:prefs';
export const SAVED_KEY = 'sv:saved';
export const LOCATION_KEY = 'sv:location';

/** Storage can be unavailable (private mode, blocked cookies) — never let that break the app. */
export function readJson<T>(storage: 'local' | 'session', key: string, fallback: T): T {
  try {
    const store = storage === 'local' ? window.localStorage : window.sessionStorage;
    const raw = store.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function readArray<T>(storage: 'local' | 'session', key: string): T[] {
  try {
    const store = storage === 'local' ? window.localStorage : window.sessionStorage;
    const parsed: unknown = JSON.parse(store.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeJson(storage: 'local' | 'session', key: string, value: unknown): void {
  try {
    const store = storage === 'local' ? window.localStorage : window.sessionStorage;
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — preference applies for this visit only */
  }
}

export function removeKey(storage: 'local' | 'session', key: string): void {
  try {
    (storage === 'local' ? window.localStorage : window.sessionStorage).removeItem(key);
  } catch {
    /* ignore */
  }
}

export function applyPreferencesToDocument(p: Preferences): void {
  const root = document.documentElement;
  root.dataset.text = p.textSize;
  root.dataset.contrast = p.highContrast ? 'high' : 'normal';
  if (p.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = p.theme;
  if (p.reduceMotion === null) delete root.dataset.motion;
  else root.dataset.motion = p.reduceMotion ? 'reduce' : 'full';
}

/** Runs before hydration to avoid a flash of the wrong theme or text size. */
export const PREFERENCES_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem('${PREFS_KEY}')||'{}');var r=document.documentElement;if(p.textSize)r.dataset.text=p.textSize;if(p.highContrast)r.dataset.contrast='high';if(p.theme&&p.theme!=='system')r.dataset.theme=p.theme;if(p.reduceMotion===true)r.dataset.motion='reduce';if(p.reduceMotion===false)r.dataset.motion='full';var l=p.language;if(l==='hi')r.lang='hi';}catch(e){}})();`;
