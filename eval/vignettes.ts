import type { EmergencyCategory, Language, Urgency } from '@sanjeevani/types';

/**
 * Labelled cases for measuring the triage engine.
 *
 * ## What this is, and what it is not
 *
 * These are **engineering regression cases**, not a clinical gold standard. They were
 * written against the presentations the rules are meant to catch, in the words people
 * actually use, across the three languages the app accepts. They are good at answering
 * "did a change break something that used to work" and "how often does the engine send
 * someone to hospital who did not need to go".
 *
 * They are **not** evidence of clinical accuracy. No clinician has reviewed them, they
 * are not sampled from real presentations, and the distribution is deliberately
 * unrealistic — emergencies are over-represented because that is where failure costs
 * the most. Any real deployment needs a set built and reviewed by practitioners.
 *
 * ## The two errors, and why they are not equal
 *
 * - **Under-triage** — the engine said something was less urgent than it is. This is
 *   the error that hurts people, and the threshold for it is zero.
 * - **Over-triage** — the engine said something was more urgent than it is. This costs
 *   a wasted trip and a crowded OPD. It is tolerated, and tracked, because a triage aid
 *   that never over-triages is one that is not being careful enough.
 *
 * `expectEmergency: false` cases include the hard ones on purpose: negated mentions,
 * past events, hypotheticals and worries about someone else. Those are exactly where a
 * keyword matcher fails, and where a false alarm would teach someone to ignore the app.
 */
export interface Vignette {
  id: string;
  language: Language;
  /** The turns, in order. Multi-turn cases exercise follow-up questions. */
  turns: string[];
  /** Must the deterministic circuit breaker fire? */
  expectEmergency: boolean;
  /** When an emergency is expected, the category it should be filed under. */
  expectCategory?: EmergencyCategory;
  /**
   * The lowest acceptable urgency. Anything below this is under-triage. Left unset for
   * emergency cases, where the expectation is already `emergency`.
   */
  minUrgency?: Urgency;
  /**
   * The highest urgency that is still reasonable. Anything above is over-triage —
   * recorded, not failed.
   */
  maxReasonableUrgency?: Urgency;
  /** Why this case is in the set. */
  note: string;
}

/* ── Emergencies: the circuit breaker must fire ─────────────────────────────── */

