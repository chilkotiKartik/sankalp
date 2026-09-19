const DEVANAGARI_DIGITS = '०१२३४५६७८९';
const DEVANAGARI_RE = /[ऀ-ॿ]/;
const DEVANAGARI_GLOBAL_RE = /[ऀ-ॿ]/g;
const LATIN_GLOBAL_RE = /[a-z]/gi;

export function hasDevanagari(text: string): boolean {
  return DEVANAGARI_RE.test(text);
}

export function scriptRatio(text: string): { devanagari: number; latin: number } {
  const dev = text.match(DEVANAGARI_GLOBAL_RE)?.length ?? 0;
  const lat = text.match(LATIN_GLOBAL_RE)?.length ?? 0;
  const total = dev + lat;
  if (total === 0) return { devanagari: 0, latin: 0 };
  return { devanagari: dev / total, latin: lat / total };
}

/**
 * Romanised Hindi has no fixed spelling ("bukhar", "bukhaar", "bukhaaar").
 * The phonetic key flattens the most common variations so lexicon entries
 * only need one spelling per word.
 */
export function phoneticStem(token: string): string {
  if (hasDevanagari(token)) return token.replace(/\u0901/g, '\u0902').replace(/\u093C/g, '');
  return token
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/(.)\1+/g, '$1')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/ph/g, 'f')
    .replace(/q/g, 'k');
}

export function phoneticKey(token: string): string {
  if (hasDevanagari(token)) {
    // Chandrabindu/anusvara are used interchangeably in casual writing and STT output.
    return token.replace(/ँ/g, 'ं').replace(/ं$/u, '').replace(/़/g, '');
  }
  return token
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/(.)\1+/g, '$1')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/ph/g, 'f')
    .replace(/q/g, 'k')
    .replace(/n$/g, '') // nahin → nahi, mein → mei
    .replace(/h$/g, ''); // hai/haih, sirh
}

/** Lowercase, unify digits and punctuation, collapse whitespace. */
export function normalizeText(input: string): string {
  let text = input.normalize('NFC').toLowerCase();
  text = text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  // Sentence/clause punctuation becomes a boundary token so phrase matching and
  // negation windows never leak across clauses ("no fever, headache").
  text = text.replace(/[।॥.,;!?]+/g, ` ${CLAUSE_BOUNDARY} `);
  text = text.replace(/[^\p{L}\p{M}\p{N}\s'|-]/gu, ' ');
  text = text.replace(/['-]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  // Drop leading/trailing/duplicate boundaries.
  return text
    .split(' ')
    .filter((t, i, arr) => !(t === CLAUSE_BOUNDARY && (i === 0 || i === arr.length - 1 || arr[i - 1] === CLAUSE_BOUNDARY)))
    .join(' ');
}

export const CLAUSE_BOUNDARY = '|';

export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  return normalized.length === 0 ? [] : normalized.split(' ');
}

/** Tokens mapped through the phonetic key — use for lexicon matching. */
export function keyedTokens(input: string): string[] {
  return tokenize(input).map(phoneticKey);
}

export function keyPhrase(phrase: string): string[] {
  return keyedTokens(phrase);
}
