import { CLAUSE_BOUNDARY, phoneticKey, phoneticStem, tokenize } from './normalize';

/**
 * A compiled phrase. Tokens are phonetic keys; a token ending in "~" is a prefix match.
 * Consecutive phrase tokens may be separated by up to `maxGap` other tokens within a clause.
 */
export interface CompiledPhrase {
  source: string;
  tokens: { key: string; prefix: boolean }[];
  maxGap: number;
}

export interface PreparedText {
  raw: string[];
  keys: string[];
}

export interface PhraseMatch {
  phrase: string;
  start: number;
  end: number;
  negated: boolean;
  evidence: string;
}

export function compilePhrase(source: string, maxGap = 2): CompiledPhrase {
  const tokens = source
    .trim()
    .split(/\s+/)
    .map((t) => {
      const prefix = t.endsWith('~');
      const bare = prefix ? t.slice(0, -1) : t;
      const normalized = tokenize(bare).join('');
      return { key: prefix ? phoneticStem(normalized) : phoneticKey(normalized), prefix };
    })
    .filter((t) => t.key.length > 0);
  return { source, tokens, maxGap };
}

export function prepareText(text: string): PreparedText {
  const raw = tokenize(text);
  return { raw, keys: raw.map(phoneticKey) };
}

function tokenMatches(key: string, pattern: { key: string; prefix: boolean }): boolean {
  if (pattern.prefix) return key.startsWith(pattern.key);
  return key === pattern.key;
}

const EN_NEGATORS = new Set(['no', 'not', 'never', 'without', 'denies', 'nor', 'none']);
const EN_NEG_AUX = new Set(['don', 'didn', 'doesn', 'haven', 'hasn', 'isn', 'aren', 'wasn', 'weren']);
const HI_NEGATORS_AFTER = new Set(['nahi', 'nai', 'na', 'nahin', 'nhi', 'नहीं', 'नही', 'न'].map(phoneticKey));
const HI_NEGATORS_BEFORE = new Set(['bina', 'बिना'].map(phoneticKey));
const CLAUSE_BREAKERS = new Set([CLAUSE_BOUNDARY, 'but', 'however', 'though', 'although', 'lekin', 'magar', 'par', 'लेकिन', 'मगर', 'पर', 'bas', 'sirf', 'only']);

function isNegated(prepared: PreparedText, start: number, end: number): boolean {
  const { raw, keys } = prepared;
  // English: negator up to 3 tokens before, stopping at a clause break.
  for (let i = start - 1; i >= Math.max(0, start - 4); i--) {
    const r = raw[i]!;
    if (CLAUSE_BREAKERS.has(r)) break;
    if (EN_NEGATORS.has(r)) return true;
    if (r === 't' && i > 0 && EN_NEG_AUX.has(raw[i - 1]!)) return true;
    if (HI_NEGATORS_BEFORE.has(keys[i]!)) return true;
  }
  // Hindi/Hinglish: negator within 2 tokens after the phrase ("bukhar nahi hai").
  for (let i = end + 1; i <= Math.min(keys.length - 1, end + 2); i++) {
    if (CLAUSE_BREAKERS.has(raw[i]!)) break;
    if (HI_NEGATORS_AFTER.has(keys[i]!)) return true;
  }
  return false;
}

export function findPhrase(prepared: PreparedText, phrase: CompiledPhrase): PhraseMatch | null {
  const { keys, raw } = prepared;
  const first = phrase.tokens[0];
  if (!first) return null;
  let firstNegated: PhraseMatch | null = null;

  for (let s = 0; s < keys.length; s++) {
    if (!tokenMatches(keys[s]!, first)) continue;
    let pos = s;
    let ok = true;
    for (let p = 1; p < phrase.tokens.length; p++) {
      const pattern = phrase.tokens[p]!;
      let found = -1;
      for (let j = pos + 1; j <= Math.min(keys.length - 1, pos + 1 + phrase.maxGap); j++) {
        if (keys[j] === CLAUSE_BOUNDARY) break;
        if (tokenMatches(keys[j]!, pattern)) {
          found = j;
          break;
        }
      }
      if (found === -1) {
        ok = false;
        break;
      }
      pos = found;
    }
    if (!ok) continue;
    const match: PhraseMatch = {
      phrase: phrase.source,
      start: s,
      end: pos,
      negated: isNegated(prepared, s, pos),
      evidence: raw.slice(s, pos + 1).join(' ').slice(0, 80),
    };
    // Prefer an affirmed occurrence if the phrase appears more than once.
    if (!match.negated) return match;
    firstNegated ??= match;
  }
  return firstNegated;
}

export function findAny(prepared: PreparedText, phrases: CompiledPhrase[]): PhraseMatch | null {
  let negated: PhraseMatch | null = null;
  for (const p of phrases) {
    const m = findPhrase(prepared, p);
    if (m && !m.negated) return m;
    if (m) negated ??= m;
  }
  return negated;
}

export function hasAffirmed(prepared: PreparedText, phrases: CompiledPhrase[]): PhraseMatch | null {
  const m = findAny(prepared, phrases);
  return m && !m.negated ? m : null;
}

export function compileAll(phrases: readonly string[], maxGap = 2): CompiledPhrase[] {
  return phrases.map((p) => compilePhrase(p, maxGap));
}
