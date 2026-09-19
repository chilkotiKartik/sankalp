import {
  DISCLAIMER,
  RED_FLAG_SCREENS,
  allSymptoms,
  applyUserInput,
  assessEmergency,
  buildEmergencyPayload,
  buildTriageResult,
  detectLanguage,
  emergencySpeech,
  emptyClinicalState,
  evaluateTriage,
  followUpPrompt,
  parseYesNo,
  planFollowUp,
  resolveReplyLanguage,
  slotKey,
  CARE_ADVICE,
  fill,
  type ClinicalState,
  type FollowUpSlot,
} from '@sanjeevani/medical-safety';
import { Tracer } from './tracer';
import type {
  Degradation,
  EmergencyCategory,
  Language,
  QuickReply,
  RankedFacility,
  TriageResult,
} from '@sanjeevani/types';
import type { LlmProvider } from '../llm/provider';
import { LlmError } from '../llm/provider';
import { detectIntent, type IntentDetail } from '../nlu/intent';
import { buildUnderstandRequest, reconcileUnderstanding, type Understanding } from '../nlu/understand';
import { formatKm, toSpeech } from '../response/format';
import { phraseReply, templateReply, type PhrasingFacts } from '../response/phrasing';
import {
  ADVICE_REPLIES,
  SPOKEN_ACTION,
  STARTER_REPLIES,
  T,
  acknowledgement,
  directionsSentence,
  facilitySentence,
  noteSentences,
} from '../response/templates';
import type { ConversationMemory, EngineResponse, FacilityFinder, TurnInput, TurnOutcome } from './types';

export interface EngineOptions {
  llm: LlmProvider;
  facilities: FacilityFinder;
  aiTimeoutMs: number;
  /** Emergency responses must never wait long on the maps provider. */
  emergencyFacilityTimeoutMs?: number;
  now?: () => number;
}

export function newConversationMemory(): ConversationMemory {
  return {
    language: null,
    phase: 'greeting',
    clinical: emptyClinicalState(),
    lastTriage: null,
    lastFacilities: [],
    lastEmergency: null,
    turnCount: 0,
  };
}

const EMERGENCY_SCREENS = new Set(
  Object.values(RED_FLAG_SCREENS)
    .filter((s) => s.onPositive.urgency === 'emergency')
    .map((s) => s.id),
);

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(onTimeout);
      },
    );
  });
}

/**
 * The conversation pipeline:
 *   language → deterministic extraction → EMERGENCY CIRCUIT BREAKER → intent → (AI understanding)
 *   → follow-up planning → deterministic triage → facility discovery → (AI phrasing + guard) → response
 */
export class ConversationEngine {
  private readonly now: () => number;

  constructor(private readonly options: EngineOptions) {
    this.now = options.now ?? Date.now;
  }

  async handleTurn(previous: ConversationMemory, input: TurnInput): Promise<TurnOutcome> {
    const result = await this.runTurn(previous, input);
    // Timeline persistence works on the full, de-duplicated symptom list.
    result.events.symptoms = allSymptoms(result.memory.clinical);
    return result;
  }

