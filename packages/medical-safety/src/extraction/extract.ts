import type { AgeGroup, Duration, ExtractedSymptom, Severity, SymptomCode } from '@sanjeevani/types';
import { SEVERITY_MODIFIERS, SYMPTOM_LEXICON } from '../lexicon/symptoms';
import { CLAUSE_BOUNDARY, normalizeText, phoneticKey } from '../text/normalize';
import { compileAll, compilePhrase, findAny, prepareText, type CompiledPhrase, type PreparedText } from '../text/matcher';

const NEGATOR_KEYS = new Set(['no', 'not', 'nahi', 'nahin', 'नहीं', 'नही'].map(phoneticKey));

const compiledLexicon: { code: SymptomCode; phrases: CompiledPhrase[] }[] = (
  Object.entries(SYMPTOM_LEXICON) as [SymptomCode, readonly string[]][]
).map(([code, phrases]) => ({
  code,
  phrases: phrases.map((p) => {
    const containsNegator = p.split(/\s+/).some((t) => NEGATOR_KEYS.has(phoneticKey(t)));
    // Two intervening tokens, because Hindi routinely puts intensity between the body
    // part and the sensation — "seene mein bahut tez dard". Clause boundaries still
    // stop the match, so this widens the phrase, not the sentence.
    return compilePhrase(p, containsNegator ? 0 : 2);
  }),
}));

const severeMods = compileAll(SEVERITY_MODIFIERS.severe, 0);
const mildMods = compileAll(SEVERITY_MODIFIERS.mild, 0);
const moderateMods = compileAll(SEVERITY_MODIFIERS.moderate, 0);

function windowText(prepared: PreparedText, start: number, end: number, radius: number): PreparedText {
  let from = start;
  for (let i = start - 1; i >= Math.max(0, start - radius); i--) {
    if (prepared.raw[i] === CLAUSE_BOUNDARY) break;
    from = i;
  }
  let to = end;
  for (let i = end + 1; i <= Math.min(prepared.raw.length - 1, end + radius); i++) {
    if (prepared.raw[i] === CLAUSE_BOUNDARY) break;
    to = i;
  }
  return { raw: prepared.raw.slice(from, to + 1), keys: prepared.keys.slice(from, to + 1) };
}

function severityNear(prepared: PreparedText, start: number, end: number): Severity {
  const win = windowText(prepared, start, end, 3);
  const severe = findAny(win, severeMods);
  const mild = findAny(win, mildMods);
  if (severe && !severe.negated && mild && !mild.negated) return 'moderate';
  if (severe && !severe.negated) return 'severe';
  if (mild && !mild.negated) return 'mild';
  if (findAny(win, moderateMods)) return 'moderate';
  return 'unknown';
}

