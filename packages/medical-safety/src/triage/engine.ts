import { maxUrgency, urgencyRank } from '@sanjeevani/types/constants';
import type {
  EmergencyCategory,
  FacilityType,
  ExtractedSymptom,
  Language,
  Specialty,
  Severity,
  SymptomCode,
  TriageResult,
  Urgency,
} from '@sanjeevani/types';
import { CARE_ADVICE, WARNING_SIGNS, type CareAdviceKey, type WarningSignKey } from '../content/guidance';
import { SPECIALTY_LABELS } from '../content/labels';
import { fill, type Localized } from '../content/localized';
import {
  extractAge,
  extractDuration,
  extractProgression,
  extractSymptoms,
  mentionsPregnancy,
  parseSeverityAnswer,
  parseYesNo,
} from '../extraction/extract';
import { RED_FLAG_SCREENS, SYMPTOM_PROFILES, type RedFlagScreenId } from './profiles';
import { mergeSymptoms, slotKey, type ClinicalState, type FollowUpSlot } from './state';

export const MAX_FOLLOW_UPS = 3;

const PAIN_CODES = new Set<SymptomCode>([
  'headache', 'abdominal_pain', 'body_ache', 'back_pain', 'joint_pain', 'ear_pain', 'toothache', 'eye_pain', 'sore_throat',
]);
const SPECIALTIES_KEPT_FOR_CHILDREN = new Set<Specialty>(['dental', 'ophthalmology', 'ent', 'orthopedics', 'psychiatry']);
const SELF_ONLY = /\b(myself|khud|for me|mere liye|apne liye)\b|मेरे लिए|खुद/;

export interface InputOutcome {
  state: ClinicalState;
  newSymptoms: SymptomCode[];
  answeredSlot: FollowUpSlot | null;
  screenResult: { screen: RedFlagScreenId; answer: 'positive' | 'negative' | 'unclear' } | null;
}

/** Folds a user utterance into the clinical state, resolving any pending follow-up. */
export function applyUserInput(prev: ClinicalState, text: string): InputOutcome {
  const state: ClinicalState = structuredClone(prev);
  const { affirmed, negated } = extractSymptoms(text);
  const duration = extractDuration(text);
  const age = extractAge(text);
  const pending = state.pendingSlot;
  let screenResult: InputOutcome['screenResult'] = null;

  if (pending) {
    switch (pending.kind) {
      case 'red_flag': {
        const screen = RED_FLAG_SCREENS[pending.screen];
        const yn = parseYesNo(text);
        const answer = yn === null ? 'unclear' : yn === screen.positiveAnswer ? 'positive' : 'negative';
        state.screens[pending.screen] = answer;
        screenResult = { screen: pending.screen, answer };
        // A compound screen that bundles emergency-grade signs queues the fixed
        // confirmation question rather than guessing which sign was meant.
        if (answer === 'positive' && screen.confirmEmergencyAs && !state.screens.ai_emergency_confirm) {
          state.suspectedEmergencyCategory = screen.confirmEmergencyAs;
        }
        break;
      }
      case 'duration': {
        if (!duration) {
          const bare = text.trim().match(/^(\d{1,3})$/);
          if (bare) state.duration = { hours: Number(bare[1]) * 24, text: `${bare[1]} days` };
        }
        break;
      }
      case 'age_group': {
        if (age.ageGroup === 'unknown' && SELF_ONLY.test(text.toLowerCase())) {
          state.ageGroup = 'adult';
          state.subject = 'self';
        }
        break;
      }
      case 'severity': {
        const severity = parseSeverityAnswer(text);
        if (severity) {
          state.symptoms = state.symptoms.map((s) => (s.code === pending.code ? { ...s, severity } : s));
        }
        break;
      }
      case 'symptom_detail':
        break;
    }
    state.pendingSlot = null;
  }

  const before = new Set(state.symptoms.map((s) => s.code));
  state.symptoms = mergeSymptoms(state.symptoms, affirmed);
  const newSymptoms = affirmed.map((s) => s.code).filter((c) => !before.has(c));
  const affirmedCodes = new Set(state.symptoms.map((s) => s.code));
  state.negatedSymptoms = [...new Set([...state.negatedSymptoms, ...negated])].filter((c) => !affirmedCodes.has(c));

  if (duration && (state.duration === null || (duration.hours ?? 0) > (state.duration.hours ?? 0))) {
    state.duration = duration;
  }
  if (age.years !== null) {
    state.ageYears = age.years;
    state.ageGroup = age.ageGroup;
  } else if (age.ageGroup !== 'unknown' && (state.ageGroup === 'unknown' || age.subject === 'other')) {
    // "Mujhe" only sets adult if nothing more specific is known.
    if (!(age.ageGroup === 'adult' && state.ageGroup !== 'unknown')) state.ageGroup = age.ageGroup;
  }
  if (age.subject !== 'unknown' && state.subject === 'unknown') state.subject = age.subject;
  if (mentionsPregnancy(affirmed)) state.pregnant = true;

  /*
   * "It's worse than before" is a real clinical signal, so it raises the severity of
   * what is already known — one step, never past severe, and only for symptoms whose
   * severity was not explicitly stated this turn. It only ever escalates: "better"
   * lowers nothing, because feeling better is not evidence that a danger sign has
   * gone, and lowering severity on a self-report is the wrong direction to be wrong in.
   */
  const progression = extractProgression(text);
  if (progression) {
    state.progression = progression;
    if (progression === 'worse') {
      const statedNow = new Set(affirmed.filter((a) => a.severity !== 'unknown').map((a) => a.code));
      state.symptoms = state.symptoms.map((symptom) =>
        statedNow.has(symptom.code) ? symptom : { ...symptom, severity: escalate(symptom.severity) },
      );
    }
  }

  return { state, newSymptoms, answeredSlot: pending, screenResult };
}

