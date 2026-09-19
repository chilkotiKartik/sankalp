import type { AgeGroup, EmergencyCategory, ExtractedSymptom, SymptomCode } from '@sanjeevani/types';

export interface EmergencyContext {
  symptoms: readonly ExtractedSymptom[];
  ageGroup: AgeGroup;
  pregnant: boolean;
  /** Head injury mentioned at any point in the conversation. */
  headInjury: boolean;
  /** Composite rules the user already dismissed; phrase rules always fire again when re-stated. */
  dismissedRuleIds?: readonly string[];
}

export interface PhraseRule {
  id: string;
  category: EmergencyCategory;
  phrases: readonly string[];
  /** Overrides the category's default first-aid instructions. */
  instructionSet?: string;
}

export interface CompositeRule {
  id: string;
  category: EmergencyCategory;
  test: (ctx: EmergencyContext, has: (code: SymptomCode) => ExtractedSymptom | undefined) => boolean;
}

/**
 * Hard emergency phrases. Any affirmed (non-negated) match triggers the circuit breaker.
 * These are deliberately conservative: a false alarm costs a tap on "this isn't an emergency";
 * a miss can cost a life.
 */
export const PHRASE_RULES: readonly PhraseRule[] = [
  {
    id: 'unconscious.direct',
    category: 'unconscious',
    phrases: [
      'unconscious', 'unresponsive', 'not responding', 'not waking up', 'won t wake up', 'wont wake up', 'collapsed',
      'behosh', 'behos', 'hosh nahi', 'hosh mein nahi', 'hosh kho', 'jawab nahi de raha', 'jawab nahi de rahi',
      'uth nahi raha', 'uth nahi rahi', 'hil nahi raha', 'hil nahi rahi',
      'बेहोश', 'होश नहीं', 'होश में नहीं', 'जवाब नहीं दे', 'उठ नहीं रहा', 'उठ नहीं रही',
    ],
  },
  {
    id: 'breathing.cannot_breathe',
    category: 'breathing',
    phrases: [
      'can t breathe', 'cant breathe', 'cannot breathe', 'unable to breathe', 'not breathing', 'stopped breathing',
      'struggling to breathe', 'gasping', 'choking', 'lips turning blue', 'lips are blue', 'blue lips', 'turning blue',
      'saans nahi aa', 'saans nahi le pa', 'sans nahi aa', 'saans ruk', 'saans band', 'saans nahi le', 'saans atak',
      'dam ghut raha', 'dum ghut raha', 'gala ghut', 'honth neele', 'hont nile',
      'सांस नहीं आ', 'साँस नहीं आ', 'सांस नहीं ले', 'सांस रुक', 'सांस बंद', 'सांस अटक', 'होंठ नीले', 'दम घुट रहा',
    ],
  },
  {
    id: 'cardiac.direct',
    category: 'cardiac',
    phrases: [
      'heart attack', 'cardiac arrest', 'heart stopped', 'pain spreading to arm', 'pain going to left arm', 'pain radiating',
      'dil ka daura', 'heart attack aa', 'dil ruk',
      'दिल का दौरा', 'हार्ट अटैक',
    ],
  },
  {
    id: 'stroke.fast_signs',
    category: 'stroke',
    phrases: [
      'stroke', 'face drooping', 'face drooped', 'face is drooping', 'drooping face', 'slurred speech', 'speech is slurred',
      'speech slurred', 'can t speak properly', 'cannot speak', 'can t talk properly', 'one side weak~', 'one side of body',
      'one sided weakness', 'weakness on one side', 'numb on one side', 'arm went weak', 'can t lift arm', 'paralys~',
      'lakwa', 'lakva', 'laqwa', 'muh tedha', 'munh tedha', 'chehra tedha', 'ek taraf kamzori', 'ek taraf sunn',
      'ek side kamzori', 'zubaan ladkhada', 'juban ladkhada', 'bolne mein dikkat', 'boli ladkhada', 'aadha sharir',
      'लकवा', 'मुंह टेढ़ा', 'चेहरा टेढ़ा', 'ज़ुबान लड़खड़ा', 'जुबान लड़खड़ा', 'बोलने में दिक्कत', 'आधा शरीर', 'एक तरफ कमजोरी',
    ],
  },
  {
    id: 'stroke.thunderclap_or_vision',
    category: 'stroke',
    phrases: [
      'worst headache of my life', 'worst headache ever', 'sudden severe headache', 'thunderclap',
      'sudden vision loss', 'suddenly can t see', 'lost vision suddenly', 'suddenly blind',
      'achanak dikhna band', 'achanak se dikhna band', 'achanak bahut tez sir dard',
      'अचानक दिखना बंद', 'अचानक बहुत तेज सिर दर्द',
    ],
  },
  {
    id: 'trauma.major',
    category: 'major_trauma',
    phrases: [
      'accident', 'hit by a car', 'hit by a bike', 'hit by a vehicle', 'run over', 'fell from height', 'fell from the roof',
      'fell from roof', 'fell from building', 'fell off the roof', 'fell off a building', 'got shot', 'been shot', 'gunshot',
      'stabbed', 'stab wound', 'bone sticking out', 'bone is visible', 'head injury with vomiting',
      'takkar', 'chhat se gir', 'chat se gir', 'upar se gir', 'sir fat gaya', 'sar fat gaya', 'goli lag', 'chaku lag',
      'chaaku mar', 'haddi bahar',
      'दुर्घटना', 'एक्सीडेंट', 'छत से गिर', 'ऊपर से गिर', 'गोली लग', 'चाकू', 'सिर फट', 'हड्डी बाहर',
    ],
  },
  {
    id: 'bleeding.severe',
    category: 'severe_bleeding',
    phrases: [
      'bleeding heavily', 'heavy bleeding', 'bleeding a lot', 'lots of blood', 'lot of blood', 'won t stop bleeding',
      'bleeding won t stop', 'bleeding wont stop', 'can t stop the bleeding', 'bleeding not stopping', 'blood everywhere',
      'spurting blood', 'khoon ruk nahi', 'khoon nahi ruk', 'bahut khoon', 'khoon hi khoon', 'bahut zyada khoon',
      'खून नहीं रुक', 'खून रुक नहीं', 'बहुत खून', 'खून ही खून',
    ],
  },
  {
    id: 'seizure.active',
    category: 'seizure',
    phrases: [
      'seizure~', 'convulsion~', 'convulsing', 'having a fit', 'having fits', 'fitting',
      'mirgi ka daura', 'daura pad', 'jhatke aa', 'jhatke lag',
      'मिर्गी का दौरा', 'दौरा पड़', 'झटके आ',
    ],
  },
  {
    id: 'anaphylaxis.airway',
    category: 'anaphylaxis',
    phrases: [
      'anaphyla~', 'severe allergic reaction', 'throat closing', 'throat is closing', 'throat swelling', 'throat is swelling',
      'tongue swelling', 'swollen tongue', 'tongue is swollen', 'lips swelling', 'lips swollen', 'swollen lips',
      'gala band ho', 'gala sooj', 'gala suj', 'jeebh sooj', 'jibh suj', 'honth sooj', 'hont suj',
      'गला बंद हो', 'गला सूज', 'जीभ सूज', 'होंठ सूज',
    ],
  },
  {
    id: 'poisoning.ingestion',
    category: 'poisoning',
    phrases: [
      'overdose~', 'took too many pills', 'too many tablets', 'swallowed pills', 'swallowed tablets', 'took poison',
      'drank poison', 'ate poison', 'swallowed poison', 'poison kha', 'poison pi', 'pesticide', 'insecticide',
      'rat poison', 'drank bleach', 'drank acid', 'drank kerosene', 'swallowed kerosene', 'swallowed bleach',
      'swallowed acid', 'swallowed phenyl', 'drank phenyl', 'drank sanitizer', 'swallowed detergent', 'drank detergent',
      'swallowed battery', 'swallowed a battery',
      'zeher', 'jeher', 'zahar', 'jahar', 'keetnashak', 'chuhe mar', 'bahut saari goliyan', 'zyada goliyan kha',
      'saari goliyan kha', 'tezab pi', 'mitti ka tel pi',
      'ज़हर', 'जहर', 'कीटनाशक', 'ज़्यादा गोलियां', 'बहुत सारी गोलियां', 'चूहे मार',
    ],
  },
  {
    id: 'poisoning.envenomation',
    category: 'poisoning',
    instructionSet: 'envenomation',
    phrases: [
      'snake bite~', 'bitten by a snake', 'snake bit', 'scorpion sting~', 'scorpion bit~', 'stung by a scorpion',
      'saanp ne kaat', 'saap ne kaat', 'sanp ne kata', 'saanp kaat', 'bichhu ne kaat', 'bichu ne kata', 'bichhu kaat',
      'सांप ने काट', 'साँप ने काट', 'बिच्छू ने काट', 'सांप का काटना',
    ],
  },
  {
    id: 'self_harm.intent',
    category: 'self_harm',
    phrases: [
      'kill myself', 'end my life', 'want to die', 'wanted to die', 'wish i was dead', 'wish i were dead',
      'feel like dying', 'felt like dying', 'suicid~', 'self harm', 'hurt myself on purpose', 'don t want to live',
      'dont want to live', 'do not want to live', 'not want to live', 'no reason to live', 'better off dead',
      'take my own life', 'tired of living', 'cannot go on', 'can t go on', 'end it all',
      'marna chahta', 'marna chahti', 'mar jana chahta', 'mar jana chahti', 'jeena nahi chahta', 'jeena nahi chahti',
      'jina nahi chahta', 'jina nahi chahti', 'khudkushi', 'aatmahatya', 'atmahatya', 'apne aap ko khatam', 'zindagi khatam kar',
      'jeene ka mann nahi', 'jine ka mann nahi', 'jeene ka man nahi', 'jeene ki ichha nahi', 'ab nahi jeena',
      'आत्महत्या', 'मरना चाहता', 'मरना चाहती', 'जीना नहीं चाहता', 'जीना नहीं चाहती', 'खुदकुशी', 'ख़ुदकुशी', 'खुद को खत्म',
      'जीने का मन नहीं', 'जीने की इच्छा नहीं', 'अब नहीं जीना',
    ],
  },
  {
    id: 'burn.severe',
    category: 'severe_burn',
    phrases: [
      'badly burned', 'badly burnt', 'severe burn~', 'big burn', 'large burn', 'large area burnt', 'large area burned',
      'hot oil spilled', 'hot oil fell', 'boiling water spilled', 'boiling water fell', 'burned face', 'acid attack', 'acid thrown',
      'electric shock', 'electrocuted', 'caught fire', 'clothes caught fire', 'on fire',
      'aag lag gayi', 'aag lag gai', 'kapdon mein aag', 'bahut jal gaya', 'bahut jal gayi', 'buri tarah jal', 'tezaab fek',
      'garam tel gir', 'khaulta pani gir', 'garam pani gir',
      'current lag', 'karant lag', 'bijli ka jhatka',
      'आग लग', 'बुरी तरह जल', 'तेज़ाब', 'तेजाब', 'करंट लग', 'बिजली का झटका',
    ],
  },
  {
    id: 'obstetric.direct',
    category: 'obstetric',
    phrases: [
      'water broke', 'waters broke', 'water has broken', 'labour pain~', 'labor pain~', 'in labour', 'in labor',
      'contractions', 'baby not moving', 'baby isn t moving', 'baby stopped moving', 'delivery pain~',
      'pani ki thaili phat', 'bachcha pet mein hil nahi', 'prasav peeda', 'prasav pida', 'delivery ka dard', 'dard e zeh',
      'प्रसव पीड़ा', 'पानी की थैली फट', 'पेट में बच्चा हिल नहीं', 'डिलीवरी का दर्द',
    ],
  },
  {
    id: 'infant.danger_signs',
    category: 'infant_danger',
    phrases: [
      'baby not feeding', 'baby won t feed', 'baby not drinking milk', 'baby is very sleepy', 'baby floppy', 'baby is limp',
      'newborn fever', 'newborn has fever', 'navjaat ko bukhar', 'baby doodh nahi pee', 'bachcha doodh nahi pee',
      'नवजात को बुखार', 'बच्चा दूध नहीं पी', 'शिशु दूध नहीं पी',
    ],
  },
  {
    id: 'user.requested_ambulance',
    category: 'user_requested',
    phrases: [
      'call ambulance', 'call an ambulance', 'need an ambulance', 'need ambulance', 'send ambulance', 'emergency hai',
      'this is an emergency', 'it s an emergency', 'medical emergency',
      'ambulance bulao', 'ambulance chahiye', 'ambulance bhejo', 'ambulance bula do',
      'एम्बुलेंस बुलाओ', 'एम्बुलेंस चाहिए', 'एंबुलेंस', 'इमरजेंसी है',
    ],
  },
];