function painScaleSeverity(normalized: string): Severity | null {
  const m = normalized.match(/\b(\d{1,2}) ?(?:out of|outof|by|\/) ?10\b/) ?? normalized.match(/\b10 (?:mein|me|में) se (\d{1,2})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  if (Number.isNaN(n) || n > 10) return null;
  return n >= 7 ? 'severe' : n >= 4 ? 'moderate' : 'mild';
}

function feverTemperatureSeverity(normalized: string): Severity | null {
  const nums = [...normalized.matchAll(/\b(\d{2,3})\b/g)].map((m) => Number(m[1]));
  for (const n of nums) {
    if (n >= 103 && n <= 108) return 'severe';
    if (n >= 100 && n < 103) return 'moderate';
    if (n >= 40 && n <= 43) return 'severe';
    if (n >= 38 && n < 40) return 'moderate';
  }
  return null;
}

/**
 * How the person says things have changed since they last described them.
 *
 * This matters clinically: the same symptom set that was routine yesterday can
 * warrant same-day care once it is getting worse. It applies to symptoms already
 * known, not to new ones, and it only ever raises severity — "better" relaxes
 * nothing, because someone feeling better is not evidence that a danger sign has
 * resolved.
 */
export type Progression = 'better' | 'same' | 'worse' | null;

const worseMods = compileAll(
  [
    'worse', 'worsening', 'getting worse', 'more severe', 'increased', 'increasing', 'gone up',
    'badh gaya', 'badh raha', 'badh gayi', 'zyada kharab', 'zyada ho gaya', 'bigad gaya', 'bigad raha',
    'aur zyada', 'pehle se zyada', 'tez ho gaya', 'tez ho raha',
    'ज़्यादा ख़राब', 'ज्यादा खराब', 'बढ़ गया', 'बढ़ रहा', 'बिगड़ गया', 'बिगड़ रहा', 'पहले से ज़्यादा', 'तेज़ हो गया',
  ],
  0,
);
const betterMods = compileAll(
  ['better', 'improving', 'improved', 'less', 'reduced', 'theek ho raha', 'behtar', 'kam ho gaya', 'kam hai',
   'बेहतर', 'ठीक हो रहा', 'कम हो गया', 'आराम है'],
  0,
);
const sameMods = compileAll(['same', 'no change', 'unchanged', 'waisa hi', 'wahi hai', 'koi farak nahi', 'वैसा ही', 'कोई फ़र्क नहीं', 'कोई फर्क नहीं'], 0);

export function extractProgression(text: string): Progression {
  const prepared = prepareText(text);
  const worse = findAny(prepared, worseMods);
  if (worse && !worse.negated) return 'worse';
  const better = findAny(prepared, betterMods);
  if (better && !better.negated) return 'better';
  const same = findAny(prepared, sameMods);
  if (same && !same.negated) return 'same';
  return null;
}

export function extractSymptoms(text: string): { affirmed: ExtractedSymptom[]; negated: SymptomCode[] } {
  const prepared = prepareText(text);
  const normalized = normalizeText(text);
  const affirmed: ExtractedSymptom[] = [];
  const negated: SymptomCode[] = [];
  const scale = painScaleSeverity(normalized);

  for (const { code, phrases } of compiledLexicon) {
    const m = findAny(prepared, phrases);
    if (!m) continue;
    if (m.negated) {
      negated.push(code);
      continue;
    }
    let severity = severityNear(prepared, m.start, m.end);
    if (code === 'fever') severity = feverTemperatureSeverity(normalized) ?? severity;
    if (severity === 'unknown' && scale) severity = scale;
    affirmed.push({ code, severity, evidence: m.evidence });
  }

  // "chest pain" also contains generic pain words — drop weaker overlapping codes.
  const codes = new Set(affirmed.map((s) => s.code));
  const filtered = affirmed.filter((s) => {
    if (s.code === 'bleeding' && (codes.has('blood_in_vomit') || codes.has('blood_in_stool') || codes.has('blood_in_urine'))) return false;
    if (s.code === 'palpitations' && codes.has('anxiety') && s.evidence?.includes('ghabrahat')) return false;
    if (s.code === 'nausea' && codes.has('vomiting')) return false;
    return true;
  });
  return { affirmed: filtered, negated };
}

// ---------------------------------------------------------------------------
// Duration

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, couple: 2, few: 3, several: 4,
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, panch: 5, paanch: 5, chhe: 6, che: 6, chhah: 6, saat: 7, sat: 7,
  aath: 8, ath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, dedh: 1.5, dhai: 2.5, aadha: 0.5, adha: 0.5,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'छः': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
  'डेढ़': 1.5, 'ढाई': 2.5,
};

type Unit = 'hour' | 'day' | 'week' | 'month' | 'year';
const UNIT_HOURS: Record<Unit, number> = { hour: 1, day: 24, week: 168, month: 720, year: 8760 };
const UNIT_WORDS: Record<string, Unit> = {
  hour: 'hour', hours: 'hour', hr: 'hour', hrs: 'hour', ghanta: 'hour', ghante: 'hour', ghanton: 'hour', 'घंटे': 'hour', 'घंटा': 'hour', 'घंटों': 'hour',
  day: 'day', days: 'day', din: 'day', dino: 'day', dinon: 'day', 'दिन': 'day', 'दिनों': 'day',
  week: 'week', weeks: 'week', hafta: 'week', hafte: 'week', hafton: 'week', saptah: 'week', 'हफ्ता': 'week', 'हफ्ते': 'week', 'सप्ताह': 'week', 'हफ़्ते': 'week',
  month: 'month', months: 'month', mahina: 'month', mahine: 'month', mahino: 'month', 'महीना': 'month', 'महीने': 'month', 'महीनों': 'month',
  year: 'year', years: 'year', yrs: 'year', saal: 'year', sal: 'year', varsh: 'year', 'साल': 'year', 'वर्ष': 'year',
};
const AGE_MARKERS = new Set(['old', 'ka', 'ki', 'ke', 'का', 'की', 'के', 'aged']);
const DURATION_BEFORE = new Set(['for', 'since', 'past', 'last', 'pichle', 'pichhle', 'पिछले', 'from']);
const DURATION_AFTER = new Set(['se', 'से', 'from', 'ho', 'hue', 'hua', 'now', 'ago', 'pehle', 'पहले', 'hogaye', 'gaye', 'tak']);

/** "2 saal ka" is an age; "2 din ki khansi" is a duration. Short units only mean age with "old". */
function isAgeContext(unit: Unit, after: string | undefined): boolean {
  if (after === undefined) return false;
  if (after === 'old') return true;
  return (unit === 'year' || unit === 'month') && AGE_MARKERS.has(after);
}

