import { SYMPTOM_LABELS } from '@sanjeevani/medical-safety';
import type { ExtractedSymptom, Language } from '@sanjeevani/types';

export function formatDuration(hours: number | null | undefined, language: Language): string | null {
  if (hours === null || hours === undefined) return null;
  const en = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (hours < 1) {
    return { en: 'just now', hi: 'अभी-अभी से', hinglish: 'abhi-abhi se' }[language];
  }
  if (hours < 20) {
    const h = Math.round(hours);
    return { en: `for about ${en(h, 'hour')}`, hi: `लगभग ${h} घंटे से`, hinglish: `lagbhag ${h} ghante se` }[language];
  }
  if (hours < 24 * 7) {
    const d = Math.max(1, Math.round(hours / 24));
    return { en: `for ${en(d, 'day')}`, hi: `${d} दिन से`, hinglish: `${d} din se` }[language];
  }
  if (hours < 24 * 60) {
    const w = Math.round(hours / 168);
    return { en: `for ${en(w, 'week')}`, hi: `${w} हफ्ते से`, hinglish: `${w} hafte se` }[language];
  }
  const m = Math.round(hours / 720);
  return { en: `for ${en(m, 'month')}`, hi: `${m} महीने से`, hinglish: `${m} mahine se` }[language];
}

export function joinList(items: string[], language: Language): string {
  if (items.length <= 1) return items[0] ?? '';
  const and = { en: 'and', hi: 'और', hinglish: 'aur' }[language];
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

export function symptomPhrase(symptoms: readonly ExtractedSymptom[], language: Language, limit = 3): string {
  return joinList(symptoms.slice(0, limit).map((s) => SYMPTOM_LABELS[s.code][language]), language);
}

export function formatKm(meters: number): string {
  const km = meters / 1000;
  return km < 10 ? km.toFixed(1) : String(Math.round(km));
}

export function formatMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

/**
 * Makes display text pleasant to hear: no symbols, spelled units, and digit-by-digit
 * helpline numbers so TTS says "one one two", not "one hundred and twelve".
 */
export function toSpeech(text: string, language: Language): string {
  let s = text;
  s = s.replace(/24\s*[×x]\s*7/g, { en: 'round-the-clock', hi: 'चौबीसों घंटे', hinglish: 'chaubison ghante' }[language]);
  s = s.replace(/(\d+(?:\.\d+)?)\s?km\b/g, (_, n: string) => `${n} ${{ en: 'kilometres', hi: 'किलोमीटर', hinglish: 'kilometre' }[language]}`);
  s = s.replace(/(\d+)\s?min\b/g, (_, n: string) => `${n} ${{ en: 'minutes', hi: 'मिनट', hinglish: 'minute' }[language]}`);
  s = s.replace(/\b(112|108|14416)\b/g, (n: string) => n.split('').join(' '));
  s = s.replace(/\s*[—–]\s*/g, ', ').replace(/\s*[•·]\s*/g, '. ');
  s = s.replace(/OPD/g, 'O P D').replace(/ओपीडी/g, 'ओ पी डी');
  s = s.replace(/\s{2,}/g, ' ');
  return s.trim();
}