const isSevere = (s: ExtractedSymptom | undefined) => s?.severity === 'severe';

/** Rules that need context accumulated across turns (symptoms, age, pregnancy). */
export const COMPOSITE_RULES: readonly CompositeRule[] = [
  { id: 'cardiac.chest_pain', category: 'cardiac', test: (_c, has) => Boolean(has('chest_pain')) },
  {
    id: 'cardiac.faint_with_palpitations',
    category: 'cardiac',
    test: (_c, has) => Boolean(has('fainting') && has('palpitations')),
  },
  { id: 'breathing.severe_breathlessness', category: 'breathing', test: (_c, has) => isSevere(has('breathlessness')) },
  {
    id: 'breathing.child_breathlessness',
    category: 'breathing',
    test: (c, has) => Boolean(has('breathlessness')) && (c.ageGroup === 'infant' || c.ageGroup === 'child'),
  },
  {
    id: 'anaphylaxis.swelling_with_breathing',
    category: 'anaphylaxis',
    test: (_c, has) => Boolean((has('swelling') || has('rash') || has('itching')) && (has('breathlessness') || has('wheezing'))),
  },
  { id: 'bleeding.vomiting_blood', category: 'severe_bleeding', test: (_c, has) => Boolean(has('blood_in_vomit')) },
  { id: 'bleeding.severe_bleeding', category: 'severe_bleeding', test: (_c, has) => isSevere(has('bleeding')) },
  { id: 'seizure.reported', category: 'seizure', test: (_c, has) => Boolean(has('seizure')) },
  { id: 'burn.severe_burn', category: 'severe_burn', test: (_c, has) => isSevere(has('burn')) },
  {
    id: 'meningitis.fever_neck_stiffness',
    category: 'meningitis_signs',
    test: (_c, has) => Boolean(has('fever') && has('neck_stiffness')),
  },
  { id: 'meningitis.fever_confusion', category: 'meningitis_signs', test: (_c, has) => Boolean(has('fever') && has('confusion')) },
  {
    id: 'trauma.head_injury_red_flags',
    category: 'major_trauma',
    test: (c, has) => c.headInjury && Boolean(has('vomiting') || has('confusion') || has('fainting') || has('seizure') || has('bleeding')),
  },
  {
    id: 'obstetric.pregnancy_red_flags',
    category: 'obstetric',
    test: (c, has) =>
      c.pregnant &&
      Boolean(
        has('bleeding') ||
          has('seizure') ||
          isSevere(has('abdominal_pain')) ||
          isSevere(has('headache')) ||
          has('blurred_vision') ||
          (has('swelling') && has('headache')),
      ),
  },
  {
    id: 'infant.fever',
    category: 'infant_danger',
    test: (c, has) => c.ageGroup === 'infant' && Boolean(has('fever') || has('breathlessness') || has('seizure') || has('dehydration')),
  },
];

/** Higher first — decides which instructions are shown when several rules fire. */
export const CATEGORY_PRIORITY: readonly EmergencyCategory[] = [
  'unconscious',
  'breathing',
  'cardiac',
  'stroke',
  'severe_bleeding',
  'anaphylaxis',
  'major_trauma',
  'seizure',
  'poisoning',
  'obstetric',
  'infant_danger',
  'meningitis_signs',
  'severe_burn',
  'self_harm',
  'user_requested',
];

export const HEAD_INJURY_PHRASES = [
  'head injury', 'hit my head', 'hit his head', 'hit her head', 'bumped head', 'head hit',
  'sir mein chot', 'sir pe chot', 'sar pe chot', 'sar mein chot', 'sir par chot', 'sir se takra', 'sar fat',
  'सिर में चोट', 'सिर पर चोट', 'सिर पे चोट',
] as const;
