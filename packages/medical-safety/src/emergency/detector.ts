import type { EmergencyCategory, ExtractedSymptom, SymptomCode } from '@sanjeevani/types';
import type { Framing } from '../text/framing';
import { detectFraming } from '../text/framing';
import { compileAll, findAny, hasAffirmed, prepareText, type CompiledPhrase } from '../text/matcher';
import {
  CATEGORY_PRIORITY,
  COMPOSITE_RULES,
  HEAD_INJURY_PHRASES,
  PHRASE_RULES,
  type EmergencyContext,
} from './rules';

export interface EmergencyMatch {
  ruleId: string;
  category: EmergencyCategory;
  evidence: string | null;
  instructionSet: string;
}

export interface EmergencyAssessment {
  emergency: boolean;
  primary: EmergencyMatch | null;
  matches: EmergencyMatch[];
  /** Phrases that matched but were negated ("no chest pain") — useful for audits and tests. */
  negatedRuleIds: string[];
  headInjuryMentioned: boolean;
  /** How the utterance was framed in time. `past`/`hypothetical` hold back composite rules. */
  framing: Framing;
}

const compiledPhraseRules = PHRASE_RULES.map((rule) => ({
  rule,
  // Emergency phrases allow one filler word ("can't really breathe") but no more.
  phrases: compileAll(rule.phrases, 1) as CompiledPhrase[],
}));
const compiledHeadInjury = compileAll(HEAD_INJURY_PHRASES, 1);

/**
 * The emergency circuit breaker. Pure, synchronous and deterministic — it never
 * calls an AI model and must run before any routine triage or response generation.
 */
export function assessEmergency(text: string, context: EmergencyContext): EmergencyAssessment {
  const prepared = prepareText(text);
  const matches: EmergencyMatch[] = [];
  const negatedRuleIds: string[] = [];

  for (const { rule, phrases } of compiledPhraseRules) {
    const m = findAny(prepared, phrases);
    if (!m) continue;
    if (m.negated) {
      negatedRuleIds.push(rule.id);
      continue;
    }
    matches.push({
      ruleId: rule.id,
      category: rule.category,
      evidence: m.evidence,
      instructionSet: rule.instructionSet ?? rule.category,
    });
  }

  const headInjuryMentioned = context.headInjury || Boolean(hasAffirmed(prepared, compiledHeadInjury));
  const ctx: EmergencyContext = { ...context, headInjury: headInjuryMentioned };
  const byCode = new Map<SymptomCode, ExtractedSymptom>();
  for (const s of ctx.symptoms) {
    const existing = byCode.get(s.code);
    if (!existing || severityWeight(s.severity) > severityWeight(existing.severity)) byCode.set(s.code, s);
  }
  const has = (code: SymptomCode) => byCode.get(code);

  /*
   * Composite rules fire on generic extracted symptoms, which is exactly where "I had
   * chest pain last year" and "what should I do if someone has chest pain" go wrong.
   * When the utterance is explicitly framed as finished or imagined, those rules are
   * held back — but only on the turn that carries the framing, and only for symptoms
   * introduced by that same turn. Explicit emergency phrases are never suppressed.
   *
   * A framing word cannot switch off an emergency that was already raised: composite
   * rules fire on the turn that introduces the symptom, so by the time a later turn
   * says "that happened last year", the earlier emergency has already been shown and
   * is held in conversation memory.
   */
  const framing = detectFraming(text);
  const suppressComposites = framing !== 'present';

  const dismissed = new Set(ctx.dismissedRuleIds ?? []);
  if (!suppressComposites) {
    for (const rule of COMPOSITE_RULES) {
      if (dismissed.has(rule.id) || matches.some((m) => m.ruleId === rule.id)) continue;
      if (rule.test(ctx, has)) {
        matches.push({ ruleId: rule.id, category: rule.category, evidence: null, instructionSet: rule.category });
      }
    }
  }

  matches.sort((a, b) => CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category));
  // A specific clinical category is more useful than "user asked for an ambulance".
  const primary = matches.find((m) => m.category !== 'user_requested') ?? matches[0] ?? null;

  return { emergency: matches.length > 0, primary, matches, negatedRuleIds, headInjuryMentioned, framing };
}

function severityWeight(s: ExtractedSymptom['severity']): number {
  return s === 'severe' ? 3 : s === 'moderate' ? 2 : s === 'mild' ? 1 : 0;
}
