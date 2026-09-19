import type { EmergencyCategory } from '@sanjeevani/types';
import { describe, expect, it } from 'vitest';
import { assessEmergency, detectFraming, extractAge, extractSymptoms, type EmergencyContext } from '../src';

function assess(text: string, extra: Partial<EmergencyContext> = {}) {
  const { affirmed } = extractSymptoms(text);
  return assessEmergency(text, {
    symptoms: affirmed,
    ageGroup: extractAge(text).ageGroup,
    pregnant: affirmed.some((s) => s.code === 'pregnancy_concern'),
    headInjury: false,
    ...extra,
  });
}

const POSITIVE: [string, EmergencyCategory][] = [
  // English
  ['my father has severe chest pain and is sweating', 'cardiac'],
  ['I think I am having a heart attack', 'cardiac'],
  ['she can’t breathe properly', 'breathing'],
  ['he is not breathing', 'breathing'],
  ['his lips are turning blue', 'breathing'],
  ['her face is drooping and speech is slurred', 'stroke'],
  ['sudden weakness on one side of the body', 'stroke'],
  ['worst headache of my life came on suddenly', 'stroke'],
  ['my grandmother collapsed and is unconscious', 'unconscious'],
  ['we had a road accident', 'major_trauma'],
  ['he fell from the roof', 'major_trauma'],
  ['the cut is bleeding heavily and won’t stop bleeding', 'severe_bleeding'],
  ['my son is having a seizure', 'seizure'],
  ['her throat is closing after eating peanuts', 'anaphylaxis'],
  ['my brother took too many pills', 'poisoning'],
  ['a snake bit my uncle in the field', 'poisoning'],
  ['I want to kill myself', 'self_harm'],
  ['the child got an electric shock', 'severe_burn'],
  ['I am pregnant and my water broke', 'obstetric'],
  ['please call an ambulance', 'user_requested'],
  // Hinglish
  ['papa ko seene mein tez dard ho raha hai', 'cardiac'],
  ['saans nahi aa rahi hai', 'breathing'],
  ['dadi behosh ho gayi hain', 'unconscious'],
  ['mummy ka munh tedha ho gaya aur bolne mein dikkat hai', 'stroke'],
  ['bike se accident ho gaya', 'major_trauma'],
  ['khoon ruk nahi raha', 'severe_bleeding'],
  ['bachche ko jhatke aa rahe hain', 'seizure'],
  ['usne zeher kha liya', 'poisoning'],
  ['saanp ne kaat liya', 'poisoning'],
  ['main marna chahta hoon', 'self_harm'],
  ['khoon ki ulti ho rahi hai', 'severe_bleeding'],
  // Hindi (Devanagari)
  ['पापा के सीने में दर्द हो रहा है', 'cardiac'],
  ['मुझे सांस नहीं आ रही', 'breathing'],
  ['दादी बेहोश हो गई हैं', 'unconscious'],
  ['उसने ज़हर खा लिया है', 'poisoning'],
  ['मेरे बेटे को मिर्गी का दौरा पड़ा', 'seizure'],
  ['मुझे आत्महत्या के विचार आ रहे हैं', 'self_harm'],
];