function parseNumber(token: string | undefined): number | null {
  if (!token) return null;
  if (/^\d+(\.\d+)?$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
}

const RELATIVE_DURATIONS: { phrase: CompiledPhrase; hours: number; label: string }[] = [
  ['just now', 0.5], ['abhi abhi', 0.5], ['अभी अभी', 0.5], ['few minutes', 0.25], ['kuch minute', 0.25], ['कुछ मिनट', 0.25],
  ['since this morning', 6], ['since morning', 6], ['subah se', 6], ['aaj subah', 6], ['सुबह से', 6], ['आज सुबह', 6],
  ['since today', 6], ['aaj se', 6], ['आज से', 6],
  ['since last night', 12], ['last night', 12], ['kal raat', 12], ['raat se', 12], ['कल रात', 12], ['रात से', 12],
  ['since yesterday', 24], ['yesterday', 24], ['kal se', 24], ['कल से', 24],
  ['day before yesterday', 48], ['parso se', 48], ['parson se', 48], ['परसों से', 48],
  ['since last week', 168], ['last week', 168], ['pichle hafte', 168], ['पिछले हफ्ते', 168],
  ['since last month', 720], ['last month', 720], ['pichle mahine', 720], ['पिछले महीने', 720],
].map(([p, h]) => ({ phrase: compilePhrase(p as string, 0), hours: h as number, label: p as string }));

export interface AgeExtraction {
  ageGroup: AgeGroup;
  years: number | null;
  subject: 'self' | 'other' | 'unknown';
}

export function extractDuration(text: string): Duration | null {
  const prepared = prepareText(text);
  const raw = prepared.raw;
  let best: Duration | null = null;

  for (let i = 0; i < raw.length; i++) {
    const unit = UNIT_WORDS[raw[i]!];
    if (!unit) continue;
    let n = parseNumber(raw[i - 1]);
    let numberIndex = i - 1;
    // "3 4 days" / "3 se 4 din" → use the larger number.
    if (n !== null) {
      const back = parseNumber(raw[i - 2]) ?? (raw[i - 2] === 'se' || raw[i - 2] === 'to' ? parseNumber(raw[i - 3]) : null);
      if (back !== null && back < n) numberIndex = i - 1;
    } else if (raw[i - 1] === 'a' || raw[i - 1] === 'an') {
      n = 1;
    }
    if (n === null) continue;
    const after = raw[i + 1];
    const before = raw[numberIndex - 1];
    if (isAgeContext(unit, after)) continue;
    const durationContext =
      (before !== undefined && DURATION_BEFORE.has(before)) || (after !== undefined && DURATION_AFTER.has(after));
    if ((unit === 'year' || unit === 'month') && !durationContext) continue;
    const hours = n * UNIT_HOURS[unit];
    const candidate: Duration = { hours, text: raw.slice(Math.max(0, numberIndex), i + 1).join(' ') };
    if (!best || (best.hours ?? 0) < hours) best = candidate;
  }
  if (best) return best;

  for (const rel of RELATIVE_DURATIONS) {
    const m = findAny(prepared, [rel.phrase]);
    if (m && !m.negated) return { hours: rel.hours, text: m.evidence };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Age group & subject

const INFANT_WORDS = compileAll(['newborn', 'new born', 'infant', 'navjaat', 'shishu', 'नवजात', 'शिशु'], 0);
const CHILD_WORDS = compileAll(
  [
    'child', 'kid', 'kids', 'son', 'daughter', 'toddler', 'baby', 'my boy', 'my girl',
    'bachcha', 'bacha', 'bachche', 'bacche', 'bachchi', 'bachi', 'beta', 'beti', 'munna', 'munni', 'ladka', 'ladki',
    'बच्चा', 'बच्चे', 'बच्ची', 'बेटा', 'बेटी', 'मुन्ना', 'मुन्नी',
  ],
  0,
);
const OLDER_WORDS = compileAll(
  [
    'elderly', 'old man', 'old woman', 'old lady', 'grandfather', 'grandmother', 'grandpa', 'grandma', 'senior citizen',
    'dadaji', 'dada ji', 'dadi', 'dadi ji', 'nana ji', 'nanaji', 'nani', 'buzurg', 'bujurg', 'budhe', 'boodhe',
    'बुजुर्ग', 'बुज़ुर्ग', 'दादा', 'दादी', 'नाना', 'नानी',
  ],
  0,
);
const SELF_WORDS = new Set([
  'i', 'im', 'me', 'my', 'myself', 'mujhe', 'mujhko', 'mera', 'meri', 'mere', 'main', 'mai', 'khud',
  'मुझे', 'मेरा', 'मेरी', 'मेरे', 'मैं', 'मुझको', 'खुद',
]);
const OTHER_WORDS = new Set([
  'he', 'she', 'his', 'her', 'uncle', 'aunty', 'father', 'mother', 'papa', 'mummy', 'husband', 'wife', 'friend',
  'unko', 'usko', 'inko', 'unhe', 'use', 'pati', 'patni', 'dost', 'पापा', 'मम्मी', 'पति', 'पत्नी', 'उन्हें', 'उसे',
]);

function ageGroupFromYears(years: number): AgeGroup {
  if (years < 1) return 'infant';
  if (years < 13) return 'child';
  if (years >= 60) return 'older_adult';
  return 'adult';
}

export function extractAge(text: string): AgeExtraction {
  const prepared = prepareText(text);
  const raw = prepared.raw;
  let years: number | null = null;

  for (let i = 0; i < raw.length; i++) {
    const unit = UNIT_WORDS[raw[i]!];
    const n = parseNumber(raw[i - 1]);
    if (unit && n !== null) {
      if (isAgeContext(unit, raw[i + 1])) {
        if (unit === 'year') years = n;
        else if (unit === 'month') years = n / 12;
        else if (unit === 'week' || unit === 'day') years = 0.05;
      }
    }
    if (['age', 'aged', 'umar', 'umr', 'उम्र', 'आयु'].includes(raw[i]!)) {
      const next = parseNumber(raw[i + 1]) ?? parseNumber(raw[i + 2]) ?? parseNumber(raw[i + 3]);
      if (next !== null && next < 120) years = next;
    }
  }
  if (years === null) {
    const m = normalizeText(text).match(/\b(?:i am|i m|im|main|mai|मैं) (\d{1,3})\b/);
    if (m && Number(m[1]) < 120) years = Number(m[1]);
  }

  const hasSelf = raw.some((t) => SELF_WORDS.has(t));
  const hasOther = raw.some((t) => OTHER_WORDS.has(t));

  if (years !== null) {
    return { ageGroup: ageGroupFromYears(years), years, subject: hasOther ? 'other' : hasSelf ? 'self' : 'unknown' };
  }
  if (findAny(prepared, INFANT_WORDS)) return { ageGroup: 'infant', years: null, subject: 'other' };
  if (findAny(prepared, CHILD_WORDS)) return { ageGroup: 'child', years: null, subject: 'other' };
  if (findAny(prepared, OLDER_WORDS)) return { ageGroup: 'older_adult', years: null, subject: 'other' };
  if (hasOther) return { ageGroup: 'unknown', years: null, subject: 'other' };
  if (hasSelf) return { ageGroup: 'adult', years: null, subject: 'self' };
  return { ageGroup: 'unknown', years: null, subject: 'unknown' };
}

// ---------------------------------------------------------------------------
// Short answers

const YES = new Set(['yes', 'yeah', 'yep', 'yup', 'haan', 'han', 'ha', 'haa', 'hanji', 'ji', 'bilkul', 'sahi', 'correct', 'right', 'हाँ', 'हां', 'जी', 'बिल्कुल', 'हाँजी'].map(phoneticKey));
const NO = new Set(['no', 'nope', 'nahi', 'nahin', 'nai', 'na', 'nhi', 'नहीं', 'नही', 'ना', 'not'].map(phoneticKey));

export function parseYesNo(text: string): 'yes' | 'no' | null {
  const keys = prepareText(text).keys.filter((k) => k !== CLAUSE_BOUNDARY);
  if (keys.length === 0) return null;
  const head = keys.slice(0, 2);
  if (head.some((k) => NO.has(k))) return 'no';
  if (head.some((k) => YES.has(k))) return 'yes';
  if (keys.length <= 6) {
    if (keys.some((k) => NO.has(k))) return 'no';
    if (keys.some((k) => YES.has(k))) return 'yes';
  }
  return null;
}

export function parseSeverityAnswer(text: string): Severity | null {
  const prepared = prepareText(text);
  const normalized = normalizeText(text);
  const scale = painScaleSeverity(normalized) ?? (/^\d{1,2}$/.test(normalized) && Number(normalized) <= 10
    ? (Number(normalized) >= 7 ? 'severe' : Number(normalized) >= 4 ? 'moderate' : 'mild')
    : null);
  if (scale) return scale;
  const severe = findAny(prepared, severeMods);
  const mild = findAny(prepared, mildMods);
  if (severe && !severe.negated) return 'severe';
  if (mild && !mild.negated) return 'mild';
  if (findAny(prepared, moderateMods)) return 'moderate';
  if (findAny(prepared, compileAll(['theek', 'thik', 'normal', 'manageable', 'bearable', 'ठीक'], 0))) return 'mild';
  return null;
}

export function mentionsPregnancy(symptoms: readonly ExtractedSymptom[]): boolean {
  return symptoms.some((s) => s.code === 'pregnancy_concern');
}
