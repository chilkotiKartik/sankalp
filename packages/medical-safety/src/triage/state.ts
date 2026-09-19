import type { AgeGroup, Duration, EmergencyCategory, ExtractedSymptom, Severity, SymptomCode } from '@sanjeevani/types';
import type { RedFlagScreenId } from './profiles';

export type FollowUpSlot =
  | { kind: 'red_flag'; screen: RedFlagScreenId }
  | { kind: 'duration' }
  | { kind: 'age_group' }
  | { kind: 'severity'; code: SymptomCode }
  | { kind: 'symptom_detail' };

export type ScreenAnswer = 'positive' | 'negative' | 'unclear';

/**
 * Everything the triage engine knows about the patient, accumulated across turns.
 * Serializable — persisted (encrypted) with the conversation.
 */
export interface ClinicalState {
  /** Symptoms found by the deterministic extractor — the only ones the emergency layer trusts. */
  symptoms: ExtractedSymptom[];
  /** Extra symptoms suggested by the AI layer (validated codes). Used for routine triage only. */
  aiSymptoms: ExtractedSymptom[];
  /** Set when the AI suspects an emergency the rules did not see — triggers a confirmation question. */
  /**
   * A possible emergency that the deterministic phrase rules did not catch outright.
   * Set either by the AI layer, or by a positive answer to a compound red-flag screen
   * that bundles emergency-grade signs. It never escalates on its own — it only causes
   * the fixed `ai_emergency_confirm` question to be asked, and the answer to *that*
   * decides.
   */
  suspectedEmergencyCategory: EmergencyCategory | null;
  negatedSymptoms: SymptomCode[];
  duration: Duration | null;
  ageGroup: AgeGroup;
  ageYears: number | null;
  subject: 'self' | 'other' | 'unknown';
  pregnant: boolean;
  headInjury: boolean;
  screens: Partial<Record<RedFlagScreenId, ScreenAnswer>>;
  /** How the person says things have changed since they last described them. */
  progression: 'better' | 'same' | 'worse' | null;
  askedSlots: string[];
  pendingSlot: FollowUpSlot | null;
  followUpsAsked: number;
  /** Composite emergency rules the user explicitly dismissed ("this isn't an emergency"). */
  dismissedEmergencyRules: string[];
}

export function emptyClinicalState(): ClinicalState {
  return {
    symptoms: [],
    aiSymptoms: [],
    suspectedEmergencyCategory: null,
    negatedSymptoms: [],
    duration: null,
    ageGroup: 'unknown',
    ageYears: null,
    subject: 'unknown',
    pregnant: false,
    headInjury: false,
    screens: {},
    progression: null,
    askedSlots: [],
    pendingSlot: null,
    followUpsAsked: 0,
    dismissedEmergencyRules: [],
  };
}

const SEVERITY_ORDER: Severity[] = ['unknown', 'mild', 'moderate', 'severe'];

export function mergeSymptoms(existing: readonly ExtractedSymptom[], incoming: readonly ExtractedSymptom[]): ExtractedSymptom[] {
  const map = new Map<SymptomCode, ExtractedSymptom>();
  for (const s of existing) map.set(s.code, s);
  for (const s of incoming) {
    const prev = map.get(s.code);
    if (!prev) {
      map.set(s.code, s);
      continue;
    }
    const severity = SEVERITY_ORDER.indexOf(s.severity) > SEVERITY_ORDER.indexOf(prev.severity) ? s.severity : prev.severity;
    map.set(s.code, { ...prev, severity, evidence: s.evidence ?? prev.evidence });
  }
  return [...map.values()];
}

export function slotKey(slot: FollowUpSlot): string {
  switch (slot.kind) {
    case 'red_flag':
      return `red_flag:${slot.screen}`;
    case 'severity':
      return `severity:${slot.code}`;
    default:
      return slot.kind;
  }
}