describe('emergency circuit breaker', () => {
  it.each(POSITIVE)('detects "%s" as %s', (text, category) => {
    const result = assess(text);
    expect(result.emergency).toBe(true);
    expect(result.matches.map((m) => m.category)).toContain(category);
  });

  it.each([
    'I have a mild headache since yesterday',
    'Mujhe do din se bukhar hai aur body pain ho raha hai',
    'no chest pain, just a cough',
    'I don’t want to die, I just can’t sleep well',
    'mere pet mein halka dard hai',
    'मुझे सर्दी और खांसी है',
    'food poisoning se pet kharab hai',
    'where is the nearest hospital?',
    'my knee hurts after running',
  ])('does not trigger for "%s"', (text) => {
    expect(assess(text).emergency).toBe(false);
  });

  it('respects negation in Hinglish and Hindi', () => {
    expect(assess('seene mein dard nahi hai, bas khansi hai').emergency).toBe(false);
    expect(assess('सीने में दर्द नहीं है').emergency).toBe(false);
    expect(assess('he is not unconscious, he is talking').emergency).toBe(false);
    expect(assess('he is not unconscious, he is talking').negatedRuleIds).toContain('unconscious.direct');
  });

  it('fires composite rules from accumulated context', () => {
    const fever = extractSymptoms('I have fever').affirmed;
    const neck = extractSymptoms('and a stiff neck').affirmed;
    const r = assessEmergency('and a stiff neck', { symptoms: [...fever, ...neck], ageGroup: 'adult', pregnant: false, headInjury: false });
    expect(r.primary?.category).toBe('meningitis_signs');
  });

  it('treats any fever in an infant as an emergency', () => {
    const r = assess('my newborn baby has fever');
    expect(r.emergency).toBe(true);
    expect(r.matches.map((m) => m.category)).toContain('infant_danger');
  });

  it('escalates pregnancy with bleeding', () => {
    const r = assess('I am 7 months pregnant and there is some bleeding');
    expect(r.primary?.category).toBe('obstetric');
  });

  it('escalates head injury with vomiting', () => {
    const r = assess('he hit his head and is vomiting');
    expect(r.primary?.category).toBe('major_trauma');
  });

  it('suppresses dismissed composite rules but not re-stated phrases', () => {
    const chest = extractSymptoms('chest pain').affirmed;
    const dismissed = assessEmergency('ok', { symptoms: chest, ageGroup: 'adult', pregnant: false, headInjury: false, dismissedRuleIds: ['cardiac.chest_pain'] });
    expect(dismissed.emergency).toBe(false);
    const restated = assessEmergency('I think it is a heart attack', { symptoms: chest, ageGroup: 'adult', pregnant: false, headInjury: false, dismissedRuleIds: ['cardiac.chest_pain'] });
    expect(restated.emergency).toBe(true);
  });

  it('uses snake-bite specific first aid', () => {
    expect(assess('snake bite on the leg').primary?.instructionSet).toBe('envenomation');
  });

  it('prefers a clinical category over a bare ambulance request', () => {
    expect(assess('call an ambulance, he is not breathing').primary?.category).toBe('breathing');
  });
});

describe('temporal framing', () => {
  /*
   * These are the tests that matter most in this file. The framing detector exists to
   * *suppress* emergencies, so every case here is an attempt to make it suppress one
   * it should not. A failure in this block is a person not being told to call 112.
   */

  it('treats a bare report as happening now', () => {
    expect(detectFraming('I have chest pain')).toBe('present');
    expect(assess('I have chest pain').emergency).toBe(true);
  });

  it('does not mistake past tense for a past event', () => {
    // "had" here describes an illness that is still going on. This is how people speak.
    for (const line of [
      'I had chest pain since this morning',
      'I have had chest pain since yesterday',
      'mujhe subah se seene mein dard ho raha hai',
    ]) {
      expect(detectFraming(line), line).toBe('present');
      expect(assess(line).emergency, line).toBe(true);
    }
  });

  it('lets any present-time marker override a past one', () => {
    const line = 'I had chest pain last year and it is happening again right now';
    expect(detectFraming(line)).toBe('present');
    expect(assess(line).emergency).toBe(true);
  });

  it('recognises an explicitly finished event', () => {
    expect(detectFraming('I had chest pain last year but it was checked and I am fine now')).toBe('past');
    expect(assess('I had chest pain last year but it was checked and I am fine now').emergency).toBe(false);
  });

  it('recognises a hypothetical question', () => {
    for (const line of ['What should I do if someone has chest pain?', 'agar kisi ko seene mein dard ho to kya karun']) {
      expect(detectFraming(line), line).toBe('hypothetical');
      expect(assess(line).emergency, line).toBe(false);
    }
  });

  it('never suppresses an explicit emergency phrase, whatever the framing', () => {
    // Deliberate asymmetry: someone typing these words is overwhelmingly reporting
    // them, and a false alarm here is far cheaper than a miss.
    for (const line of [
      'what if I am having a heart attack',
      'if a snake bites me what do I do',
      'last year I felt like I wanted to die and I feel that way again',
    ]) {
      expect(assess(line).emergency, line).toBe(true);
    }
  });

  it('suppresses only the composite rules, and only on the framed turn', () => {
    // Turn 1 establishes chest pain and fires. A later framed turn cannot unfire it.
    const first = assess('I have chest pain');
    expect(first.emergency).toBe(true);
    const later = assess('my uncle had that last year too', { symptoms: extractSymptoms('I have chest pain').affirmed });
    expect(later.framing).toBe('past');
    // The composite rule is held back on this turn, which is correct — the emergency
    // was already raised and is held in conversation memory.
    expect(later.emergency).toBe(false);
  });

  it('defaults to present when it cannot tell', () => {
    expect(detectFraming('seene mein dard')).toBe('present');
    expect(detectFraming('')).toBe('present');
  });
});
