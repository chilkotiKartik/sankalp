import type { EmergencyCategory, Specialty, SymptomCode, Urgency } from '@sanjeevani/types';
import type { CareAdviceKey, WarningSignKey } from '../content/guidance';
import type { Localized } from '../content/localized';

export interface SymptomProfile {
  specialty: Specialty;
  baseUrgency: Urgency;
  care: CareAdviceKey[];
  warnings: WarningSignKey[];
  screen?: RedFlagScreenId;
  /** Acute events (bites, burns, injuries) don't need a duration question. */
  acute?: boolean;
  /** Relative importance when choosing which symptom leads the conversation. */
  weight: number;
}

export type RedFlagScreenId =
  | 'fever_danger'
  | 'headache_sudden'
  | 'abdominal_severe'
  | 'gi_hydration'
  | 'respiratory'
  | 'injury_severity'
  | 'dizziness_faint'
  | 'allergy_airway'
  | 'mood_safety'
  | 'urinary_spread'
  | 'eye_vision'
  | 'pregnancy_danger'
  | 'palpitations_danger'
  | 'burn_size'
  | 'ai_emergency_confirm';

export interface RedFlagScreen {
  /**
   * Set when a positive answer bundles signs of differing severity — "rash, stiff neck,
   * confusion, or difficulty breathing" is four findings in one question, and two of
   * them are emergency-grade. A yes here does not escalate by itself; it queues the
   * fixed confirmation question, whose answer decides.
   */
  confirmEmergencyAs?: EmergencyCategory;
  id: RedFlagScreenId;
  question: Localized;
  /** Which answer indicates danger. Most questions ask "is there X?" so "yes" is positive. */
  positiveAnswer: 'yes' | 'no';
  onPositive: { urgency: Urgency; emergencyCategory?: EmergencyCategory };
}

