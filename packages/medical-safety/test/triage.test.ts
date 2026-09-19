import { urgencyRank } from '@sanjeevani/types';
import { describe, expect, it } from 'vitest';
import {
  applyUserInput,
  buildTriageResult,
  emptyClinicalState,
  evaluateTriage,
  followUpPrompt,
  planFollowUp,
  slotKey,
  type ClinicalState,
} from '../src';

/** Runs a scripted conversation through the deterministic planner. */
function converse(lines: string[]): ClinicalState {
  let state = emptyClinicalState();
  for (const line of lines) {
    state = applyUserInput(state, line).state;
    const slot = planFollowUp(state);
    if (slot) {
      state.pendingSlot = slot;
      state.askedSlots.push(slotKey(slot));
      state.followUpsAsked++;
    }
  }
  return state;
}

function triage(lines: string[]) {
  return evaluateTriage(converse(lines));
}

describe('triage rules', () => {
  it('routes the flagship fever example to same-day care', () => {
    const d = triage(['Mujhe do din se bahut tez bukhar hai aur body pain ho raha hai.', 'nahi']);
    expect(d.urgency).toBe('urgent');
    expect(d.specialty).toBe('general_medicine');
    expect(d.facilityType).toBe('hospital');
    expect(d.notes).toContain('viral_pattern');
    expect(d.care).toContain('rest_fluids');
  });

  it('keeps a mild cold as home care', () => {
    const d = triage(['I have a runny nose and mild sore throat since yesterday', 'no']);
    expect(d.urgency).toBe('self_care');
    expect(d.facilityType).toBe('clinic');
  });

  it('escalates fever lasting 3+ days', () => {
    expect(triage(['fever for 4 days', 'no', 'myself']).urgency).toBe('urgent');
  });

  it('escalates fever with rash (dengue season caution) without naming a disease', () => {
    const d = triage(['I have fever and red spots on skin since 2 days']);
    expect(d.urgency).toBe('urgent');
    expect(d.rationale).toContain('combo.fever_rash');
  });

  it('flags a cough longer than two weeks', () => {
    const d = triage(['khansi hai 3 hafte se', 'nahi', 'mere liye']);
    expect(d.urgency).toBe('routine');
    expect(d.notes).toContain('long_cough');
  });

  it('sends children to paediatrics', () => {
    const ok = triage(['meri 5 saal ki beti ko ulti aur dast hai', 'haan']);
    expect(ok.specialty).toBe('pediatrics');
    expect(ok.urgency).toBe('routine');
    // "Can she keep water down?" → "no" is the danger answer.
    const dehydrating = triage(['meri 5 saal ki beti ko ulti aur dast hai', 'nahi']);
    expect(dehydrating.urgency).toBe('urgent');
  });

  it('treats a dog bite as same-day and time-sensitive', () => {
    const d = triage(['kutte ne kaat liya']);
    expect(d.urgency).toBe('urgent');
    expect(d.care).toContain('bite_wash');
    expect(d.notes).toContain('bite_time_sensitive');
  });

  it('routes mental-health concerns with Tele-MANAS guidance', () => {
    const d = triage(['I have been feeling very low and hopeless for weeks', 'no']);
    expect(d.specialty).toBe('psychiatry');
    expect(d.care).toContain('mental_support');
  });

  it('a positive danger-sign answer can escalate to emergency deterministically', () => {
    const state = converse(['I have a bad headache', 'yes']);
    const d = evaluateTriage(state);
    expect(d.urgency).toBe('emergency');
    expect(d.emergencyCategory).toBe('stroke');
  });

  it('never lets AI-only symptoms create an emergency', () => {
    const state = emptyClinicalState();
    state.aiSymptoms = [{ code: 'chest_pain', severity: 'severe' }];
    const d = evaluateTriage(state);
    expect(d.urgency).toBe('urgent');
    expect(d.rationale).toContain('ai.capped:chest_pain');
  });

  it('never lowers urgency below the rule baseline', () => {
    const state = converse(['I am short of breath']);
    expect(evaluateTriage(state).urgency).toBe('urgent');
  });

  it('localises the triage result', () => {
    const state = converse(['मुझे दो दिन से बुखार है', 'नहीं']);
    const result = buildTriageResult(evaluateTriage(state), state, 'hi', [], 'rules');
    expect(result.recommendedAction).toMatch(/डॉक्टर|ओपीडी/);
    expect(result.careAdvice.length).toBeGreaterThan(0);
    expect(result.symptoms.map((s) => s.code)).toContain('fever');
  });
});

