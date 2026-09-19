import { describe, expect, it } from 'vitest';
import {
  detectLanguage,
  extractAge,
  extractDuration,
  extractSymptoms,
  guardAssistantText,
  normalizeText,
  parseSeverityAnswer,
  parseYesNo,
  phoneticKey,
  resolveReplyLanguage,
} from '../src';

const codes = (text: string) => extractSymptoms(text).affirmed.map((s) => s.code).sort();

describe('text normalisation', () => {
  it('flattens romanised spelling variants', () => {
    expect(phoneticKey('bukhaaar')).toBe(phoneticKey('bukhar'));
    expect(phoneticKey('nahin')).toBe(phoneticKey('nahi'));
    expect(phoneticKey('zyada')).toBe(phoneticKey('jyada'));
  });

  it('converts Devanagari digits and keeps clause boundaries', () => {
    expect(normalizeText('२ दिन से, बुखार')).toBe('2 दिन से | बुखार');
  });
});

describe('symptom extraction', () => {
  it('understands the core Hinglish example', () => {
    const { affirmed } = extractSymptoms('Mujhe do din se bahut tez bukhar hai aur body pain ho raha hai.');
    expect(affirmed.map((s) => s.code).sort()).toEqual(['body_ache', 'fever']);
    expect(affirmed.find((s) => s.code === 'fever')?.severity).toBe('severe');
  });

  it('handles Devanagari', () => {
    expect(codes('मुझे बुखार और खांसी है')).toEqual(['cough', 'fever']);
  });

  it('handles English with spelling variety', () => {
    expect(codes('I have a stomach ache and loose motions')).toEqual(['abdominal_pain', 'diarrhea']);
  });

  it('respects English and Hindi negation', () => {
    const en = extractSymptoms('no fever, but my stomach hurts');
    expect(en.negated).toContain('fever');
    expect(en.affirmed.map((s) => s.code)).toEqual(['abdominal_pain']);
    const hi = extractSymptoms('bukhar nahi hai, khansi hai');
    expect(hi.negated).toContain('fever');
    expect(hi.affirmed.map((s) => s.code)).toEqual(['cough']);
  });

  it('reads severity from temperatures and pain scales', () => {
    expect(extractSymptoms('fever of 103').affirmed[0]?.severity).toBe('severe');
    expect(extractSymptoms('headache, 8 out of 10').affirmed[0]?.severity).toBe('severe');
    expect(extractSymptoms('halka sir dard').affirmed[0]?.severity).toBe('mild');
  });

  it('recognises animal bites', () => {
    expect(codes('kutte ne kaat liya')).toEqual(['animal_bite']);
  });
});

describe('duration', () => {
  it.each([
    ['do din se bukhar', 48],
    ['for two days', 48],
    ['3 hafte se khansi', 504],
    ['since yesterday', 24],
    ['कल से सिर दर्द', 24],
    ['दो दिन से', 48],
    ['subah se ulti', 6],
    ['for a week', 168],
    ['3-4 days', 96],
  ])('parses "%s" as %d hours', (text, hours) => {
    expect(extractDuration(text)?.hours).toBe(hours);
  });

  it('does not treat age as duration', () => {
    expect(extractDuration('meri 2 saal ki beti')).toBeNull();
  });

  it('keeps short units as duration even with "ki"', () => {
    expect(extractDuration('2 din ki khansi')?.hours).toBe(48);
  });
});

describe('age and subject', () => {
  it.each([
    ['meri 2 saal ki beti ko bukhar hai', 'child'],
    ['my 70 year old father', 'older_adult'],
    ['navjaat shishu ko bukhar', 'infant'],
    ['3 mahine ka baby', 'infant'],
    ['mujhe bukhar hai', 'adult'],
    ['dadi ko chakkar aa rahe hain', 'older_adult'],
    ['I am 34', 'adult'],
  ])('"%s" → %s', (text, group) => {
    expect(extractAge(text).ageGroup).toBe(group);
  });
});

describe('short answers', () => {
  it.each([
    ['haan', 'yes'],
    ['ji haan', 'yes'],
    ['yes', 'yes'],
    ['हाँ', 'yes'],
    ['nahi', 'no'],
    ['no, nothing like that', 'no'],
    ['नहीं', 'no'],
    ['ji nahi', 'no'],
    ['I went to the market yesterday and bought vegetables', null],
  ])('"%s" → %s', (text, expected) => {
    expect(parseYesNo(text)).toBe(expected);
  });

  it('parses severity answers', () => {
    expect(parseSeverityAnswer('bahut tez')).toBe('severe');
    expect(parseSeverityAnswer('mild')).toBe('mild');
    expect(parseSeverityAnswer('मध्यम')).toBe('moderate');
    expect(parseSeverityAnswer('7')).toBe('severe');
  });
});

describe('language detection', () => {
  it.each([
    ['Mujhe do din se bukhar hai', 'hinglish'],
    ['मुझे बुखार है', 'hi'],
    ['I have had a headache since morning', 'en'],
    ['kutte ne kaat liya', 'hinglish'],
    ['Mere papa ko chest pain ho raha hai', 'hinglish'],
  ])('"%s" → %s', (text, lang) => {
    expect(detectLanguage(text).language).toBe(lang);
  });

  it('treats Hindi STT output in Latin script as Hinglish', () => {
    expect(detectLanguage('theek', 'hi').language).toBe('hinglish');
  });

  it('keeps the previous language for ambiguous short replies', () => {
    expect(resolveReplyLanguage('auto', detectLanguage('ok'), 'hi')).toBe('hi');
    expect(resolveReplyLanguage('auto', detectLanguage('मुझे खांसी भी है'), 'en')).toBe('hi');
    expect(resolveReplyLanguage('en', detectLanguage('मुझे खांसी है'), 'hi')).toBe('en');
  });
});

describe('output guard', () => {
  it('accepts safe guidance', () => {
    expect(guardAssistantText('Please see a doctor today. Call 112 if breathing gets hard.', { urgency: 'urgent' }).ok).toBe(true);
  });

  it.each([
    ['As a doctor, I recommend rest.', 'claims_to_be_doctor'],
    ['You have dengue.', 'definitive_diagnosis'],
    ['Take 500 mg twice a day.', 'medication_dosing'],
    ['Start azithromycin tonight.', 'prescribes_medication'],
    ['There is no need to see a doctor.', 'discourages_care'],
    ['Call 1800 999 0000 for help.', 'unverified_phone_number'],
    ['Call 102 now.', 'unverified_phone_number'],
  ])('rejects "%s" (%s)', (text, violation) => {
    const result = guardAssistantText(text, { urgency: 'routine', allowedNumbers: [] });
    expect(result.ok).toBe(false);
    expect(result.violations).toContain(violation);
  });

  it('allows verified facility numbers in any format', () => {
    const r = guardAssistantText('You can call them on 0124 458 8888.', { urgency: 'urgent', allowedNumbers: ['+91 124 458 8888'] });
    expect(r.ok).toBe(true);
  });

  it('does not mistake temperatures or durations for phone numbers', () => {
    expect(guardAssistantText('If the fever goes above 103, or lasts 3 days, see a doctor.', { urgency: 'routine' }).ok).toBe(true);
  });
});