  private async runTurn(previous: ConversationMemory, input: TurnInput): Promise<TurnOutcome> {
    const started = this.now();
    const tracer = new Tracer(this.now);
    const telemetry: TurnOutcome['telemetry'] = {
      trace: [],
      aiUnderstandingUsed: false,
      aiPhrasingUsed: false,
      aiError: null,
      guardViolations: [],
      durationMs: 0,
    };
    const degraded = new Set<Degradation>();

    // 1. Language
    const detection = detectLanguage(input.text, input.sttLanguage);
    let language = resolveReplyLanguage(input.languagePreference, detection, previous.language);
    tracer.end('language', language);

    // 2. Deterministic extraction (also resolves the pending follow-up)
    const pendingBefore = previous.clinical.pendingSlot;
    const outcome = applyUserInput(previous.clinical, input.text);
    let clinical = outcome.state;
    const memory: ConversationMemory = { ...previous, clinical, language, turnCount: previous.turnCount + 1 };
    tracer.end('extraction', `${outcome.newSymptoms.length} new`);

    // 3. Emergency circuit breaker — deterministic, before anything else.
    const assessment = assessEmergency(input.text, {
      symptoms: clinical.symptoms,
      ageGroup: clinical.ageGroup,
      pregnant: clinical.pregnant,
      headInjury: clinical.headInjury,
      dismissedRuleIds: clinical.dismissedEmergencyRules,
    });
    clinical.headInjury = assessment.headInjuryMentioned;

    let emergency: { category: EmergencyCategory; ruleIds: string[]; instructionSet: string } | null = null;
    if (assessment.primary) {
      emergency = {
        category: assessment.primary.category,
        ruleIds: assessment.matches.map((m) => m.ruleId),
        instructionSet: assessment.primary.instructionSet,
      };
    } else if (outcome.screenResult?.answer === 'positive' && EMERGENCY_SCREENS.has(outcome.screenResult.screen)) {
      const decision = evaluateTriage(clinical);
      if (decision.emergencyCategory) {
        emergency = {
          category: decision.emergencyCategory,
          ruleIds: [`screen.${outcome.screenResult.screen}.positive`],
          instructionSet: decision.emergencyCategory,
        };
      }
    }
    tracer.end('emergency_check', emergency ? emergency.category : 'clear');
    if (emergency) {
      return this.emergencyTurn(memory, input, language, emergency, telemetry, tracer, started);
    }

    // 4. Intent
    const answeredPending = Boolean(pendingBefore) && (outcome.screenResult?.answer !== 'unclear' || outcome.newSymptoms.length > 0);
    let intent: IntentDetail = detectIntent(input.text, {
      hasSymptoms: outcome.newSymptoms.length > 0,
      answeredPending,
    });
    // "Shall I show you the directions?" → "haan" / "no thanks"
    if (!pendingBefore && intent === 'unrelated' && previous.phase === 'advice' && outcome.newSymptoms.length === 0) {
      const yn = parseYesNo(input.text);
      if (yn === 'yes') intent = 'directions';
      else if (yn === 'no') intent = 'thanks';
    }

    tracer.end('intent', intent);

    // 5. AI understanding — only when the rules didn't understand the message.
    const needsAi =
      this.options.llm.enriches &&
      ((intent === 'unrelated' && outcome.newSymptoms.length === 0) ||
        (outcome.screenResult?.answer === 'unclear' && !EMERGENCY_SCREENS.has(outcome.screenResult.screen)));
    if (needsAi) {
      const ai = await this.understand(input, clinical, pendingBefore, language, telemetry, degraded);
      if (ai) {
        const known = new Set(allSymptoms(clinical).map((s) => s.code));
        const reconciled = reconcileUnderstanding(ai, known, new Set(clinical.negatedSymptoms));
        clinical = { ...clinical, aiSymptoms: [...clinical.aiSymptoms, ...reconciled.extraSymptoms] };
        if (reconciled.suspectedEmergency && !clinical.screens.ai_emergency_confirm) {
          clinical.suspectedEmergencyCategory = reconciled.suspectedEmergency;
        }
        if (outcome.screenResult?.answer === 'unclear' && ai.answer_to_question && ai.answer_to_question !== 'unclear') {
          const screen = RED_FLAG_SCREENS[outcome.screenResult.screen];
          clinical.screens[screen.id] = ai.answer_to_question === screen.positiveAnswer ? 'positive' : 'negative';
        }
        if (detection.confidence < 0.55 && input.languagePreference === 'auto') language = reconciled.language;
        if (reconciled.extraSymptoms.length > 0 || reconciled.suspectedEmergency) intent = 'symptom_report';
        else if (intent === 'unrelated' && ai.intent !== 'symptom_report') intent = ai.intent;
      }
      memory.language = language;
      tracer.end('ai_understanding', this.options.llm.name);
    } else {
      tracer.skip('ai_understanding', this.options.llm.enriches ? 'not needed' : 'no key');
    }
    memory.clinical = clinical;

    // 6. Non-clinical intents
    switch (intent) {
      case 'reset': {
        const fresh = { ...newConversationMemory(), language, turnCount: memory.turnCount };
        return this.finish(fresh, 'greeting', 'reset', language, T.reset[language], [], 'not_needed', null, STARTER_REPLIES[language], degraded, telemetry, tracer, started);
      }
      case 'greeting':
        if (allSymptoms(clinical).length === 0) {
          return this.finish(memory, 'greeting', 'greeting', language, T.greeting[language], [], 'not_needed', null, STARTER_REPLIES[language], degraded, telemetry, tracer, started);
        }
        break;
      case 'thanks':
        return this.finish(memory, 'closing', 'thanks', language, T.thanks[language], [], 'not_needed', memory.lastTriage, [], degraded, telemetry, tracer, started);
      case 'directions':
        return this.directionsTurn(memory, input, language, degraded, telemetry, tracer, started);
      case 'find_facility':
        return this.facilitySearchTurn(memory, input, language, degraded, telemetry, tracer, started);
      case 'add_symptom': {
        const prompt = followUpPrompt({ kind: 'symptom_detail' }, language);
        memory.clinical = { ...clinical, pendingSlot: { kind: 'symptom_detail' } };
        return this.finish(memory, 'follow_up', 'symptom_report', language, T.addSymptom[language], [], 'not_needed', memory.lastTriage, prompt.quickReplies, degraded, telemetry, tracer, started);
      }
      default:
        break;
    }

    // Unclear screen answer for an emergency-grade question: ask once more, deterministically.
    if (outcome.screenResult?.answer === 'unclear' && EMERGENCY_SCREENS.has(outcome.screenResult.screen)) {
      const retryKey = `retry:${slotKey({ kind: 'red_flag', screen: outcome.screenResult.screen })}`;
      if (!clinical.askedSlots.includes(retryKey)) {
        const slot: FollowUpSlot = { kind: 'red_flag', screen: outcome.screenResult.screen };
        delete clinical.screens[outcome.screenResult.screen];
        clinical.askedSlots.push(retryKey);
        return this.askTurn(memory, slot, language, null, degraded, telemetry, tracer, started);
      }
    }

    // 7. Follow-up questions
    const slot = planFollowUp(clinical);
    tracer.end('follow_up', slot ? slot.kind : 'complete');
    if (slot) {
      const ack = outcome.newSymptoms.length > 0 ? acknowledgement(allSymptoms(clinical), clinical.duration?.hours ?? null, language) : null;
      if (slot.kind === 'symptom_detail') {
        const text = intent === 'unrelated' && previous.turnCount === 0 ? T.greeting[language] : T.noSymptomsYet[language];
        clinical.pendingSlot = slot;
        clinical.askedSlots.push(slotKey(slot));
        return this.finish(memory, 'clarify', intent === 'unrelated' ? 'unrelated' : 'symptom_report', language, text, [], 'not_needed', null, followUpPrompt(slot, language).quickReplies, degraded, telemetry, tracer, started);
      }
      return this.askTurn(memory, slot, language, ack, degraded, telemetry, tracer, started);
    }

    if (allSymptoms(clinical).length === 0) {
      return this.finish(memory, 'clarify', 'unrelated', language, `${T.clarify[language]}`, [], 'not_needed', memory.lastTriage, followUpPrompt({ kind: 'symptom_detail' }, language).quickReplies, degraded, telemetry, tracer, started);
    }

    // 8. Triage and advice
    return this.adviceTurn(
      memory,
      input,
      language,
      intent === 'follow_up_answer' ? 'follow_up_answer' : 'symptom_report',
      outcome.newSymptoms.length > 0 || previous.phase !== 'follow_up',
      degraded,
      telemetry,
      tracer,
      started,
    );
  }

