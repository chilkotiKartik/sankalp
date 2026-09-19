import { compileAll, hasAffirmed, prepareText } from '@sanjeevani/medical-safety';
import type { Intent } from '@sanjeevani/types';

const GREETING = compileAll(['hi', 'hello', 'hey', 'namaste', 'namaskar', 'good morning', 'good evening', 'नमस्ते', 'नमस्कार', 'हेलो'], 0);
const THANKS = compileAll(['thank~', 'thx', 'shukriya', 'shukria', 'dhanyavad', 'dhanyawad', 'धन्यवाद', 'शुक्रिया', 'bas itna hi', 'that s all', 'thats all'], 0);
const RESET = compileAll(
  ['start over', 'start again', 'new conversation', 'reset', 'naya shuru', 'fir se shuru', 'phir se shuru', 'shuru se', 'फिर से शुरू', 'नई बातचीत'],
  1,
);
const FIND = compileAll(
  [
    'hospital~', 'clinic~', 'nearest', 'nearby', 'near me', 'pharmacy', 'chemist', 'medical store', 'emergency room',
    'aspatal', 'haspatal', 'davakhana', 'dawakhana', 'paas mein', 'nazdeek', 'najdik', 'kaha dikhau', 'kahan dikhaun', 'kahan jaun',
    'kaha jau', 'doctor kahan', 'अस्पताल', 'नज़दीकी', 'नजदीकी', 'पास में', 'क्लिनिक', 'कहां जाऊं', 'कहाँ जाऊँ',
  ],
  1,
);
const DIRECTIONS = compileAll(
  [
    'direction~', 'route', 'navigate', 'navigation', 'map', 'how do i get', 'how to reach', 'take me',
    'rasta', 'raasta', 'kaise jaun', 'kaise jau', 'kaise pahunch~', 'le chalo', 'रास्ता', 'कैसे जाऊं', 'कैसे पहुंच', 'नक्शा',
  ],
  1,
);
const ANOTHER_SYMPTOM = compileAll(
  ['another symptom', 'one more symptom', 'something else', 'aur takleef', 'ek aur', 'aur bhi', 'और तकलीफ', 'एक और'],
  1,
);

export interface IntentSignals {
  hasSymptoms: boolean;
  answeredPending: boolean;
}

export type IntentDetail = Intent | 'add_symptom';

/** Deterministic intent detection. Symptom content always wins over small talk. */
export function detectIntent(text: string, signals: IntentSignals): IntentDetail {
  const prepared = prepareText(text);
  if (hasAffirmed(prepared, RESET)) return 'reset';
  if (hasAffirmed(prepared, DIRECTIONS)) return 'directions';
  if (signals.hasSymptoms) return 'symptom_report';
  if (signals.answeredPending) return 'follow_up_answer';
  if (hasAffirmed(prepared, ANOTHER_SYMPTOM)) return 'add_symptom';
  if (hasAffirmed(prepared, FIND)) return 'find_facility';
  if (hasAffirmed(prepared, THANKS)) return 'thanks';
  if (hasAffirmed(prepared, GREETING)) return 'greeting';
  return 'unrelated';
}