describe('follow-up planner', () => {
  it('asks a danger-sign question first', () => {
    const state = applyUserInput(emptyClinicalState(), 'I have fever').state;
    expect(planFollowUp(state)).toEqual({ kind: 'red_flag', screen: 'fever_danger' });
  });

  it('asks duration next, then age for non-self reports', () => {
    let state = applyUserInput(emptyClinicalState(), 'papa ko bukhar hai').state;
    state.askedSlots.push('red_flag:fever_danger');
    state.screens.fever_danger = 'negative';
    expect(planFollowUp(state)).toEqual({ kind: 'duration' });
    state = applyUserInput({ ...state, pendingSlot: { kind: 'duration' }, askedSlots: [...state.askedSlots, 'duration'] }, '2 din se').state;
    expect(state.duration?.hours).toBe(48);
    expect(planFollowUp(state)).toEqual({ kind: 'age_group' });
  });

  it('skips duration for acute events', () => {
    const state = applyUserInput(emptyClinicalState(), 'I burned my hand').state;
    state.screens.burn_size = 'negative';
    expect(planFollowUp(state)?.kind).not.toBe('duration');
  });

  it('stops after the follow-up budget', () => {
    const state = applyUserInput(emptyClinicalState(), 'I have fever').state;
    state.followUpsAsked = 3;
    expect(planFollowUp(state)).toBeNull();
  });

  it('asks for symptoms when nothing was understood, only once', () => {
    const state = applyUserInput(emptyClinicalState(), 'hello there').state;
    expect(planFollowUp(state)).toEqual({ kind: 'symptom_detail' });
    state.askedSlots.push('symptom_detail');
    expect(planFollowUp(state)).toBeNull();
  });

  it('confirms AI-suspected emergencies before anything else', () => {
    const state = emptyClinicalState();
    state.suspectedEmergencyCategory = 'cardiac';
    expect(planFollowUp(state)).toEqual({ kind: 'red_flag', screen: 'ai_emergency_confirm' });
  });

  it('parses bare numbers as days for a pending duration question', () => {
    const state = applyUserInput({ ...emptyClinicalState(), pendingSlot: { kind: 'duration' } }, '3').state;
    expect(state.duration?.hours).toBe(72);
  });

  it('gives localised questions with matching quick replies', () => {
    const p = followUpPrompt({ kind: 'red_flag', screen: 'fever_danger' }, 'hinglish');
    expect(p.question).toMatch(/saans/);
    expect(p.quickReplies.map((q) => q.value)).toEqual(['haan', 'nahi']);
  });
});

describe('ruled-out screens on the care card', () => {
  it('lists the red flags that were asked and answered no, and nothing else', () => {
    // `converse` asks the planned follow-up, so "no" resolves the red-flag screen.
    const state = converse(['I have had a high fever for two days', 'no']);

    const result = buildTriageResult(evaluateTriage(state), state, 'en', [], 'rules');
    expect(result.ruledOut).toContain('fever_danger');
    // A screen that was never asked is not claimed as excluded.
    expect(result.ruledOut).not.toContain('respiratory');
  });

  it('is empty when nothing has been ruled out yet', () => {
    const state = converse(['I have a headache']);
    expect(buildTriageResult(evaluateTriage(state), state, 'en', [], 'rules').ruledOut).toEqual([]);
  });

  it('does not list a screen answered yes as ruled out', () => {
    const state = converse(['I have had a high fever for two days', 'yes']);
    const result = buildTriageResult(evaluateTriage(state), state, 'en', [], 'rules');
    expect(state.screens.fever_danger).toBe('positive');
    expect(result.ruledOut).not.toContain('fever_danger');
  });
});

describe('worsening between check-ins', () => {
  it('raises the severity of known symptoms when the person says it is worse', () => {
    const before = converse(['I have had a headache for two days']);
    expect(before.symptoms.find((s) => s.code === 'headache')?.severity).toBe('unknown');

    const after = applyUserInput(before, 'I want to check again. Compared to before, I am worse.').state;
    expect(after.progression).toBe('worse');
    expect(after.symptoms.find((s) => s.code === 'headache')?.severity).toBe('moderate');

    // A second "worse" takes it one more step, and no further.
    const again = applyUserInput(after, 'it is getting worse').state;
    expect(again.symptoms.find((s) => s.code === 'headache')?.severity).toBe('severe');
    const third = applyUserInput(again, 'worse again').state;
    expect(third.symptoms.find((s) => s.code === 'headache')?.severity).toBe('severe');
  });

  it('recognises worsening in Hindi and Hinglish', () => {
    for (const line of ['पहले से ज़्यादा है', 'pehle se zyada hai', 'bigad gaya hai']) {
      const state = applyUserInput(converse(['mujhe sar dard hai']), line).state;
      expect(state.progression, line).toBe('worse');
    }
  });

  it('never lowers severity when the person says they are better', () => {
    let state = converse(['I have a severe headache']);
    expect(state.symptoms.find((s) => s.code === 'headache')?.severity).toBe('severe');
    state = applyUserInput(state, 'I am better now').state;
    expect(state.progression).toBe('better');
    // Feeling better is not evidence a danger sign resolved, so nothing is relaxed.
    expect(state.symptoms.find((s) => s.code === 'headache')?.severity).toBe('severe');
  });

  it('does not override a severity stated in the same sentence', () => {
    const before = converse(['I have a headache']);
    const after = applyUserInput(before, 'it is worse — now a mild headache').state;
    expect(after.symptoms.find((s) => s.code === 'headache')?.severity).toBe('mild');
  });

  it('can push a worsening symptom set to a higher urgency', () => {
    const before = converse(['I have had a stomach ache for two days', 'no']);
    const beforeUrgency = evaluateTriage(before).urgency;
    const after = applyUserInput(before, 'it is much worse than before').state;
    const afterUrgency = evaluateTriage(after).urgency;
    expect(urgencyRank(afterUrgency)).toBeGreaterThanOrEqual(urgencyRank(beforeUrgency));
  });
});