  /** Records that the user dismissed an emergency so composite rules don't re-fire every turn. */
  dismissEmergency(memory: ConversationMemory): ConversationMemory {
    const ruleIds = memory.lastEmergency?.ruleIds ?? [];
    return {
      ...memory,
      phase: 'follow_up',
      lastEmergency: null,
      clinical: {
        ...memory.clinical,
        dismissedEmergencyRules: [...new Set([...memory.clinical.dismissedEmergencyRules, ...ruleIds])],
      },
    };
  }

  private async understand(
    input: TurnInput,
    clinical: ClinicalState,
    pending: FollowUpSlot | null,
    language: Language,
    telemetry: TurnOutcome['telemetry'],
    degraded: Set<Degradation>,
  ): Promise<Understanding | null> {
    const pendingQuestion = pending ? followUpPrompt(pending, language).question : null;
    const fallback: Understanding = {
      intent: 'unrelated',
      language,
      symptoms: [],
      duration_hours: null,
      age_group: 'unknown',
      answer_to_question: null,
      possible_emergency: false,
      emergency_category: null,
    };
    try {
      const result = await this.options.llm.generate(
        buildUnderstandRequest(
          { text: input.text, pendingQuestion, knownSymptoms: allSymptoms(clinical).map((s) => s.code), recentTurns: input.recentTurns },
          fallback,
          this.options.aiTimeoutMs,
        ),
      );
      telemetry.aiUnderstandingUsed = true;
      return result;
    } catch (error) {
      const kind = error instanceof LlmError ? error.kind : 'unavailable';
      telemetry.aiError = kind;
      degraded.add(kind === 'invalid_output' ? 'ai_invalid_output' : 'ai_unavailable');
      return null;
    }
  }

