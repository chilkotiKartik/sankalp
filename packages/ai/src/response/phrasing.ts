import { guardAssistantText, type GuardViolation } from '@sanjeevani/medical-safety';
import type { Language, Urgency } from '@sanjeevani/types';
import { z } from 'zod';
import { LlmError, type LlmProvider, type StructuredRequest } from '../llm/provider';
import { toSpeech } from './format';

export const phrasingSchema = z.object({
  reply: z.string().min(1).max(700).describe('What Sanjeevani says. 2–5 short, warm sentences. No lists, no markdown.'),
});
export type Phrasing = z.infer<typeof phrasingSchema>;

const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'simple Indian English',
  hi: 'simple Hindi written in Devanagari',
  hinglish: 'natural Hinglish written in Roman script (Hindi with common English words)',
};

const SYSTEM = `You are the voice of Sanjeevani, a calm, warm medical navigation assistant for people in India, many of them elderly or with limited literacy.
You will receive verified facts from a clinical rules engine. Rewrite them as one short spoken reply.
Hard rules:
- Use ONLY the facts given. Do not add medical advice, medicines, doses, tests, diagnoses or phone numbers.
- Never say or imply you are a doctor. Never say "you have <disease>".
- Keep the recommended action and its urgency exactly as given (e.g. "today" stays "today").
- If a facility is given, mention its name and distance exactly as given.
- If a follow-up question is given, end with that question.
- Speak like a caring person: short sentences, no lists, no markdown, no emojis. Maximum 5 sentences.`;

export interface PhrasingFacts {
  language: Language;
  urgency: Urgency;
  acknowledgement: string;
  contextNote: string | null;
  recommendedAction: string;
  careTips: string[];
  facility: string | null;
  closingQuestion: string | null;
}

export interface PhrasingResult {
  text: string;
  source: 'ai' | 'template';
  violations: GuardViolation[];
  error?: LlmError['kind'];
}

export function templateReply(facts: PhrasingFacts): string {
  return [facts.acknowledgement, facts.contextNote, facts.recommendedAction, ...facts.careTips.slice(0, 1), facts.facility, facts.closingQuestion]
    .filter((s): s is string => Boolean(s))
    .join(' ');
}

const URGENCY_MARKERS: Partial<Record<Urgency, RegExp>> = {
  urgent: /today|आज|aaj/i,
};

function mandatoryContentPresent(text: string, facts: PhrasingFacts, facilityName: string | null): boolean {
  const marker = URGENCY_MARKERS[facts.urgency];
  if (marker && !marker.test(text)) return false;
  if (facilityName && !text.includes(facilityName)) return false;
  return true;
}

export async function phraseReply(
  llm: LlmProvider,
  facts: PhrasingFacts,
  options: { facilityName: string | null; allowedNumbers: string[]; timeoutMs: number },
): Promise<PhrasingResult> {
  const fallback = templateReply(facts);
  if (!llm.enriches) return { text: fallback, source: 'template', violations: [] };

  const request: StructuredRequest<Phrasing> = {
    task: 'phrase',
    system: SYSTEM,
    prompt: `Reply language: ${LANGUAGE_NAMES[facts.language]}.\nVerified facts (JSON):\n${JSON.stringify(facts, null, 2)}`,
    schema: phrasingSchema,
    description: 'Submit the spoken reply.',
    fallback: { reply: fallback },
    maxTokens: 400,
    timeoutMs: options.timeoutMs,
  };

  try {
    const { reply } = await llm.generate(request);
    const guard = guardAssistantText(reply, { urgency: facts.urgency, allowedNumbers: options.allowedNumbers });
    if (!guard.ok || !mandatoryContentPresent(reply, facts, options.facilityName)) {
      return { text: fallback, source: 'template', violations: guard.ok ? ['empty'] : guard.violations };
    }
    return { text: reply.trim(), source: 'ai', violations: [] };
  } catch (error) {
    const kind = error instanceof LlmError ? error.kind : 'unavailable';
    return { text: fallback, source: 'template', violations: [], error: kind };
  }
}

export function speechFor(text: string, language: Language): string {
  return toSpeech(text, language);
}
