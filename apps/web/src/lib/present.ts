import { SPECIALTY_LABELS, SYMPTOM_LABELS } from '@sanjeevani/medical-safety';
import type { Language, RankedFacility, ReasonCode, Specialty, SymptomCode, Urgency } from '@sanjeevani/types';
import { translate, type MessageKey } from './i18n';

export function km(meters: number): string {
  const v = meters / 1000;
  return v < 10 ? v.toFixed(1) : String(Math.round(v));
}

export function minutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

export function symptomLabel(code: string, language: Language): string {
  return SYMPTOM_LABELS[code as SymptomCode]?.[language] ?? code.replace(/_/g, ' ');
}

export function specialtyLabel(code: string, language: Language): string {
  return SPECIALTY_LABELS[code as Specialty]?.[language] ?? code.replace(/_/g, ' ');
}

export const URGENCY_STYLE: Record<Urgency, { fg: string; bg: string; ring: string; bar: string }> = {
  emergency: { fg: 'text-[var(--u-emergency)]', bg: 'bg-[var(--u-emergency-soft)]', ring: 'border-[var(--u-emergency)]', bar: 'bg-[var(--u-emergency)]' },
  urgent: { fg: 'text-[var(--u-urgent)]', bg: 'bg-[var(--u-urgent-soft)]', ring: 'border-[var(--u-urgent)]', bar: 'bg-[var(--u-urgent)]' },
  routine: { fg: 'text-[var(--u-routine)]', bg: 'bg-[var(--u-routine-soft)]', ring: 'border-[var(--u-routine)]', bar: 'bg-[var(--u-routine)]' },
  self_care: { fg: 'text-[var(--u-selfcare)]', bg: 'bg-[var(--u-selfcare-soft)]', ring: 'border-[var(--u-selfcare)]', bar: 'bg-[var(--u-selfcare)]' },
};

const REASON_KEYS: Partial<Record<ReasonCode, MessageKey>> = {
  has_24x7_emergency: 'emergency24x7',
  open_now: 'openNow',
  closed_now: 'closedNow',
  hours_unknown: 'hoursUnknown',
  specialty_unverified: 'specialtyUnverified',
  government_hospital: 'government',
  closest_option: 'closest',
  short_travel: 'shortTravel',
  highly_rated: 'highlyRated',
  general_hospital: 'generalHospital',
};

export interface ReasonBadge {
  code: ReasonCode;
  label: string;
  tone: 'positive' | 'neutral' | 'caution';
}

export function reasonBadges(f: RankedFacility, language: Language, specialty?: string): ReasonBadge[] {
  return f.reasons.flatMap((code): ReasonBadge[] => {
    if (code === 'specialty_verified') {
      if (!specialty) return [];
      return [{ code, label: translate(language, 'specialtyVerified', { specialty: specialtyLabel(specialty, language) }), tone: 'positive' }];
    }
    const key = REASON_KEYS[code];
    if (!key) return [];
    const tone = code === 'closed_now' ? 'caution' : code === 'hours_unknown' || code === 'specialty_unverified' ? 'neutral' : 'positive';
    return [{ code, label: translate(language, key), tone }];
  });
}