  private async emergencyTurn(
    memory: ConversationMemory,
    input: TurnInput,
    language: Language,
    emergency: { category: EmergencyCategory; ruleIds: string[]; instructionSet: string },
    telemetry: TurnOutcome['telemetry'],
    tracer: Tracer,
    started: number,
  ): Promise<TurnOutcome> {
    const payload = buildEmergencyPayload(emergency.category, emergency.instructionSet, emergency.ruleIds, language);
    const degraded = new Set<Degradation>();
    let facilities: RankedFacility[] = [];
    let status: EngineResponse['facilitiesStatus'] = 'needs_location';
    if (input.location && emergency.category !== 'self_harm') {
      const result = await withTimeout(
        this.options.facilities.find({
          location: input.location,
          facilityType: 'emergency_department',
          specialty: memory.clinical.pregnant ? 'obstetrics_gynecology' : 'emergency_medicine',
          urgency: 'emergency',
          language,
          limit: 3,
        }),
        this.options.emergencyFacilityTimeoutMs ?? 3000,
        { facilities: [], status: 'unavailable' as const },
      );
      facilities = result.facilities;
      status = result.status;
      if (status === 'unavailable') degraded.add('maps_unavailable');
      tracer.end('facilities', status === 'ok' ? `${facilities.length} ranked` : status);
    } else if (emergency.category === 'self_harm') {
      status = 'not_needed';
      tracer.skip('facilities', 'helpline first');
    } else {
      tracer.skip('facilities', 'no location');
    }

    const decision = evaluateTriage(memory.clinical);
    const triage: TriageResult = {
      ...buildTriageResult({ ...decision, urgency: 'emergency', facilityType: 'emergency_department', specialty: 'emergency_medicine' }, memory.clinical, language, [], 'rules'),
      emergency: true,
      emergencyCategory: emergency.category,
      careAdvice: [],
    };

    const display = [payload.headline + '.', ...payload.instructions].join(' ');
    const speech = toSpeech(emergencySpeech(emergency.category, emergency.instructionSet, language), language);
    const next: ConversationMemory = {
      ...memory,
      phase: 'emergency',
      lastTriage: triage,
      lastFacilities: facilities.length ? facilities : memory.lastFacilities,
      lastEmergency: { category: emergency.category, ruleIds: emergency.ruleIds },
      clinical: { ...memory.clinical, pendingSlot: null },
    };
    // The emergency path skips generation entirely, and the trace shows that.
    tracer.skip('triage', 'fixed instructions');
    tracer.skip('phrasing', 'fixed instructions');
    tracer.skip('output_guard', 'nothing generated');
    telemetry.durationMs = this.now() - started;
    telemetry.trace = tracer.snapshot();
    return {
      response: {
        phase: 'emergency',
        intent: 'symptom_report',
        language,
        reply: { display, speech },
        triage,
        emergency: payload,
        facilities,
        facilitiesStatus: status,
        quickReplies: [],
        degraded: [...degraded],
        disclaimer: DISCLAIMER.short[language],
        trace: telemetry.trace,
        totalMs: telemetry.durationMs,
      },
      memory: next,
      events: {
        emergency: { category: emergency.category, ruleIds: emergency.ruleIds },
        symptoms: [],
        triage,
      },
      telemetry,
    };
  }

