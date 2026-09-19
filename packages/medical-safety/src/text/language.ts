import type { Language, LanguagePreference } from '@sanjeevani/types';
import { CLAUSE_BOUNDARY, keyedTokens, phoneticKey, scriptRatio } from './normalize';

// Frequent romanised-Hindi function words and health words. Keys are phonetic.
const HINGLISH_MARKERS = new Set(
  [
    'hai', 'hain', 'ho', 'hu', 'hun', 'tha', 'thi', 'the', 'raha', 'rahi', 'rahe', 'gaya', 'gayi', 'gai',
    'mujhe', 'mujhko', 'mera', 'meri', 'mere', 'hame', 'hamen', 'humko', 'aap', 'aapko', 'tum', 'unko', 'usko',
    'se', 'aur', 'bahut', 'bohot', 'bhot', 'nahi', 'nahin', 'nai', 'kya', 'kaise', 'kyu', 'kyun', 'kab', 'kahan',
    'ka', 'ki', 'ke', 'ko', 'mein', 'me', 'par', 'pe', 'kar', 'karna', 'karu', 'karun', 'chahiye', 'hua', 'hui',
    'lag', 'laga', 'lagi', 'bhi', 'abhi', 'jaldi', 'thoda', 'thodi', 'zyada', 'jyada', 'kuch', 'sab', 'wala',
    'dard', 'bukhar', 'sar', 'sir', 'pet', 'saans', 'sans', 'chakkar', 'ulti', 'dast', 'khansi', 'jukam', 'zukam',
    'din', 'kal', 'aaj', 'raat', 'subah', 'haan', 'han', 'ji', 'nahi', 'bachcha', 'beta', 'beti', 'dawai', 'dawa',
    'ghabrahat', 'kamzori', 'takleef', 'taklif', 'tez', 'halka', 'batao', 'bataiye', 'madad', 'aspatal',
    'namaste', 'namaskar', 'ne', 'liya', 'liye', 'diya', 'kaat', 'kata', 'kutte', 'kutta', 'chot', 'lagi', 'gaye', 'pata', 'karein', 'kijiye',
  ].map(phoneticKey),
);

const ENGLISH_MARKERS = new Set(
  [
    'i', 'am', 'is', 'are', 'was', 'have', 'has', 'had', 'the', 'a', 'my', 'me', 'with', 'and', 'for', 'since',
    'days', 'day', 'what', 'should', 'do', 'it', 'pain', 'feel', 'feeling', 'very', 'since', 'yesterday', 'been',
    'having', 'can', 'not', 'please', 'help', 'where', 'nearest', 'hospital', 'doctor', 'there', 'this', 'that',
  ].map(phoneticKey),
);

export interface LanguageDetection {
  language: Language;
  confidence: number;
  signals: { devanagari: number; hinglishHits: number; englishHits: number };
}

function fromSttCode(code?: string): Language | null {
  if (!code) return null;
  const c = code.toLowerCase();
  if (c === 'hi' || c === 'hin') return 'hi';
  if (c === 'en' || c === 'eng') return 'en';
  return null;
}

/**
 * Deterministic language detection tuned for Hindi / English / Hinglish.
 * Script is the strongest signal; for Latin text we count marker words.
 */
export function detectLanguage(text: string, sttLanguage?: string): LanguageDetection {
  const { devanagari } = scriptRatio(text);
  const tokens = keyedTokens(text).filter((t) => t !== CLAUSE_BOUNDARY);
  let hinglishHits = 0;
  let englishHits = 0;
  for (const t of tokens) {
    if (HINGLISH_MARKERS.has(t)) hinglishHits++;
    if (ENGLISH_MARKERS.has(t)) englishHits++;
  }
  const signals = { devanagari, hinglishHits, englishHits };

  if (devanagari >= 0.3) {
    return { language: 'hi', confidence: Math.min(1, 0.6 + devanagari * 0.4), signals };
  }

  const stt = fromSttCode(sttLanguage);
  const total = Math.max(tokens.length, 1);
  const hinglishRatio = hinglishHits / total;

  if (hinglishHits >= 2 && hinglishRatio >= 0.2) {
    return { language: 'hinglish', confidence: Math.min(1, 0.5 + hinglishRatio), signals };
  }
  // STT heard Hindi but transcribed in Latin script → Hinglish.
  if (stt === 'hi' && devanagari < 0.3) {
    return { language: 'hinglish', confidence: 0.6, signals };
  }
  if (hinglishHits >= 1 && englishHits === 0 && tokens.length <= 4) {
    return { language: 'hinglish', confidence: 0.5, signals };
  }
  if (englishHits > 0 || stt === 'en') {
    return { language: 'en', confidence: Math.min(1, 0.5 + englishHits / total), signals };
  }
  return { language: 'en', confidence: 0.3, signals };
}

/**
 * Picks the language for the reply: explicit preference wins; otherwise follow the
 * user's latest utterance when detection is confident, else keep the previous language.
 */
export function resolveReplyLanguage(
  preference: LanguagePreference,
  detection: LanguageDetection,
  previous: Language | null,
): Language {
  if (preference !== 'auto') return preference;
  if (!previous) return detection.language;
  // Very short answers ("haan", "yes", "2 din") shouldn't flip the language unless unambiguous.
  if (detection.confidence >= 0.55) return detection.language;
  return previous;
}