/** Human-readable explanations for triage rule identifiers. */
const RATIONALE: Record<string, Record<Language, string>> = {
  'duration.fever_3_days': { en: 'Fever for 3 days or more needs a doctor’s check today.', hi: '3 दिन या ज़्यादा का बुखार आज ही दिखाना चाहिए।', hinglish: '3 din ya zyada ka bukhar aaj hi dikhana chahiye.' },
  'duration.fever_2_days': { en: 'Fever lasting 2 days is worth a doctor’s visit.', hi: '2 दिन से चल रहा बुखार डॉक्टर को दिखाना चाहिए।', hinglish: '2 din se chal raha bukhar doctor ko dikhana chahiye.' },
  'duration.cough_2_weeks': { en: 'A cough over two weeks should be checked.', hi: 'दो हफ्ते से ज़्यादा की खांसी जांचनी चाहिए।', hinglish: 'Do hafte se zyada ki khansi check karani chahiye.' },
  'duration.gi_2_days': { en: 'Vomiting or loose motions for 2+ days risk dehydration.', hi: '2+ दिन उल्टी-दस्त से पानी की कमी का खतरा है।', hinglish: '2+ din ulti-dast se paani ki kami ka khatra hai.' },
  'duration.over_2_weeks': { en: 'Symptoms lasting over two weeks should be reviewed.', hi: 'दो हफ्ते से ज़्यादा के लक्षण दिखाने चाहिए।', hinglish: 'Do hafte se zyada ke lakshan dikhane chahiye.' },
  'combo.fever_rash': { en: 'Fever with a rash should be seen the same day.', hi: 'दानों के साथ बुखार उसी दिन दिखाना चाहिए।', hinglish: 'Daanon ke saath bukhar usi din dikhana chahiye.' },
  'combo.high_fever_gi': { en: 'High fever with vomiting or stomach pain needs prompt care.', hi: 'तेज़ बुखार के साथ उल्टी या पेट दर्द में जल्दी इलाज चाहिए।', hinglish: 'Tez bukhar ke saath ulti ya pet dard mein jaldi ilaaj chahiye.' },
  'age.infant': { en: 'Babies need to be seen promptly for any illness.', hi: 'शिशु को किसी भी बीमारी में जल्दी दिखाना चाहिए।', hinglish: 'Baby ko kisi bhi bimari mein jaldi dikhana chahiye.' },
  'age.older_adult': { en: 'Older adults are safer with an earlier check.', hi: 'बुज़ुर्गों के लिए जल्दी जांच बेहतर है।', hinglish: 'Buzurgon ke liye jaldi check behtar hai.' },
  'age.older_adult_risk': { en: 'These symptoms can become serious faster in older adults.', hi: 'बुज़ुर्गों में ये लक्षण जल्दी गंभीर हो सकते हैं।', hinglish: 'Buzurgon mein ye lakshan jaldi gambhir ho sakte hain.' },
  'age.child_fever_2_days': { en: 'A child with fever for 2+ days should be seen today.', hi: '2+ दिन बुखार वाले बच्चे को आज दिखाएं।', hinglish: '2+ din bukhar wale bachche ko aaj dikhayein.' },
  pregnancy: { en: 'During pregnancy, it’s safer to consult a doctor.', hi: 'गर्भावस्था में डॉक्टर से सलाह लेना सुरक्षित है।', hinglish: 'Pregnancy mein doctor se salah lena safe hai.' },
  'injury.head': { en: 'Head injuries should be checked the same day.', hi: 'सिर की चोट उसी दिन दिखानी चाहिए।', hinglish: 'Sir ki chot usi din dikhani chahiye.' },
};

/**
 * Short names for the red-flag screens, for the "already excluded" line on the care
 * card. Deliberately terse — a clinician scanning a card wants the finding, not the
 * question that produced it.
 */
