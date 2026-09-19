import { INDIA_EMERGENCY_CONTACTS } from '@sanjeevani/config';
import type { Urgency } from '@sanjeevani/types';

export type GuardViolation =
  | 'claims_to_be_doctor'
  | 'definitive_diagnosis'
  | 'medication_dosing'
  | 'prescribes_medication'
  | 'discourages_care'
  | 'unverified_phone_number'
  | 'too_long'
  | 'empty';

export interface GuardResult {
  ok: boolean;
  violations: GuardViolation[];
}

const PATTERNS: { id: GuardViolation; re: RegExp }[] = [
  { id: 'claims_to_be_doctor', re: /\b(i am|i'm|as) (a|your) (doctor|physician)\b|मैं (एक )?डॉक्टर हूं|main (ek )?doctor hoon/i },
  {
    id: 'definitive_diagnosis',
    re: /\byou (definitely |certainly |clearly )?(have|are suffering from) (a |an )?(dengue|malaria|typhoid|covid|tuberculosis|tb|cancer|pneumonia|diabetes|heart attack|stroke|appendicitis|infection)\b|\b(diagnosis is|you are diagnosed)\b|aapko (pakka |definitely )?(dengue|malaria|typhoid|tb) (hai|he)|आपको (पक्का )?(डेंगू|मलेरिया|टाइफाइड|टीबी) है/i,
  },
  { id: 'medication_dosing', re: /\b\d+(\.\d+)?\s?(mg|mcg|ml|milligram|tablet|tablets|goli|गोली)s?\b/i },
  {
    id: 'prescribes_medication',
    re: /\b(take|start|khayein|lein|le lo|kha lo)\b[^.]{0,30}\b(antibiotic|azithromycin|amoxicillin|paracetamol|ibuprofen|crocin|dolo|steroid|aspirin)\b|\b(antibiotic|azithromycin|amoxicillin|ibuprofen|steroid|aspirin)\b/i,
  },
  {
    id: 'discourages_care',
    re: /\b(no need to (see|visit|consult) (a )?doctor|don'?t (need to )?(see|visit) (a )?doctor|nothing to worry|not serious|doctor ki zarurat nahi|डॉक्टर की ज़रूरत नहीं)\b/i,
  },
];

// Allowed numbers: verified helplines. Facility numbers are passed in per call.
const BASE_ALLOWED_NUMBERS = new Set(INDIA_EMERGENCY_CONTACTS.map((c) => c.number));

const DIAL_CONTEXT = /(call|dial|phone|number|helpline|contact|कॉल|नंबर|फ़ोन|फोन)\W*(on|at|par|पर)?\W*$/i;

/** Long digit runs, or short ones right after "call"/"dial" — i.e. things a user might phone. */
function extractPhoneLike(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/\+?\d[\d\s-]{1,14}\d/g)) {
    const compact = m[0].replace(/[\s-]/g, '');
    const digits = compact.replace(/\D/g, '');
    const before = text.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0);
    if (digits.length >= 5 || (digits.length >= 3 && DIAL_CONTEXT.test(before))) found.push(compact);
  }
  return found;
}

export interface GuardOptions {
  urgency: Urgency;
  maxChars?: number;
  allowedNumbers?: readonly string[];
}

/**
 * Validates AI-generated user-facing text. Anything that fails is replaced by the
 * deterministic template upstream — the model never gets a second chance to speak.
 */
export function guardAssistantText(text: string, options: GuardOptions): GuardResult {
  const violations: GuardViolation[] = [];
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, violations: ['empty'] };
  if (trimmed.length > (options.maxChars ?? 700)) violations.push('too_long');

  for (const { id, re } of PATTERNS) {
    if (re.test(trimmed)) violations.push(id);
  }

  const allowed = new Set([...BASE_ALLOWED_NUMBERS, ...(options.allowedNumbers ?? []).map((n) => n.replace(/[\s-]/g, ''))]);
  for (const n of extractPhoneLike(trimmed)) {
    const digits = n.replace(/\D/g, '');
    // "+91 124 4588 888" and "01244588888" are the same number in different national/international forms.
    const allowedDigits = [...allowed].some((a) => {
      const ad = a.replace(/\D/g, '');
      if (ad === digits) return true;
      return digits.length >= 10 && ad.length >= 10 && ad.slice(-10) === digits.slice(-10);
    });
    if (!allowed.has(n) && !allowedDigits) violations.push('unverified_phone_number');
  }
  return { ok: violations.length === 0, violations: [...new Set(violations)] };
}