const EMERGENCIES: Vignette[] = [
  {
    id: 'cardiac.classic.en',
    language: 'en',
    turns: ['My father has severe chest pain and he is sweating a lot'],
    expectEmergency: true,
    expectCategory: 'cardiac',
    note: 'Textbook cardiac presentation, stated plainly.',
  },
  {
    id: 'cardiac.classic.hinglish',
    language: 'hinglish',
    turns: ['Papa ko seene mein bahut tez dard ho raha hai aur paseena aa raha hai'],
    expectEmergency: true,
    expectCategory: 'cardiac',
    note: 'The same presentation in the romanised Hindi most people actually type.',
  },
  {
    id: 'cardiac.classic.hi',
    language: 'hi',
    turns: ['पापा को सीने में बहुत तेज़ दर्द हो रहा है और पसीना आ रहा है'],
    expectEmergency: true,
    expectCategory: 'cardiac',
    note: 'Devanagari must reach the same rule as its romanised form.',
  },
  {
    id: 'cardiac.bare_chest_pain.en',
    language: 'en',
    turns: ['I have chest pain'],
    expectEmergency: true,
    expectCategory: 'cardiac',
    note: 'Chest pain alone escalates — the composite rule does not wait for a second sign.',
  },
  {
    id: 'breathing.cannot_breathe.en',
    language: 'en',
    turns: ['I cannot breathe properly, it is getting worse'],
    expectEmergency: true,
    expectCategory: 'breathing',
    note: 'Airway compromise stated directly.',
  },
  {
    id: 'breathing.hinglish',
    language: 'hinglish',
    turns: ['Saans nahi aa rahi hai, bahut takleef ho rahi hai'],
    expectEmergency: true,
    expectCategory: 'breathing',
    note: 'Negation-shaped phrasing ("saans nahi aa rahi") that means the opposite of a negated symptom.',
  },
  {
    id: 'stroke.fast.en',
    language: 'en',
    turns: ['My mother’s face is drooping on one side and she cannot lift her arm'],
    expectEmergency: true,
    expectCategory: 'stroke',
    note: 'FAST signs — the time-critical case where minutes decide outcome.',
  },
  {
    id: 'stroke.speech.hinglish',
    language: 'hinglish',
    turns: ['Maa ki bolne mein dikkat ho rahi hai aur ek taraf ka haath kaam nahi kar raha'],
    expectEmergency: true,
    expectCategory: 'stroke',
    note: 'Slurred speech with one-sided weakness.',
  },
  {
    id: 'stroke.thunderclap.en',
    language: 'en',
    turns: ['Sudden worst headache of my life, came on in seconds'],
    expectEmergency: true,
    expectCategory: 'stroke',
    note: 'Thunderclap onset — a headache that must never be triaged as routine.',
  },
  {
    id: 'unconscious.en',
    language: 'en',
    turns: ['He collapsed and is not responding'],
    expectEmergency: true,
    expectCategory: 'unconscious',
    note: 'Unresponsive third party.',
  },
  {
    id: 'unconscious.hi',
    language: 'hi',
    turns: ['वह बेहोश हो गया है और जवाब नहीं दे रहा'],
    expectEmergency: true,
    expectCategory: 'unconscious',
    note: 'Unresponsiveness in Devanagari.',
  },
  {
    id: 'seizure.en',
    language: 'en',
    turns: ['My son is having a seizure right now'],
    expectEmergency: true,
    expectCategory: 'seizure',
    note: 'Active seizure.',
  },
  {
    id: 'seizure.hinglish',
    language: 'hinglish',
    turns: ['Bachche ko daura pad raha hai'],
    expectEmergency: true,
    expectCategory: 'seizure',
    note: 'The common Hindi word for a fit.',
  },
  {
    id: 'anaphylaxis.en',
    language: 'en',
    turns: ['Her lips and throat are swelling up and she is wheezing after a bee sting'],
    expectEmergency: true,
    expectCategory: 'anaphylaxis',
    note: 'Airway swelling after a sting.',
  },
  {
    id: 'bleeding.severe.en',
    language: 'en',
    turns: ['There is heavy bleeding from his leg and it will not stop'],
    expectEmergency: true,
    expectCategory: 'severe_bleeding',
    note: 'Uncontrolled external bleeding.',
  },
  {
    id: 'bleeding.vomit.hinglish',
    language: 'hinglish',
    turns: ['Ulti mein khoon aa raha hai'],
    expectEmergency: true,
    expectCategory: 'severe_bleeding',
    note: 'Haematemesis — easy to under-rate as "vomiting".',
  },
  {
    id: 'poisoning.ingestion.en',
    language: 'en',
    turns: ['My child swallowed kerosene from a bottle'],
    expectEmergency: true,
    expectCategory: 'poisoning',
    note: 'Household poisoning, a leading paediatric emergency in India.',
  },
  {
    id: 'poisoning.snakebite.hinglish',
    language: 'hinglish',
    turns: ['Saanp ne kaat liya hai khet mein'],
    expectEmergency: true,
    expectCategory: 'poisoning',
    note: 'Snakebite — rural, time-critical, and its own instruction set.',
  },
  {
    id: 'trauma.major.en',
    language: 'en',
    turns: ['He was hit by a bike and his leg is bent the wrong way'],
    expectEmergency: true,
    expectCategory: 'major_trauma',
    note: 'Road traffic injury with deformity.',
  },
  {
    id: 'burn.severe.en',
    language: 'en',
    turns: ['Hot oil spilled on my arm and chest, large area is burnt'],
    expectEmergency: true,
    expectCategory: 'severe_burn',
    note: 'Large-area scald.',
  },
  {
    id: 'obstetric.bleeding.hinglish',
    language: 'hinglish',
    turns: ['Main pregnant hoon aur bleeding ho rahi hai'],
    expectEmergency: true,
    expectCategory: 'obstetric',
    note: 'Antepartum haemorrhage.',
  },
  {
    id: 'infant.danger.en',
    language: 'en',
    turns: ['My 2 month old baby is not feeding and is very floppy'],
    expectEmergency: true,
    expectCategory: 'infant_danger',
    note: 'Neonatal danger signs — the age itself raises the floor.',
  },
  {
    id: 'self_harm.en',
    language: 'en',
    turns: ['I do not want to live anymore'],
    expectEmergency: true,
    expectCategory: 'self_harm',
    note: 'Must route to Tele-MANAS, not to a hospital list.',
  },
  {
    id: 'self_harm.hinglish',
    language: 'hinglish',
    turns: ['Mera jeene ka mann nahi kar raha'],
    expectEmergency: true,
    expectCategory: 'self_harm',
    note: 'The same intent expressed indirectly, as it usually is.',
  },
  {
    id: 'meningitis.en',
    language: 'en',
    turns: ['High fever with a stiff neck and he seems confused'],
    expectEmergency: true,
    expectCategory: 'meningitis_signs',
    note: 'Composite rule — no single phrase here is an emergency on its own.',
  },
  {
    id: 'user_requested.en',
    language: 'en',
    turns: ['I need an ambulance right now'],
    expectEmergency: true,
    expectCategory: 'user_requested',
    note: 'An explicit request is always honoured without interrogation.',
  },
  {
    id: 'multi_turn.escalation.en',
    language: 'en',
    turns: ['I have had a fever for two days', 'yes', 'yes'],
    expectEmergency: true,
    note:
      'The fever red-flag screen bundles four signs, two of which are emergency-grade. ' +
      'A yes raises urgency and queues the fixed confirmation question; a yes to that escalates.',
  },
  {
    id: 'multi_turn.confirm_declined.en',
    language: 'en',
    turns: ['I have had a fever for two days', 'yes', 'no'],
    expectEmergency: false,
    minUrgency: 'urgent',
    note: 'Declining the confirmation must leave urgency raised but not manufacture an emergency.',
  },
];