/** One step up the severity ladder. Severe is the ceiling. */
function escalate(severity: Severity): Severity {
  if (severity === 'severe') return 'severe';
  if (severity === 'moderate') return 'severe';
  return 'moderate';
}

function allSymptoms(state: ClinicalState): ExtractedSymptom[] {
  const known = new Set(state.symptoms.map((s) => s.code));
  return [...state.symptoms, ...state.aiSymptoms.filter((s) => !known.has(s.code))];
}

function leadSymptoms(state: ClinicalState) {
  return allSymptoms(state).sort((a, b) => {
    const wa = SYMPTOM_PROFILES[a.code].weight + (a.severity === 'severe' ? 2 : 0);
    const wb = SYMPTOM_PROFILES[b.code].weight + (b.severity === 'severe' ? 2 : 0);
    return wb - wa;
  });
}

/** Chooses the single most useful next question, or null when we know enough. */
export function planFollowUp(state: ClinicalState, maxFollowUps = MAX_FOLLOW_UPS): FollowUpSlot | null {
  const asked = new Set(state.askedSlots);
  const can = (slot: FollowUpSlot) => !asked.has(slotKey(slot));

  if (state.suspectedEmergencyCategory && !state.screens.ai_emergency_confirm) {
    const slot: FollowUpSlot = { kind: 'red_flag', screen: 'ai_emergency_confirm' };
    if (can(slot)) return slot;
  }
  if (allSymptoms(state).length === 0) {
    const slot: FollowUpSlot = { kind: 'symptom_detail' };
    return can(slot) ? slot : null;
  }
  if (state.followUpsAsked >= maxFollowUps) return null;

  const ordered = leadSymptoms(state);
  const lead = ordered[0]!;

  for (const s of ordered) {
    const screenId = SYMPTOM_PROFILES[s.code].screen;
    if (!screenId || state.screens[screenId]) continue;
    const slot: FollowUpSlot = { kind: 'red_flag', screen: screenId };
    if (can(slot)) return slot;
  }

  const durationSlot: FollowUpSlot = { kind: 'duration' };
  if (state.duration === null && !SYMPTOM_PROFILES[lead.code].acute && can(durationSlot)) return durationSlot;

  const ageSlot: FollowUpSlot = { kind: 'age_group' };
  if (state.ageGroup === 'unknown' && state.subject !== 'self' && can(ageSlot)) return ageSlot;

  if (PAIN_CODES.has(lead.code) && lead.severity === 'unknown') {
    const sevSlot: FollowUpSlot = { kind: 'severity', code: lead.code };
    if (can(sevSlot)) return sevSlot;
  }
  return null;
}

