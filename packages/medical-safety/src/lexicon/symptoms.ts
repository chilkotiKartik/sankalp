import type { SymptomCode } from '@sanjeevani/types';

/**
 * Symptom phrases in English, romanised Hindi (Hinglish) and Devanagari.
 * "~" marks a prefix token. Phrases tolerate up to two filler words between tokens.
 * Keep entries specific: the emergency layer has its own, stricter lexicon.
 */
export const SYMPTOM_LEXICON: Record<SymptomCode, readonly string[]> = {
  fever: [
    'fever~', 'feverish', 'high temperature', 'temperature high', 'pyrexia',
    'bukhar', 'bukhaar', 'bukar', 'taap', 'jwar', 'badan garam', 'sharir garam', 'body garam',
    'बुखार', 'बुख़ार', 'ज्वर', 'बदन गरम',
  ],
  chills: ['chills', 'shivering', 'rigor~', 'kapkapi', 'thand lag', 'thandi lag', 'कंपकंपी', 'ठंड लग'],
  body_ache: [
    'body ache~', 'body pain', 'bodyache', 'aching all over', 'muscle pain~', 'muscle ache~', 'myalgia',
    'badan dard', 'body mein dard', 'body me dard', 'sharir mein dard', 'haath pair mein dard', 'jism mein dard',
    'बदन दर्द', 'बदन में दर्द', 'शरीर में दर्द', 'शरीर दर्द',
  ],
  fatigue: ['tired', 'tiredness', 'fatigue~', 'exhausted', 'thakan', 'thakaan', 'thakawat', 'थकान', 'थकावट'],
  headache: [
    'headache~', 'head pain', 'head hurts', 'migraine~',
    'sir dard', 'sar dard', 'sir mein dard', 'sar mein dard', 'sir me dard', 'sar me dard', 'sirdard', 'sardard',
    'सिर दर्द', 'सिरदर्द', 'सर दर्द', 'सिर में दर्द',
  ],
  cough: ['cough~', 'coughing', 'khansi', 'khaansi', 'khasi', 'खांसी', 'खाँसी'],
  sore_throat: [
    'sore throat', 'throat pain', 'throat hurts', 'throat infection',
    'gala dard', 'gale mein dard', 'gale me dard', 'gala kharab', 'gale mein kharash', 'kharash',
    'गले में दर्द', 'गला दर्द', 'गला खराब', 'खराश',
  ],
  runny_nose: [
    'runny nose', 'blocked nose', 'stuffy nose', 'have cold', 'common cold', 'cold cough', 'sneez~',
    'jukam', 'zukam', 'zukaam', 'naak beh', 'naak band', 'sardi', 'chheenk~',
    'जुकाम', 'ज़ुकाम', 'नाक बह', 'नाक बंद', 'सर्दी', 'छींक',
  ],
  breathlessness: [
    'breathless~', 'short of breath', 'shortness of breath', 'difficulty breathing', 'trouble breathing',
    'hard to breathe', 'breathing problem', 'breathing difficulty',
    'saans phool', 'sans phool', 'saans lene mein', 'sans lene me', 'saans ki takleef', 'saans ki dikkat', 'dam ghut', 'dum ghut',
    'सांस फूल', 'साँस फूल', 'सांस लेने में', 'सांस की तकलीफ', 'दम घुट',
  ],
  wheezing: ['wheez~', 'whistling sound', 'seeti', 'सीटी'],
  chest_pain: [
    'chest pain', 'pain in chest', 'pain in my chest', 'chest tightness', 'tight chest', 'chest pressure', 'chest hurts',
    'seene mein dard', 'seene me dard', 'sine mein dard', 'chhati mein dard', 'chhati me dard', 'chest mein dard', 'chest me dard',
    'seene mein jakdan', 'chhati mein bharipan',
    'सीने में दर्द', 'छाती में दर्द', 'सीने में जकड़न', 'छाती में भारीपन',
  ],
  palpitations: [
    'palpitation~', 'heart racing', 'heart pounding', 'fast heartbeat', 'racing heart',
    'dil tez dhadak', 'dhadkan tez', 'dil ki dhadkan', 'ghabrahat',
    'दिल तेज़ धड़क', 'धड़कन तेज', 'दिल की धड़कन', 'घबराहट',
  ],
  abdominal_pain: [
    'stomach ache~', 'stomachache', 'stomach pain', 'stomach hurts', 'stomach is hurting', 'belly hurts', 'tummy hurts', 'abdominal pain', 'belly pain', 'tummy ache', 'pain in stomach',
    'pet dard', 'pet mein dard', 'pet me dard', 'pait dard', 'pet mein marod', 'marod',
    'पेट दर्द', 'पेट में दर्द', 'पेट में मरोड़', 'मरोड़',
  ],
  nausea: ['nausea~', 'nauseous', 'feel like vomiting', 'queasy', 'ji machal', 'jee machal', 'ulti jaisa', 'जी मचल', 'मतली'],
  vomiting: [
    'vomit~', 'throwing up', 'threw up', 'puking',
    'ulti', 'ultiyan', 'ulatti', 'ultee',
    'उल्टी', 'उलटी',
  ],
  diarrhea: [
    'diarrhea', 'diarrhoea', 'loose motion~', 'loose stool~', 'watery stool~',
    'dast', 'daast', 'pet kharab', 'pet chal', 'patle dast',
    'दस्त', 'पेट खराब', 'लूज़ मोशन',
  ],
  constipation: ['constipat~', 'kabz', 'kabj', 'qabz', 'कब्ज'],
  loss_of_appetite: ['no appetite', 'loss of appetite', 'not hungry', 'bhookh nahi', 'bhukh nahi', 'bhookh kam', 'भूख नहीं', 'भूख कम'],
  dizziness: [
    'dizz~', 'giddy', 'giddiness', 'lightheaded', 'light headed', 'vertigo', 'room spinning',
    'chakkar', 'chakar', 'sir ghoom', 'sar ghoom',
    'चक्कर', 'सिर घूम',
  ],
  fainting: ['faint~', 'passed out', 'blacked out', 'fell unconscious briefly', 'behoshi', 'gash aa', 'गश', 'बेहोशी'],
  weakness: ['weak', 'weakness', 'kamzori', 'kamjori', 'kamjor', 'कमजोरी', 'कमज़ोरी'],
  numbness: ['numb~', 'pins and needles', 'tingling', 'sunn', 'jhunjhuni', 'सुन्न', 'झुनझुनी'],
  confusion: ['confus~', 'disoriented', 'not making sense', 'bhram', 'hosh thik nahi', 'उलझन', 'भ्रम'],
  seizure: ['seizure~', 'convulsion~', 'having fits', 'getting fits', 'fits aa', 'fit aaya', 'mirgi', 'daura pad', 'jhatke aa', 'jhatke lag', 'दौरा पड़', 'मिर्गी', 'झटके आ'],
  rash: ['rash~', 'spots on skin', 'red spots', 'daane', 'dane', 'chakatte', 'lal daag', 'दाने', 'चकत्ते', 'लाल दाग'],
  itching: ['itch~', 'khujli', 'khujali', 'खुजली'],
  swelling: ['swell~', 'swollen', 'sujan', 'soojan', 'sooj', 'suj gaya', 'सूजन', 'सूज'],
  ear_pain: ['ear pain', 'earache', 'ear ache', 'ear hurts', 'kaan dard', 'kaan mein dard', 'kan me dard', 'कान दर्द', 'कान में दर्द'],
  eye_pain: ['eye pain', 'eyes hurt', 'eye hurts', 'aankh mein dard', 'ankh me dard', 'aankh dard', 'आंख में दर्द', 'आँख में दर्द'],
  eye_redness: ['red eye~', 'pink eye', 'eye redness', 'aankh lal', 'ankh lal', 'aankhen lal', 'आंख लाल', 'आँखें लाल'],
  blurred_vision: ['blurr~', 'can t see clearly', 'vision problem', 'dhundhla', 'dhundla', 'धुंधला'],
  toothache: ['toothache', 'tooth pain', 'tooth ache', 'dental pain', 'daant dard', 'dant dard', 'daant mein dard', 'दांत दर्द', 'दाँत में दर्द'],
  back_pain: ['back pain', 'backache', 'lower back', 'kamar dard', 'kamar mein dard', 'peeth dard', 'कमर दर्द', 'पीठ दर्द'],
  joint_pain: ['joint pain~', 'knee pain', 'joints hurt', 'arthritis', 'jodon mein dard', 'jodo me dard', 'ghutne mein dard', 'ghutno me dard', 'जोड़ों में दर्द', 'घुटने में दर्द'],
  neck_stiffness: ['stiff neck', 'neck stiffness', 'can t bend neck', 'gardan akad', 'gardan jakad', 'gardan mein akdan', 'गर्दन अकड़', 'गर्दन में अकड़न'],
  injury: [
    'injur~', 'hurt myself', 'fell down', 'had a fall', 'fell off', 'sprain~', 'twisted my', 'fracture~', 'broken bone', 'cut myself', 'wound',
    'chot', 'chot lagi', 'gir gaya', 'gir gayi', 'moch', 'haddi toot', 'zakhm', 'ghaav', 'kat gaya',
    'चोट', 'गिर गया', 'गिर गई', 'मोच', 'हड्डी टूट', 'ज़ख्म', 'घाव', 'कट गया',
  ],
  burn: ['burn~', 'scald~', 'jal gaya', 'jal gayi', 'jalne', 'jhulas', 'जल गया', 'जल गई', 'झुलस'],
  bleeding: [
    'bleed~', 'blood coming', 'coughing up blood', 'coughing blood', 'nosebleed', 'nose bleed~',
    'khoon beh', 'khoon nikal', 'khoon aa', 'khansi mein khoon', 'naak se khoon', 'nakseer',
    'खून बह', 'खून निकल', 'खून आ', 'खांसी में खून', 'नाक से खून', 'नकसीर',
  ],
  painful_urination: [
    'burning urine', 'burning urination', 'pain while urinating', 'painful urination', 'burning while peeing', 'uti',
    'peshab mein jalan', 'peshab me jalan', 'pishab mein jalan', 'urine mein jalan', 'urine me jalan',
    'पेशाब में जलन', 'पेशाब करते समय दर्द',
  ],
  blood_in_urine: ['blood in urine', 'blood in my urine', 'peshab mein khoon', 'urine mein khoon', 'पेशाब में खून'],
  blood_in_stool: ['blood in stool', 'blood in poo', 'black stool~', 'bloody stool~', 'potty mein khoon', 'latrine mein khoon', 'mal mein khoon', 'kala mal', 'मल में खून', 'काला मल'],
  blood_in_vomit: ['vomiting blood', 'blood in vomit', 'khoon ki ulti', 'ulti mein khoon', 'खून की उल्टी', 'उल्टी में खून'],
  dehydration: [
    'dehydrat~', 'very thirsty', 'no urine', 'not passing urine', 'dry mouth',
    'peshab nahi', 'pani ki kami', 'munh sookh', 'पानी की कमी', 'पेशाब नहीं', 'मुंह सूख',
  ],
  animal_bite: [
    'dog bite~', 'dog bit', 'bitten by', 'cat bite~', 'monkey bite~', 'animal bite~', 'scratched by a dog',
    'kutte ne kaat', 'kutta kaat', 'kutte ne kata', 'billi ne kaat', 'bandar ne kaat',
    'कुत्ते ने काट', 'बंदर ने काट', 'बिल्ली ने काट',
  ],
  pregnancy_concern: ['pregnan~', 'expecting a baby', 'garbhvati', 'garbhavastha', 'pet se hoon', 'गर्भवती', 'गर्भावस्था', 'प्रेग्नेंट'],
  anxiety: ['anxiety', 'anxious', 'panic attack~', 'panicking', 'very worried', 'bechaini', 'chinta', 'dar lag', 'बेचैनी', 'चिंता', 'घबराहट सी'],
  low_mood: [
    'depress~', 'feeling low', 'sad all the time', 'hopeless', 'no interest in anything',
    'udaas', 'udas', 'mann nahi lagta', 'dukhi', 'उदास', 'मन नहीं लगता', 'दुखी',
  ],
  insomnia: ['insomnia', 'can t sleep', 'cannot sleep', 'unable to sleep', 'no sleep', 'neend nahi', 'nind nahi', 'नींद नहीं'],
};

/** Words that raise or lower severity when close to a symptom phrase. */
export const SEVERITY_MODIFIERS = {
  severe: [
    'severe~', 'very', 'extreme~', 'unbearable', 'terrible', 'worst', 'intense', 'high',
    'bahut', 'bohot', 'bhot', 'tez', 'tej', 'zyada', 'jyada', 'bhayankar', 'asahniya', 'kaafi',
    'बहुत', 'तेज़', 'तेज', 'ज़्यादा', 'ज्यादा', 'भयंकर', 'असहनीय', 'काफी',
  ],
  mild: ['mild', 'slight~', 'little', 'bit', 'halka', 'halki', 'thoda', 'thodi', 'हल्का', 'हल्की', 'थोड़ा', 'थोड़ी'],
  moderate: ['moderate', 'quite', 'medium', 'theek thaak', 'thik thak', 'madhyam', 'मध्यम', 'ठीक ठाक'],
} as const;