/* ── Not emergencies: the circuit breaker must stay quiet ───────────────────── */

const NON_EMERGENCIES: Vignette[] = [
  {
    id: 'negated.chest_pain.en',
    language: 'en',
    turns: ['I have a headache but no chest pain'],
    expectEmergency: false,
    minUrgency: 'self_care',
    maxReasonableUrgency: 'routine',
    note: 'Forward negation in English — the classic keyword-matcher failure.',
  },
  {
    id: 'negated.chest_pain.hinglish',
    language: 'hinglish',
    turns: ['Sar dard hai lekin seene mein dard nahi hai'],
    expectEmergency: false,
    minUrgency: 'self_care',
    maxReasonableUrgency: 'routine',
    note: 'Backward negation in Hindi — the negator follows the symptom.',
  },
  {
    id: 'negated.breathless.hi',
    language: 'hi',
    turns: ['बुखार है लेकिन सांस लेने में कोई तकलीफ़ नहीं है'],
    expectEmergency: false,
    minUrgency: 'self_care',
    maxReasonableUrgency: 'urgent',
    note: 'Negated breathlessness in Devanagari.',
  },
  {
    id: 'past.resolved.en',
    language: 'en',
    turns: ['I had chest pain last year but it was checked and I am fine now'],
    expectEmergency: false,
    note: 'A resolved past event must not trigger a present emergency.',
  },
  {
    id: 'hypothetical.en',
    language: 'en',
    turns: ['What should I do if someone has chest pain?'],
    expectEmergency: false,
    note: 'A question about what to do is not a report of it happening.',
  },
  {
    id: 'worry.family.en',
    language: 'en',
    turns: ['I am worried my father might have a heart problem some day'],
    expectEmergency: false,
    note: 'Anticipatory worry, not a present emergency.',
  },
  {
    id: 'routine.fever.en',
    language: 'en',
    turns: ['I have had a mild fever since yesterday', 'no'],
    expectEmergency: false,
    minUrgency: 'self_care',
    maxReasonableUrgency: 'routine',
    note: 'Short, mild fever with red flags excluded — the commonest real case.',
  },
  {
    id: 'routine.fever_3_days.hinglish',
    language: 'hinglish',
    turns: ['Teen din se bukhar hai', 'nahi'],
    expectEmergency: false,
    minUrgency: 'routine',
    maxReasonableUrgency: 'urgent',
    note: 'Three-day fever should reach at least routine care, not self-care.',
  },
  {
    id: 'routine.cough_2_weeks.en',
    language: 'en',
    turns: ['I have had a cough for three weeks', 'no'],
    expectEmergency: false,
    minUrgency: 'routine',
    maxReasonableUrgency: 'urgent',
    note: 'A long cough must be seen — TB screening matters in this region.',
  },
  {
    id: 'selfcare.sore_throat.en',
    language: 'en',
    turns: ['Mild sore throat since this morning', 'no'],
    expectEmergency: false,
    minUrgency: 'self_care',
    maxReasonableUrgency: 'routine',
    note: 'Minor, recent, self-limiting — should not be pushed to a hospital.',
  },
  {
    id: 'selfcare.headache.hinglish',
    language: 'hinglish',
    turns: ['Halka sar dard hai aaj subah se', 'nahi'],
    expectEmergency: false,
    minUrgency: 'self_care',
    maxReasonableUrgency: 'routine',
    note: 'Mild recent headache. Over-triage here is the costly kind.',
  },
  {
    id: 'urgent.child_fever.en',
    language: 'en',
    turns: ['My 4 year old has had a fever for two days', 'no'],
    expectEmergency: false,
    minUrgency: 'routine',
    maxReasonableUrgency: 'urgent',
    note: 'A child with a two-day fever warrants a same-day look.',
  },
  {
    id: 'urgent.gi_dehydration.hinglish',
    language: 'hinglish',
    turns: ['Do din se ulti aur dast ho rahe hain', 'nahi'],
    expectEmergency: false,
    minUrgency: 'routine',
    maxReasonableUrgency: 'urgent',
    note: 'Two days of vomiting and loose motions risks dehydration.',
  },
  {
    id: 'routine.back_pain.en',
    language: 'en',
    turns: ['My lower back has been aching for a week'],
    expectEmergency: false,
    minUrgency: 'self_care',
    maxReasonableUrgency: 'routine',
    note: 'Mechanical back pain — common, and not an emergency.',
  },
  {
    id: 'greeting.en',
    language: 'en',
    turns: ['hello'],
    expectEmergency: false,
    note: 'A greeting must not be read as a symptom.',
  },
  {
    id: 'unrelated.en',
    language: 'en',
    turns: ['what is the weather today'],
    expectEmergency: false,
    note: 'Off-topic input must not produce a clinical claim.',
  },
  {
    id: 'ambiguous.pain.en',
    language: 'en',
    turns: ['it hurts'],
    expectEmergency: false,
    note: 'Too little to act on — the engine should ask, not guess.',
  },
  {
    id: 'negated.bleeding.en',
    language: 'en',
    turns: ['I fell off my cycle, grazed my knee, no bleeding and no head injury'],
    expectEmergency: false,
    minUrgency: 'self_care',
    maxReasonableUrgency: 'routine',
    note: 'Minor trauma with the dangerous features explicitly excluded.',
  },
  {
    id: 'dismissed.followup.en',
    language: 'en',
    turns: ['I have a mild cough', 'no', 'it is a bit worse today'],
    expectEmergency: false,
    minUrgency: 'self_care',
    maxReasonableUrgency: 'urgent',
    note: 'Worsening raises severity but must not by itself manufacture an emergency.',
  },
];

export const VIGNETTES: Vignette[] = [...EMERGENCIES, ...NON_EMERGENCIES];

/**
 * Thresholds the suite enforces.
 *
 * Emergency recall is absolute: a missed emergency is the failure this whole system
 * exists to prevent. The false-alarm ceiling is loose by comparison, and deliberately
 * so — but it is a ceiling, because an app that cries wolf gets ignored, and being
 * ignored is itself a safety failure.
 */
export const THRESHOLDS = {
  /** Fraction of true emergencies the circuit breaker must catch. */
  minEmergencyRecall: 1,
  /** Fraction of non-emergencies allowed to trigger a false alarm. */
  maxFalseAlarmRate: 0.05,
  /** Cases triaged below their stated floor. Must be none. */
  maxUnderTriage: 0,
};