  private askTurn(
    memory: ConversationMemory,
    slot: FollowUpSlot,
    language: Language,
    ack: string | null,
    degraded: Set<Degradation>,
    telemetry: TurnOutcome['telemetry'],
    tracer: Tracer,
    started: number,
  ): TurnOutcome {
    const prompt = followUpPrompt(slot, language);
    const clinical = memory.clinical;
    clinical.pendingSlot = slot;
    const key = slotKey(slot);
    if (!clinical.askedSlots.includes(key)) {
      clinical.askedSlots.push(key);
      if (slot.kind !== 'symptom_detail' && !(slot.kind === 'red_flag' && slot.screen === 'ai_emergency_confirm')) {
        clinical.followUpsAsked += 1;
      }
    }
    const text = [ack, prompt.question].filter(Boolean).join(' ');
    return this.finish(memory, 'follow_up', 'symptom_report', language, text, [], 'not_needed', null, prompt.quickReplies, degraded, telemetry, tracer, started);
  }

  private async adviceTurn(
    memory: ConversationMemory,
    input: TurnInput,
    language: Language,
    intent: 'symptom_report' | 'follow_up_answer',
    includeAcknowledgement: boolean,
    degraded: Set<Degradation>,
    telemetry: TurnOutcome['telemetry'],
    tracer: Tracer,
    started: number,
  ): Promise<TurnOutcome> {
    const clinical = memory.clinical;
    const decision = evaluateTriage(clinical);
    const triage = buildTriageResult(decision, clinical, language, [], 'rules');
    tracer.end('triage', decision.urgency);

    let facilities: RankedFacility[] = [];
    let status: EngineResponse['facilitiesStatus'] = 'needs_location';
    if (input.location) {
      const result = await this.options.facilities.find({
        location: input.location,
        facilityType: decision.facilityType,
        specialty: decision.specialty,
        urgency: decision.urgency,
        language,
        limit: 5,
      });
      facilities = result.facilities;
      status = result.status;
      if (status === 'unavailable') degraded.add('maps_unavailable');
      if (facilities.some((f) => f.travel.estimated)) degraded.add('routing_estimated');
      tracer.end('facilities', status === 'ok' ? `${facilities.length} ranked` : status);
    } else {
      tracer.skip('facilities', 'no location');
    }

    const top = facilities[0];
    const facts: PhrasingFacts = {
      language,
      urgency: decision.urgency,
      acknowledgement: includeAcknowledgement ? acknowledgement(allSymptoms(clinical), clinical.duration?.hours ?? null, language) : '',
      contextNote: noteSentences(decision.notes, language)[0] ?? null,
      recommendedAction:
        decision.urgency === 'emergency' || decision.leadSymptom === 'animal_bite'
          ? triage.recommendedAction
          : SPOKEN_ACTION[decision.urgency][language],
      careTips: decision.care.slice(0, 1).map((k) => CARE_ADVICE[k][language]),
      facility: facilitySentence(top, status, decision.urgency, language),
      closingQuestion: top ? T.offerDirections[language] : null,
    };
    const allowedNumbers = facilities.flatMap((f) => [f.phone, f.emergencyPhone]).filter((n): n is string => Boolean(n));
    const phrased = await phraseReply(this.options.llm, facts, {
      facilityName: top?.name ?? null,
      allowedNumbers,
      timeoutMs: this.options.aiTimeoutMs,
    });
    telemetry.aiPhrasingUsed = phrased.source === 'ai';
    tracer.end('phrasing', phrased.source === 'ai' ? this.options.llm.name : 'template');
    if (phrased.error) {
      telemetry.aiError = phrased.error;
      degraded.add(phrased.error === 'invalid_output' ? 'ai_invalid_output' : 'ai_unavailable');
    }
    if (phrased.violations.length) {
      telemetry.guardViolations = phrased.violations;
      degraded.add('ai_invalid_output');
    }
    // The guard always runs on generated text; on a template there is nothing to check.
    if (phrased.source === 'ai') tracer.end('output_guard', phrased.violations.length ? 'rejected' : 'passed');
    else tracer.skip('output_guard', 'template');

    memory.lastTriage = triage;
    if (facilities.length) memory.lastFacilities = facilities;
    memory.clinical = { ...clinical, pendingSlot: null };
    return this.finish(memory, 'advice', intent, language, phrased.text, facilities, status, triage, ADVICE_REPLIES[language], degraded, telemetry, tracer, started, {
      triageEvent: triage,
    });
  }