export const SYMPTOM_PROFILES: Record<SymptomCode, SymptomProfile> = {
  fever: { specialty: 'general_medicine', baseUrgency: 'routine', care: ['rest_fluids', 'fever_comfort', 'monitor_temperature', 'no_self_medication'], warnings: ['fever_persistent', 'breathing', 'confusion', 'bleeding_signs', 'stiff_neck_rash'], screen: 'fever_danger', weight: 8 },
  chills: { specialty: 'general_medicine', baseUrgency: 'routine', care: ['rest_fluids', 'monitor_temperature'], warnings: ['fever_persistent', 'confusion'], screen: 'fever_danger', weight: 4 },
  body_ache: { specialty: 'general_medicine', baseUrgency: 'self_care', care: ['rest_fluids', 'no_self_medication'], warnings: ['worsening_pain'], weight: 3 },
  fatigue: { specialty: 'general_medicine', baseUrgency: 'self_care', care: ['rest_fluids', 'light_food'], warnings: ['breathing', 'confusion'], weight: 2 },
  headache: { specialty: 'general_medicine', baseUrgency: 'self_care', care: ['rest_fluids', 'no_self_medication'], warnings: ['vision_change', 'numbness_weakness', 'stiff_neck_rash', 'confusion'], screen: 'headache_sudden', weight: 6 },
  cough: { specialty: 'pulmonology', baseUrgency: 'self_care', care: ['steam_warm_fluids', 'rest_fluids', 'no_self_medication'], warnings: ['breathing', 'chest_pain', 'fever_persistent'], screen: 'respiratory', weight: 5 },
  sore_throat: { specialty: 'ent', baseUrgency: 'self_care', care: ['steam_warm_fluids', 'rest_fluids'], warnings: ['breathing', 'cannot_drink'], screen: 'respiratory', weight: 3 },
  runny_nose: { specialty: 'ent', baseUrgency: 'self_care', care: ['steam_warm_fluids', 'rest_fluids'], warnings: ['breathing', 'fever_persistent'], screen: 'respiratory', weight: 2 },
  breathlessness: { specialty: 'pulmonology', baseUrgency: 'urgent', care: ['keep_company'], warnings: ['breathing', 'chest_pain', 'confusion'], screen: 'respiratory', weight: 10 },
  wheezing: { specialty: 'pulmonology', baseUrgency: 'urgent', care: ['keep_company'], warnings: ['breathing'], screen: 'respiratory', weight: 9 },
  chest_pain: { specialty: 'cardiology', baseUrgency: 'emergency', care: ['keep_company'], warnings: ['chest_pain', 'breathing'], acute: true, weight: 12 },
  palpitations: { specialty: 'cardiology', baseUrgency: 'urgent', care: ['keep_company'], warnings: ['chest_pain', 'breathing'], screen: 'palpitations_danger', weight: 9 },
  abdominal_pain: { specialty: 'gastroenterology', baseUrgency: 'routine', care: ['rest_fluids', 'light_food', 'no_self_medication'], warnings: ['severe_abdominal', 'bleeding_signs', 'cannot_drink'], screen: 'abdominal_severe', weight: 7 },
  nausea: { specialty: 'gastroenterology', baseUrgency: 'self_care', care: ['ors_small_sips', 'light_food'], warnings: ['cannot_drink', 'severe_abdominal'], screen: 'gi_hydration', weight: 3 },
  vomiting: { specialty: 'gastroenterology', baseUrgency: 'self_care', care: ['ors_small_sips', 'light_food', 'no_self_medication'], warnings: ['cannot_drink', 'less_urine', 'severe_abdominal', 'bleeding_signs'], screen: 'gi_hydration', weight: 6 },
  diarrhea: { specialty: 'gastroenterology', baseUrgency: 'self_care', care: ['ors_small_sips', 'light_food', 'no_self_medication'], warnings: ['cannot_drink', 'less_urine', 'bleeding_signs'], screen: 'gi_hydration', weight: 6 },
  constipation: { specialty: 'gastroenterology', baseUrgency: 'self_care', care: ['rest_fluids', 'light_food'], warnings: ['severe_abdominal'], weight: 1 },
  loss_of_appetite: { specialty: 'general_medicine', baseUrgency: 'self_care', care: ['light_food', 'rest_fluids'], warnings: ['cannot_drink'], weight: 1 },
  dizziness: { specialty: 'general_medicine', baseUrgency: 'routine', care: ['rest_fluids', 'keep_company'], warnings: ['chest_pain', 'numbness_weakness', 'vision_change'], screen: 'dizziness_faint', weight: 6 },
  fainting: { specialty: 'general_medicine', baseUrgency: 'urgent', care: ['keep_company', 'rest_fluids'], warnings: ['chest_pain', 'numbness_weakness', 'seizure'], screen: 'dizziness_faint', weight: 9 },
  weakness: { specialty: 'general_medicine', baseUrgency: 'routine', care: ['rest_fluids', 'light_food'], warnings: ['numbness_weakness', 'confusion'], screen: 'dizziness_faint', weight: 4 },
  numbness: { specialty: 'neurology', baseUrgency: 'urgent', care: ['keep_company'], warnings: ['numbness_weakness', 'vision_change', 'confusion'], screen: 'headache_sudden', weight: 9 },
  confusion: { specialty: 'neurology', baseUrgency: 'urgent', care: ['keep_company'], warnings: ['confusion', 'seizure'], weight: 10 },
  seizure: { specialty: 'neurology', baseUrgency: 'emergency', care: ['keep_company'], warnings: ['seizure'], acute: true, weight: 12 },
  rash: { specialty: 'dermatology', baseUrgency: 'routine', care: ['no_self_medication'], warnings: ['breathing', 'stiff_neck_rash', 'fever_persistent'], screen: 'allergy_airway', weight: 5 },
  itching: { specialty: 'dermatology', baseUrgency: 'self_care', care: ['no_self_medication'], warnings: ['breathing'], screen: 'allergy_airway', weight: 2 },
  swelling: { specialty: 'general_medicine', baseUrgency: 'routine', care: ['no_self_medication'], warnings: ['breathing', 'worsening_pain'], screen: 'allergy_airway', weight: 5 },
  ear_pain: { specialty: 'ent', baseUrgency: 'routine', care: ['no_self_medication'], warnings: ['worsening_pain', 'fever_persistent'], weight: 4 },
  eye_pain: { specialty: 'ophthalmology', baseUrgency: 'routine', care: ['eye_care'], warnings: ['vision_change', 'worsening_pain'], screen: 'eye_vision', weight: 5 },
  eye_redness: { specialty: 'ophthalmology', baseUrgency: 'routine', care: ['eye_care'], warnings: ['vision_change', 'worsening_pain'], screen: 'eye_vision', weight: 3 },
  blurred_vision: { specialty: 'ophthalmology', baseUrgency: 'urgent', care: ['keep_company'], warnings: ['vision_change', 'numbness_weakness'], screen: 'eye_vision', weight: 8 },
  toothache: { specialty: 'dental', baseUrgency: 'routine', care: ['dental_rinse', 'no_self_medication'], warnings: ['infection_signs', 'worsening_pain'], weight: 3 },
  back_pain: { specialty: 'orthopedics', baseUrgency: 'self_care', care: ['injury_rest_cold', 'no_self_medication'], warnings: ['numbness_weakness', 'worsening_pain'], weight: 3 },
  joint_pain: { specialty: 'orthopedics', baseUrgency: 'routine', care: ['injury_rest_cold', 'no_self_medication'], warnings: ['worsening_pain', 'infection_signs'], weight: 3 },
  neck_stiffness: { specialty: 'orthopedics', baseUrgency: 'routine', care: ['no_self_medication'], warnings: ['stiff_neck_rash', 'fever_persistent'], screen: 'fever_danger', weight: 5 },
  injury: { specialty: 'orthopedics', baseUrgency: 'routine', care: ['wound_clean', 'injury_rest_cold'], warnings: ['worsening_pain', 'numbness_weakness', 'infection_signs'], screen: 'injury_severity', acute: true, weight: 7 },
  burn: { specialty: 'general_medicine', baseUrgency: 'routine', care: ['burn_cool'], warnings: ['infection_signs', 'worsening_pain'], screen: 'burn_size', acute: true, weight: 7 },
  bleeding: { specialty: 'general_medicine', baseUrgency: 'urgent', care: ['wound_clean', 'keep_company'], warnings: ['bleeding_signs', 'breathing'], acute: true, weight: 9 },
  painful_urination: { specialty: 'urology', baseUrgency: 'routine', care: ['urination_fluids', 'no_self_medication'], warnings: ['fever_persistent', 'severe_abdominal'], screen: 'urinary_spread', weight: 4 },
  blood_in_urine: { specialty: 'urology', baseUrgency: 'urgent', care: ['urination_fluids'], warnings: ['severe_abdominal', 'less_urine'], screen: 'urinary_spread', weight: 8 },
  blood_in_stool: { specialty: 'gastroenterology', baseUrgency: 'urgent', care: ['rest_fluids'], warnings: ['bleeding_signs', 'severe_abdominal'], weight: 9 },
  blood_in_vomit: { specialty: 'gastroenterology', baseUrgency: 'emergency', care: ['keep_company'], warnings: ['bleeding_signs'], acute: true, weight: 12 },
  dehydration: { specialty: 'general_medicine', baseUrgency: 'urgent', care: ['ors_small_sips'], warnings: ['less_urine', 'confusion'], weight: 8 },
  animal_bite: { specialty: 'general_medicine', baseUrgency: 'urgent', care: ['bite_wash'], warnings: ['infection_signs'], acute: true, weight: 9 },
  pregnancy_concern: { specialty: 'obstetrics_gynecology', baseUrgency: 'routine', care: ['rest_fluids'], warnings: ['bleeding_signs', 'severe_abdominal', 'vision_change'], screen: 'pregnancy_danger', weight: 8 },
  anxiety: { specialty: 'psychiatry', baseUrgency: 'routine', care: ['mental_support', 'sleep_hygiene'], warnings: ['self_harm_thoughts', 'chest_pain'], screen: 'mood_safety', weight: 4 },
  low_mood: { specialty: 'psychiatry', baseUrgency: 'routine', care: ['mental_support'], warnings: ['self_harm_thoughts'], screen: 'mood_safety', weight: 5 },
  insomnia: { specialty: 'psychiatry', baseUrgency: 'self_care', care: ['sleep_hygiene', 'mental_support'], warnings: ['self_harm_thoughts'], screen: 'mood_safety', weight: 2 },
};