export type ContextNote = 'viral_pattern' | 'long_cough' | 'hydration_focus' | 'blood_test_possible' | 'bite_time_sensitive';

export interface TriageDecision {
  urgency: Urgency;
  emergencyCategory: EmergencyCategory | null;
  specialty: Specialty;
  facilityType: FacilityType;
  leadSymptom: SymptomCode | null;
  rationale: string[];
  care: CareAdviceKey[];
  warnings: WarningSignKey[];
  notes: ContextNote[];
  confidence: TriageResult['confidence'];
}

const raiseOne = (u: Urgency): Urgency => (u === 'self_care' ? 'routine' : u === 'routine' ? 'urgent' : u);

/** Deterministic triage. The AI layer may only ever raise the urgency this returns. */
export function evaluateTriage(state: ClinicalState): TriageDecision {
  const rationale: string[] = [];
  const symptoms = allSymptoms(state);
  const aiOnly = new Set(state.aiSymptoms.map((s) => s.code).filter((c) => !state.symptoms.some((r) => r.code === c)));
  const has = (c: SymptomCode) => symptoms.find((s) => s.code === c);
  const hours = state.duration?.hours ?? null;
  const ordered = leadSymptoms(state);
  const lead = ordered[0] ?? null;
  let emergencyCategory: EmergencyCategory | null = null;

  let urgency: Urgency = ordered.length === 0 ? 'routine' : 'self_care';
  for (const s of ordered) {
    const p = SYMPTOM_PROFILES[s.code];
    let u = p.baseUrgency;
    // AI-suggested symptoms can never, on their own, produce an emergency.
    if (aiOnly.has(s.code) && u === 'emergency') {
      u = 'urgent';
      rationale.push(`ai.capped:${s.code}`);
    }
    if (s.severity === 'severe' && urgencyRank(u) < urgencyRank('urgent')) {
      u = raiseOne(u);
      rationale.push(`severity.severe:${s.code}`);
    }
    if (urgencyRank(u) > urgencyRank(urgency)) rationale.push(`base:${s.code}:${u}`);
    urgency = maxUrgency(urgency, u);
  }

  const raise = (to: Urgency, reason: string) => {
    if (urgencyRank(to) > urgencyRank(urgency)) {
      urgency = to;
      rationale.push(reason);
    }
  };

  // Duration
  if (has('fever') && hours !== null && hours >= 72) raise('urgent', 'duration.fever_3_days');
  if (has('fever') && hours !== null && hours >= 48) raise('routine', 'duration.fever_2_days');
  if (has('cough') && hours !== null && hours >= 336) raise('routine', 'duration.cough_2_weeks');
  if ((has('vomiting') || has('diarrhea')) && hours !== null && hours >= 48) raise('routine', 'duration.gi_2_days');
  if (hours !== null && hours >= 336) raise('routine', 'duration.over_2_weeks');
  if (has('headache') && hours !== null && hours >= 72) raise('routine', 'duration.headache_3_days');

  // Combinations
  if (has('fever') && has('rash')) raise('urgent', 'combo.fever_rash');
  if (has('fever') && (has('vomiting') || has('abdominal_pain'))) raise('routine', 'combo.fever_gi');
  if (has('fever') && has('fever')?.severity === 'severe' && (has('vomiting') || has('abdominal_pain'))) {
    raise('urgent', 'combo.high_fever_gi');
  }
  if (has('vomiting') && has('diarrhea')) raise('routine', 'combo.vomiting_diarrhea');
  if (symptoms.filter((s) => s.severity === 'moderate' || s.severity === 'severe').length >= 3) {
    raise('routine', 'combo.multiple_significant');
  }

  // Age and pregnancy
  if (state.ageGroup === 'infant' && ordered.length > 0) raise('urgent', 'age.infant');
  if (state.ageGroup === 'child') {
    if (has('fever') && hours !== null && hours >= 48) raise('urgent', 'age.child_fever_2_days');
    if (has('vomiting') || has('diarrhea')) raise('routine', 'age.child_gi');
  }
  if (state.ageGroup === 'older_adult') {
    if (ordered.length > 0) raise('routine', 'age.older_adult');
    if (has('fever')?.severity === 'severe' || has('vomiting') || has('diarrhea') || has('dizziness') || has('weakness')) {
      raise('urgent', 'age.older_adult_risk');
    }
  }
  if (state.pregnant) raise('routine', 'pregnancy');

  // Red-flag screens answered by the user
  for (const [id, answer] of Object.entries(state.screens) as [RedFlagScreenId, string][]) {
    if (answer !== 'positive') continue;
    const screen = RED_FLAG_SCREENS[id];
    raise(screen.onPositive.urgency, `screen.${id}.positive`);
    const category = id === 'ai_emergency_confirm' ? (state.suspectedEmergencyCategory ?? 'user_requested') : screen.onPositive.emergencyCategory;
    if (category && !emergencyCategory) emergencyCategory = category;
  }
  if (state.headInjury) raise('urgent', 'injury.head');

  // Specialty and facility
  let specialty: Specialty = lead ? SYMPTOM_PROFILES[lead.code].specialty : 'general_medicine';
  if (state.pregnant) specialty = 'obstetrics_gynecology';
  else if ((state.ageGroup === 'child' || state.ageGroup === 'infant') && !SPECIALTIES_KEPT_FOR_CHILDREN.has(specialty)) {
    specialty = 'pediatrics';
  }
  let facilityType: FacilityType = 'hospital';
  if (urgency === 'emergency') {
    facilityType = 'emergency_department';
    specialty = state.pregnant ? 'obstetrics_gynecology' : 'emergency_medicine';
  } else if (urgency === 'self_care') {
    facilityType = 'clinic';
  }

  const care = unique(ordered.flatMap((s) => SYMPTOM_PROFILES[s.code].care));
  if (state.ageGroup === 'child' || state.ageGroup === 'infant') {
    if (has('vomiting') || has('diarrhea') || has('fever')) care.unshift('child_fluids');
  }
  const warnings = unique(ordered.flatMap((s) => SYMPTOM_PROFILES[s.code].warnings));

  const notes: ContextNote[] = [];
  if (has('fever') && (has('body_ache') || has('headache') || has('chills'))) notes.push('viral_pattern');
  if (has('fever') && hours !== null && hours >= 48) notes.push('blood_test_possible');
  if (has('cough') && hours !== null && hours >= 336) notes.push('long_cough');
  if (has('vomiting') || has('diarrhea')) notes.push('hydration_focus');
  if (has('animal_bite')) notes.push('bite_time_sensitive');

  const leadScreen = lead ? SYMPTOM_PROFILES[lead.code].screen : undefined;
  const confidence: TriageResult['confidence'] =
    ordered.length === 0
      ? 'low'
      : (state.duration || (lead && SYMPTOM_PROFILES[lead.code].acute)) && (!leadScreen || state.screens[leadScreen])
        ? 'high'
        : 'medium';

  return {
    urgency,
    emergencyCategory: urgency === 'emergency' ? emergencyCategory : null,
    specialty,
    facilityType,
    leadSymptom: lead?.code ?? null,
    rationale,
    care: unique(care).slice(0, 3),
    warnings: warnings.slice(0, 4),
    notes,
    confidence,
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

const ACTION_TEMPLATES: Record<Exclude<Urgency, 'emergency'>, Localized> = {
  urgent: {
    en: 'Please see a doctor today. A hospital with a 24×7 emergency department is the safest choice.',
    hi: 'कृपया आज ही डॉक्टर को दिखाएं। 24×7 इमरजेंसी वाला अस्पताल सबसे सुरक्षित विकल्प है।',
    hinglish: 'Kripya aaj hi doctor ko dikhayein. 24×7 emergency wala hospital sabse safe option hai.',
  },
  routine: {
    en: 'Please visit a {specialty} OPD within the next day or two.',
    hi: 'कृपया अगले एक-दो दिन में {specialty} ओपीडी में दिखाएं।',
    hinglish: 'Kripya agle ek-do din mein {specialty} OPD mein dikhayein.',
  },
  self_care: {
    en: 'This can usually be managed at home. If it isn’t better in 2–3 days, see a doctor.',
    hi: 'आमतौर पर इसे घर पर संभाला जा सकता है। 2–3 दिन में आराम न मिले तो डॉक्टर को दिखाएं।',
    hinglish: 'Aam taur par ise ghar par sambhala ja sakta hai. 2–3 din mein aaram na mile to doctor ko dikhayein.',
  },
};

const BITE_ACTION: Localized = {
  en: 'Please go to a hospital today for anti-rabies care — it is time-sensitive.',
  hi: 'कृपया आज ही रेबीज़ से बचाव के इलाज के लिए अस्पताल जाएं — इसमें देर नहीं करनी चाहिए।',
  hinglish: 'Kripya aaj hi rabies se bachav ke ilaaj ke liye hospital jaayein — ismein der nahi karni chahiye.',
};

const EMERGENCY_ACTION: Localized = {
  en: 'Call 112 now or go to the nearest emergency department.',
  hi: 'अभी 112 पर कॉल करें या नज़दीकी इमरजेंसी विभाग जाएं।',
  hinglish: 'Abhi 112 par call karein ya nazdeeki emergency department jaayein.',
};

export const CONTEXT_NOTES: Record<ContextNote, Localized> = {
  viral_pattern: {
    en: 'Fever with body ache is often due to a viral infection, but only a doctor can confirm the cause.',
    hi: 'बदन दर्द के साथ बुखार अक्सर वायरल संक्रमण से होता है, पर असली कारण डॉक्टर ही बता सकते हैं।',
    hinglish: 'Body ache ke saath bukhar aksar viral infection se hota hai, par asli kaaran doctor hi bata sakte hain.',
  },
  blood_test_possible: {
    en: 'Since the fever has lasted a couple of days, a doctor may suggest a simple blood test.',
    hi: 'बुखार दो दिन से है, इसलिए डॉक्टर खून की जांच करवाने को कह सकते हैं।',
    hinglish: 'Bukhar do din se hai, isliye doctor blood test karwane ko keh sakte hain.',
  },
  long_cough: {
    en: 'A cough lasting more than two weeks should always be checked by a doctor.',
    hi: 'दो हफ्ते से ज़्यादा चलने वाली खांसी की जांच डॉक्टर से ज़रूर करवाएं।',
    hinglish: 'Do hafte se zyada chalne wali khansi ki jaanch doctor se zaroor karwayein.',
  },
  hydration_focus: {
    en: 'The main risk with vomiting or loose motions is losing too much water.',
    hi: 'उल्टी या दस्त में सबसे बड़ा खतरा शरीर में पानी की कमी है।',
    hinglish: 'Ulti ya dast mein sabse bada khatra body mein paani ki kami hai.',
  },
  bite_time_sensitive: {
    en: 'Animal bites need same-day medical advice.',
    hi: 'जानवर के काटने पर उसी दिन डॉक्टर की सलाह ज़रूरी है।',
    hinglish: 'Jaanwar ke kaatne par usi din doctor ki salah zaroori hai.',
  },
};

export function recommendedActionText(decision: TriageDecision, language: Language): string {
  if (decision.urgency === 'emergency') return EMERGENCY_ACTION[language];
  if (decision.leadSymptom === 'animal_bite') return BITE_ACTION[language];
  return fill(ACTION_TEMPLATES[decision.urgency][language], {
    specialty: SPECIALTY_LABELS[decision.specialty][language],
  });
}

export function buildTriageResult(
  decision: TriageDecision,
  state: ClinicalState,
  language: Language,
  followUpQuestions: string[],
  source: TriageResult['source'],
): TriageResult {
  return {
    urgency: decision.urgency,
    emergency: decision.urgency === 'emergency',
    emergencyCategory: decision.emergencyCategory,
    symptoms: allSymptoms(state).map((s) => ({ code: s.code, severity: s.severity })),
    duration: state.duration,
    ageGroup: state.ageGroup,
    language,
    recommendedAction: recommendedActionText(decision, language),
    requiredFacilityType: decision.facilityType,
    specialty: decision.specialty,
    followUpQuestions,
    careAdvice: decision.care.map((k) => CARE_ADVICE[k][language]),
    warningSigns: decision.warnings.map((k) => WARNING_SIGNS[k][language]),
    rationale: decision.rationale,
    ruledOut: Object.entries(state.screens)
      .filter(([, answer]) => answer === 'negative')
      .map(([screen]) => screen),
    confidence: decision.confidence,
    source: state.aiSymptoms.length > 0 ? 'rules+ai' : source,
  };
}

export { allSymptoms };