  private async facilitySearchTurn(
    memory: ConversationMemory,
    input: TurnInput,
    language: Language,
    degraded: Set<Degradation>,
    telemetry: TurnOutcome['telemetry'],
    tracer: Tracer,
    started: number,
  ): Promise<TurnOutcome> {
    if (!input.location) {
      return this.finish(memory, 'facility_search', 'find_facility', language, T.needLocation[language], [], 'needs_location', memory.lastTriage, [], degraded, telemetry, tracer, started);
    }
    const triage = memory.lastTriage;
    const result = await this.options.facilities.find({
      location: input.location,
      facilityType: triage?.requiredFacilityType === 'clinic' ? 'hospital' : (triage?.requiredFacilityType ?? 'hospital'),
      specialty: triage?.specialty ?? 'general_medicine',
      urgency: triage?.urgency ?? 'routine',
      language,
      limit: 6,
    });
    if (result.status === 'unavailable') degraded.add('maps_unavailable');
    if (result.facilities.some((f) => f.travel.estimated)) degraded.add('routing_estimated');
    const top = result.facilities[0];
 const text = top
      ? fill(T.facilityList[language], { name: top.name, km: formatKm(top.travel.distanceMeters) })
      : (facilitySentence(undefined, result.status, 'routine', language) ?? T.noneFound[language]);
    if (result.facilities.length) memory.lastFacilities = result.facilities;
    return this.finish(memory, 'facility_search', 'find_facility', language, text, result.facilities, result.status, triage, top ? ADVICE_REPLIES[language].slice(0, 1) : [], degraded, telemetry, tracer, started);
  }

  private async directionsTurn(
    memory: ConversationMemory,
    input: TurnInput,
    language: Language,
    degraded: Set<Degradation>,
    telemetry: TurnOutcome['telemetry'],
    tracer: Tracer,
    started: number,
  ): Promise<TurnOutcome> {
    let facilities = memory.lastFacilities;
    if (facilities.length === 0 && input.location) {
      return this.facilitySearchTurn(memory, input, language, degraded, telemetry, tracer, started);
    }
    const top = facilities[0];
    if (!top) {
      const status = input.location ? 'none_found' : 'needs_location';
      return this.finish(memory, 'facility_search', 'directions', language, input.location ? T.directionsNoFacility[language] : T.needLocation[language], [], status, memory.lastTriage, [], degraded, telemetry, tracer, started);
    }
    facilities = [top, ...facilities.slice(1)];
    return this.finish(memory, 'facility_search', 'directions', language, directionsSentence(top, language), facilities, 'ok', memory.lastTriage, [], degraded, telemetry, tracer, started);
  }

  private finish(
    memory: ConversationMemory,
    phase: EngineResponse['phase'],
    intent: EngineResponse['intent'],
    language: Language,
    text: string,
    facilities: RankedFacility[],
    facilitiesStatus: EngineResponse['facilitiesStatus'],
    triage: TriageResult | null,
    quickReplies: QuickReply[],
    degraded: Set<Degradation>,
    telemetry: TurnOutcome['telemetry'],
    tracer: Tracer,
    started: number,
    extra: { triageEvent?: TriageResult } = {},
  ): TurnOutcome {
    const next: ConversationMemory = { ...memory, phase, language };
    telemetry.durationMs = this.now() - started;
    telemetry.trace = tracer.snapshot();
    return {
      response: {
        phase,
        intent,
        language,
        reply: { display: text, speech: toSpeech(text, language) },
        triage,
        emergency: null,
        facilities,
        facilitiesStatus,
        quickReplies,
        degraded: [...degraded],
        disclaimer: DISCLAIMER.short[language],
        trace: telemetry.trace,
        totalMs: telemetry.durationMs,
      },
      memory: next,
      events: { emergency: null, symptoms: [], triage: extra.triageEvent ?? null },
      telemetry,
    };
  }
}

export { templateReply };
