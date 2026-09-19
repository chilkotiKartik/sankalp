import type { Language, QuickReply } from '@sanjeevani/types';
import { SYMPTOM_LABELS } from '../content/labels';
import { fill, type Localized } from '../content/localized';
import { RED_FLAG_SCREENS } from './profiles';
import type { FollowUpSlot } from './state';

const DURATION_Q: Localized = {
  en: 'How long has this been going on?',
  hi: 'यह कब से हो रहा है?',
  hinglish: 'Ye kab se ho raha hai?',
};

const AGE_Q: Localized = {
  en: 'Who is this for — you, a child, or an older person?',
  hi: 'यह किसके लिए है — आपके, किसी बच्चे के, या किसी बुज़ुर्ग के लिए?',
  hinglish: 'Ye kiske liye hai — aapke, kisi bachche ke, ya kisi buzurg ke liye?',
};

const SEVERITY_Q: Localized = {
  en: 'How bad is the {symptom} — mild, moderate or severe?',
  hi: '{symptom} कितना है — हल्का, मध्यम या बहुत तेज़?',
  hinglish: '{symptom} kitna hai — halka, theek-thaak ya bahut tez?',
};

const DETAIL_Q: Localized = {
  en: 'Tell me what you’re feeling — for example fever, pain, cough or an injury.',
  hi: 'बताइए आपको क्या तकलीफ़ है — जैसे बुखार, दर्द, खांसी या चोट।',
  hinglish: 'Bataiye aapko kya takleef hai — jaise bukhar, dard, khansi ya chot.',
};

const YES_NO: Record<Language, QuickReply[]> = {
  en: [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ],
  hi: [
    { label: 'हाँ', value: 'हाँ' },
    { label: 'नहीं', value: 'नहीं' },
  ],
  hinglish: [
    { label: 'Haan', value: 'haan' },
    { label: 'Nahi', value: 'nahi' },
  ],
};

const DURATION_REPLIES: Record<Language, QuickReply[]> = {
  en: [
    { label: 'Since today', value: 'since today' },
    { label: '1–2 days', value: 'for 2 days' },
    { label: '3–6 days', value: 'for 4 days' },
    { label: 'Over a week', value: 'for 10 days' },
  ],
  hi: [
    { label: 'आज से', value: 'आज से' },
    { label: '1–2 दिन', value: '2 दिन से' },
    { label: '3–6 दिन', value: '4 दिन से' },
    { label: 'एक हफ्ते से ज़्यादा', value: '10 दिन से' },
  ],
  hinglish: [
    { label: 'Aaj se', value: 'aaj se' },
    { label: '1–2 din', value: '2 din se' },
    { label: '3–6 din', value: '4 din se' },
    { label: 'Hafte se zyada', value: '10 din se' },
  ],
};

const AGE_REPLIES: Record<Language, QuickReply[]> = {
  en: [
    { label: 'Myself', value: 'for myself' },
    { label: 'A child', value: 'for my child' },
    { label: 'A baby under 1', value: 'for my newborn baby' },
    { label: 'An older person', value: 'for an elderly person' },
  ],
  hi: [
    { label: 'मेरे लिए', value: 'मेरे लिए' },
    { label: 'बच्चे के लिए', value: 'बच्चे के लिए' },
    { label: '1 साल से छोटा शिशु', value: 'नवजात शिशु के लिए' },
    { label: 'बुज़ुर्ग के लिए', value: 'बुजुर्ग के लिए' },
  ],
  hinglish: [
    { label: 'Mere liye', value: 'mere liye' },
    { label: 'Bachche ke liye', value: 'bachche ke liye' },
    { label: 'Chhota baby (1 saal se kam)', value: 'navjaat shishu ke liye' },
    { label: 'Buzurg ke liye', value: 'buzurg ke liye' },
  ],
};

const SEVERITY_REPLIES: Record<Language, QuickReply[]> = {
  en: [
    { label: 'Mild', value: 'mild' },
    { label: 'Moderate', value: 'moderate' },
    { label: 'Severe', value: 'severe' },
  ],
  hi: [
    { label: 'हल्का', value: 'हल्का' },
    { label: 'मध्यम', value: 'मध्यम' },
    { label: 'बहुत तेज़', value: 'बहुत तेज़' },
  ],
  hinglish: [
    { label: 'Halka', value: 'halka' },
    { label: 'Theek-thaak', value: 'theek thaak' },
    { label: 'Bahut tez', value: 'bahut tez' },
  ],
};

const DETAIL_REPLIES: Record<Language, QuickReply[]> = {
  en: [
    { label: 'Fever', value: 'I have a fever' },
    { label: 'Stomach pain', value: 'I have stomach pain' },
    { label: 'Cough & cold', value: 'I have a cough and cold' },
    { label: 'An injury', value: 'I have an injury' },
  ],
  hi: [
    { label: 'बुखार', value: 'मुझे बुखार है' },
    { label: 'पेट दर्द', value: 'मुझे पेट दर्द है' },
    { label: 'खांसी-जुकाम', value: 'मुझे खांसी और जुकाम है' },
    { label: 'चोट', value: 'मुझे चोट लगी है' },
  ],
  hinglish: [
    { label: 'Bukhar', value: 'mujhe bukhar hai' },
    { label: 'Pet dard', value: 'mujhe pet dard hai' },
    { label: 'Khansi-zukam', value: 'mujhe khansi aur zukam hai' },
    { label: 'Chot', value: 'mujhe chot lagi hai' },
  ],
};

export function followUpPrompt(slot: FollowUpSlot, language: Language): { question: string; quickReplies: QuickReply[] } {
  switch (slot.kind) {
    case 'red_flag':
      return { question: RED_FLAG_SCREENS[slot.screen].question[language], quickReplies: YES_NO[language] };
    case 'duration':
      return { question: DURATION_Q[language], quickReplies: DURATION_REPLIES[language] };
    case 'age_group':
      return { question: AGE_Q[language], quickReplies: AGE_REPLIES[language] };
    case 'severity':
      return {
        question: fill(SEVERITY_Q[language], { symptom: SYMPTOM_LABELS[slot.code][language] }),
        quickReplies: SEVERITY_REPLIES[language],
      };
    case 'symptom_detail':
      return { question: DETAIL_Q[language], quickReplies: DETAIL_REPLIES[language] };
  }
}
