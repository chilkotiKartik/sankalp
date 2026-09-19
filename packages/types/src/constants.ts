/**
 * The shared vocabularies, with no dependencies at all.
 *
 * These live apart from `domain.ts` on purpose. That module builds Zod schemas from
 * them, and importing anything out of it pulls the whole Zod runtime along — around
 * 120 KB gzipped. The browser needs the lists (to render filter chips) but never needs
 * to validate anything, so it imports `@sanjeevani/types/constants` and pays nothing.
 *
 * There is still exactly one source of truth: `domain.ts` derives its enums from here.
 */

export const LANGUAGES = ['en', 'hi', 'hinglish'] as const;
export const URGENCY_LEVELS = ['self_care', 'routine', 'urgent', 'emergency'] as const;
export const FACILITY_TYPES = [
  'emergency_department',
  'hospital',
  'clinic',
  'pharmacy',
  'diagnostic_lab',
] as const;
export const SPECIALTIES = [
  'emergency_medicine',
  'general_medicine',
  'pediatrics',
  'cardiology',
  'neurology',
  'pulmonology',
  'gastroenterology',
  'orthopedics',
  'ent',
  'ophthalmology',
  'dermatology',
  'obstetrics_gynecology',
  'dental',
  'psychiatry',
  'urology',
] as const;
export const SYMPTOM_CODES = [
  'fever',
  'chills',
  'body_ache',
  'fatigue',
  'headache',
  'cough',
  'sore_throat',
  'runny_nose',
  'breathlessness',
  'wheezing',
  'chest_pain',
  'palpitations',
  'abdominal_pain',
  'nausea',
  'vomiting',
  'diarrhea',
  'constipation',
  'loss_of_appetite',
  'dizziness',
  'fainting',
  'weakness',
  'numbness',
  'confusion',
  'seizure',
  'rash',
  'itching',
  'swelling',
  'ear_pain',
  'eye_pain',
  'eye_redness',
  'blurred_vision',
  'toothache',
  'back_pain',
  'joint_pain',
  'neck_stiffness',
  'injury',
  'burn',
  'bleeding',
  'painful_urination',
  'blood_in_urine',
  'blood_in_stool',
  'blood_in_vomit',
  'dehydration',
  'animal_bite',
  'pregnancy_concern',
  'anxiety',
  'low_mood',
  'insomnia',
] as const;
export const SEVERITIES = ['mild', 'moderate', 'severe', 'unknown'] as const;
export const AGE_GROUPS = ['infant', 'child', 'adult', 'older_adult', 'unknown'] as const;
export const EMERGENCY_CATEGORIES = [
  'cardiac',
  'breathing',
  'stroke',
  'unconscious',
  'major_trauma',
  'severe_bleeding',
  'seizure',
  'anaphylaxis',
  'poisoning',
  'self_harm',
  'severe_burn',
  'obstetric',
  'infant_danger',
  'meningitis_signs',
  'user_requested',
] as const;

/** The one type this module needs; declared here so it stays free of Zod. */
export type Urgency = (typeof URGENCY_LEVELS)[number];

export function urgencyRank(u: Urgency): number {
  return URGENCY_LEVELS.indexOf(u);
}

export function maxUrgency(...levels: Urgency[]): Urgency {
  return levels.reduce<Urgency>((acc, l) => (urgencyRank(l) > urgencyRank(acc) ? l : acc), 'self_care');
}