const RULED_OUT: Record<string, Record<Language, string>> = {
  fever_danger: { en: 'rash, stiff neck, confusion, breathlessness', hi: 'दाने, गर्दन अकड़न, भ्रम, सांस फूलना', hinglish: 'daane, gardan akdan, bhram, saans foolna' },
  headache_sudden: { en: 'thunderclap onset, weakness, numbness, blurred vision', hi: 'अचानक तेज़ शुरुआत, कमज़ोरी, सुन्नपन, धुंधला दिखना', hinglish: 'achanak tez shuruaat, kamzori, sunnapan, dhundhla dikhna' },
  abdominal_severe: { en: 'severe or rigid abdomen, blood in stool or vomit', hi: 'तेज़ या सख़्त पेट, मल-उल्टी में खून', hinglish: 'tez ya sakht pet, mal-ulti mein khoon' },
  gi_hydration: { en: 'unable to keep fluids down, no urine, sunken eyes', hi: 'तरल न टिकना, पेशाब न आना, आंखें धंसना', hinglish: 'taral na tikna, peshab na aana, aankhein dhansna' },
  respiratory: { en: 'breathlessness at rest, blue lips, chest tightness', hi: 'आराम में सांस फूलना, होंठ नीले, सीने में जकड़न', hinglish: 'aaram mein saans foolna, honth neele, seene mein jakdan' },
  injury_severity: { en: 'uncontrolled bleeding, deformity, loss of consciousness', hi: 'खून न रुकना, हड्डी टेढ़ी, बेहोशी', hinglish: 'khoon na rukna, haddi tedhi, behoshi' },
  dizziness_faint: { en: 'fainting, chest pain, irregular heartbeat', hi: 'बेहोशी, सीने में दर्द, धड़कन अनियमित', hinglish: 'behoshi, seene mein dard, dhadkan aniyamit' },
  allergy_airway: { en: 'swelling of lips or throat, difficulty breathing', hi: 'होंठ-गले में सूजन, सांस में तकलीफ़', hinglish: 'honth-gale mein soojan, saans mein takleef' },
  mood_safety: { en: 'thoughts of self-harm', hi: 'खुद को नुकसान के विचार', hinglish: 'khud ko nuksan ke vichar' },
  urinary_spread: { en: 'fever with back or flank pain', hi: 'बुखार के साथ कमर/पसली में दर्द', hinglish: 'bukhar ke saath kamar/pasli mein dard' },
  eye_vision: { en: 'sudden vision loss, severe eye pain, injury', hi: 'अचानक दृष्टि जाना, तेज़ आंख दर्द, चोट', hinglish: 'achanak drishti jana, tez aankh dard, chot' },
  pregnancy_danger: { en: 'bleeding, severe pain, reduced fetal movement', hi: 'रक्तस्राव, तेज़ दर्द, बच्चे की हलचल कम', hinglish: 'raktsrav, tez dard, bachche ki halchal kam' },
  palpitations_danger: { en: 'fainting, chest pain, breathlessness', hi: 'बेहोशी, सीने में दर्द, सांस फूलना', hinglish: 'behoshi, seene mein dard, saans foolna' },
  burn_size: { en: 'large area, face or hands, blistering', hi: 'बड़ा हिस्सा, चेहरा/हाथ, छाले', hinglish: 'bada hissa, chehra/haath, chhale' },
  ai_emergency_confirm: { en: 'severe symptoms happening right now', hi: 'अभी हो रहे गंभीर लक्षण', hinglish: 'abhi ho rahe gambhir lakshan' },
};

export function ruledOutText(screenId: string, language: Language): string | null {
  return RULED_OUT[screenId]?.[language] ?? null;
}

export function rationaleText(ruleId: string, language: Language): string | null {
  if (RATIONALE[ruleId]) return RATIONALE[ruleId][language];
  if (ruleId.startsWith('severity.severe:')) {
    const s = symptomLabel(ruleId.split(':')[1] ?? '', language);
    return { en: `You described the ${s} as severe.`, hi: `आपने ${s} को तेज़ बताया।`, hinglish: `Aapne ${s} ko tez bataya.` }[language];
  }
  if (ruleId.startsWith('screen.') && ruleId.endsWith('.positive')) {
    return { en: 'You confirmed a warning sign.', hi: 'आपने एक खतरे का लक्षण बताया।', hinglish: 'Aapne ek khatre ka lakshan bataya.' }[language];
  }
  if (ruleId.startsWith('base:')) {
    const [, code, urgency] = ruleId.split(':');
    if (urgency === 'self_care') return null;
    const s = symptomLabel(code ?? '', language);
    return { en: `${capitalize(s)} usually needs a doctor’s review.`, hi: `${s} में आमतौर पर डॉक्टर की सलाह चाहिए।`, hinglish: `${capitalize(s)} mein aam taur par doctor ki salah chahiye.` }[language];
  }
  if (ruleId.startsWith('ai.capped:')) return null;
  return null;
}

export function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function durationLabel(hours: number | null | undefined, language: Language): string | null {
  if (hours === null || hours === undefined) return null;
  if (hours < 24) {
    const h = Math.max(1, Math.round(hours));
    return { en: `${h} hour${h === 1 ? '' : 's'}`, hi: `${h} घंटे`, hinglish: `${h} ghante` }[language];
  }
  const d = Math.round(hours / 24);
  if (d < 14) return { en: `${d} day${d === 1 ? '' : 's'}`, hi: `${d} दिन`, hinglish: `${d} din` }[language];
  const w = Math.round(d / 7);
  return { en: `${w} weeks`, hi: `${w} हफ्ते`, hinglish: `${w} hafte` }[language];
}

export function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`;
}

export function formatDate(iso: string, language: Language): string {
  try {
    return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}