export const RED_FLAG_SCREENS: Record<RedFlagScreenId, RedFlagScreen> = {
  // Asked when the AI layer suspects an emergency the deterministic rules did not detect.
  // Only the user's explicit "yes" to this fixed question can escalate to emergency.
  ai_emergency_confirm: {
    id: 'ai_emergency_confirm',
    question: {
      en: 'I want to be careful. Is this happening right now and feeling severe — like chest pain, trouble breathing, heavy bleeding or fainting?',
      hi: 'मैं सावधानी रखना चाहती हूं। क्या यह अभी हो रहा है और गंभीर है — जैसे सीने में दर्द, सांस में तकलीफ़, बहुत खून बहना या बेहोशी?',
      hinglish: 'Main savdhaani rakhna chahti hoon. Kya ye abhi ho raha hai aur gambhir hai — jaise seene mein dard, saans mein takleef, bahut khoon behna ya behoshi?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'emergency', emergencyCategory: 'user_requested' },
  },
  fever_danger: {
    id: 'fever_danger',
    question: {
      en: 'Is there any rash, stiff neck, confusion, or difficulty breathing?',
      hi: 'क्या कोई दाने, गर्दन में अकड़न, भ्रम, या सांस लेने में दिक्कत है?',
      hinglish: 'Kya koi daane, gardan mein akdan, confusion, ya saans lene mein dikkat hai?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'urgent' },
    // "difficulty breathing" and "confusion" in this list are emergency-grade; a bare
    // yes cannot say which of the four it was, so we ask.
    confirmEmergencyAs: 'meningitis_signs',
  },
  headache_sudden: {
    id: 'headache_sudden',
    question: {
      en: 'Did it start suddenly and feel like the worst ever, or come with weakness, numbness or blurred vision?',
      hi: 'क्या यह अचानक और अब तक का सबसे तेज़ दर्द है, या साथ में कमज़ोरी, सुन्नपन या धुंधला दिखना है?',
      hinglish: 'Kya ye achanak aur ab tak ka sabse tez dard hai, ya saath mein kamzori, sunnpan ya dhundhla dikhna hai?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'emergency', emergencyCategory: 'stroke' },
  },
  abdominal_severe: {
    id: 'abdominal_severe',
    question: {
      en: 'Is the pain severe and constant, or is there blood in vomit or stool?',
      hi: 'क्या दर्द बहुत तेज़ और लगातार है, या उल्टी या मल में खून है?',
      hinglish: 'Kya dard bahut tez aur lagataar hai, ya ulti ya potty mein khoon hai?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'urgent' },
  },
  gi_hydration: {
    id: 'gi_hydration',
    question: {
      en: 'Are you able to keep water down and pass urine normally?',
      hi: 'क्या पानी पेट में रुक रहा है और पेशाब सामान्य आ रहा है?',
      hinglish: 'Kya paani pet mein ruk raha hai aur peshab normal aa raha hai?',
    },
    positiveAnswer: 'no',
    onPositive: { urgency: 'urgent' },
  },
  respiratory: {
    id: 'respiratory',
    question: {
      en: 'Are you short of breath, or coughing up blood?',
      hi: 'क्या सांस फूल रही है, या खांसी में खून आ रहा है?',
      hinglish: 'Kya saans phool rahi hai, ya khansi mein khoon aa raha hai?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'urgent' },
  },
  injury_severity: {
    id: 'injury_severity',
    question: {
      en: 'Is there heavy bleeding, a bone that looks out of shape, or a hit to the head?',
      hi: 'क्या बहुत खून बह रहा है, हड्डी टेढ़ी दिख रही है, या सिर पर चोट लगी है?',
      hinglish: 'Kya bahut khoon beh raha hai, haddi tedhi dikh rahi hai, ya sir par chot lagi hai?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'urgent' },
  },
  dizziness_faint: {
    id: 'dizziness_faint',
    question: {
      en: 'Did you faint, or is there chest pain or weakness on one side of the body?',
      hi: 'क्या आप बेहोश हुए, या सीने में दर्द या शरीर के एक तरफ कमज़ोरी है?',
      hinglish: 'Kya aap behosh hue, ya seene mein dard ya body ke ek taraf kamzori hai?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'urgent' },
  },
  allergy_airway: {
    id: 'allergy_airway',
    question: {
      en: 'Is there swelling of the face, lips or tongue, or any trouble breathing?',
      hi: 'क्या चेहरे, होंठ या जीभ पर सूजन है, या सांस लेने में दिक्कत है?',
      hinglish: 'Kya chehre, honth ya jeebh par soojan hai, ya saans lene mein dikkat hai?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'emergency', emergencyCategory: 'anaphylaxis' },
  },
  mood_safety: {
    id: 'mood_safety',
    question: {
      en: 'I want to make sure you’re safe. Are you having any thoughts of harming yourself?',
      hi: 'मैं यह पक्का करना चाहती हूं कि आप सुरक्षित हैं। क्या आपके मन में खुद को नुकसान पहुंचाने के विचार आ रहे हैं?',
      hinglish: 'Main pakka karna chahti hoon ki aap safe hain. Kya aapke mann mein khud ko nuksaan pahunchane ke vichaar aa rahe hain?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'emergency', emergencyCategory: 'self_harm' },
  },
  urinary_spread: {
    id: 'urinary_spread',
    question: {
      en: 'Do you also have fever, back pain or vomiting?',
      hi: 'क्या साथ में बुखार, कमर दर्द या उल्टी भी है?',
      hinglish: 'Kya saath mein bukhar, kamar dard ya ulti bhi hai?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'urgent' },
  },
  eye_vision: {
    id: 'eye_vision',
    question: {
      en: 'Has your vision suddenly changed, or was the eye injured?',
      hi: 'क्या अचानक नज़र में बदलाव आया है, या आंख में चोट लगी है?',
      hinglish: 'Kya achanak nazar mein badlaav aaya hai, ya aankh mein chot lagi hai?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'urgent' },
  },
  pregnancy_danger: {
    id: 'pregnancy_danger',
    question: {
      en: 'Is there any bleeding, severe pain, bad headache, or has the baby stopped moving?',
      hi: 'क्या खून आ रहा है, तेज़ दर्द या तेज़ सिर दर्द है, या बच्चे ने हिलना बंद कर दिया है?',
      hinglish: 'Kya khoon aa raha hai, tez dard ya tez sir dard hai, ya baby ne hilna band kar diya hai?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'emergency', emergencyCategory: 'obstetric' },
  },
  palpitations_danger: {
    id: 'palpitations_danger',
    question: {
      en: 'Along with this, do you feel chest pain, breathlessness or like you might faint?',
      hi: 'इसके साथ क्या सीने में दर्द, सांस फूलना या बेहोशी जैसा लग रहा है?',
      hinglish: 'Iske saath kya seene mein dard, saans phoolna ya behoshi jaisa lag raha hai?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'emergency', emergencyCategory: 'cardiac' },
  },
  burn_size: {
    id: 'burn_size',
    question: {
      en: 'Is the burn bigger than your palm, blistering a lot, or on the face, hands or private parts?',
      hi: 'क्या जला हिस्सा हथेली से बड़ा है, बहुत छाले हैं, या चेहरे, हाथ या गुप्तांग पर है?',
      hinglish: 'Kya jala hissa hatheli se bada hai, bahut chhaale hain, ya chehre, haath ya private parts par hai?',
    },
    positiveAnswer: 'yes',
    onPositive: { urgency: 'urgent' },
  },
};
