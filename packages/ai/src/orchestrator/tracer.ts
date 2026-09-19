import type { TraceStage } from '@sanjeevani/types';

type Stage = TraceStage['stage'];

/**
 * Records which pipeline stages ran on a turn, and how long each took.
 *
 * The point is verifiability: the product claims the emergency check runs before
 * any generation, and this is what lets someone confirm it rather than take our
 * word for it. Because the trace is shown to users, it is restricted by
 * construction to stage names, booleans, millisecond counts and a short label
 * chosen from a fixed vocabulary — a symptom name can never end up in here.
 */
export class Tracer {
  private readonly stages: TraceStage[] = [];
  private mark: number;

  constructor(private readonly now: () => number) {
    this.mark = now();
  }

  /** Closes a stage that ran, with an optional short non-clinical label. */
  end(stage: Stage, detail: string | null = null): void {
    const at = this.now();
    this.stages.push({ stage, ran: true, ms: Math.max(0, at - this.mark), detail: clamp(detail) });
    this.mark = at;
  }

  /** Records a stage that was not needed, so its absence is visible rather than silent. */
  skip(stage: Stage, detail: string | null = null): void {
    this.stages.push({ stage, ran: false, ms: 0, detail: clamp(detail) });
    this.mark = this.now();
  }

  /**
   * The full pipeline in canonical order. Stages that never ran on this turn are
   * included as `ran: false` rather than omitted, so the panel always shows the
   * same list and a missing stage is visible as skipped instead of absent.
   */
  snapshot(): TraceStage[] {
    const recorded = new Map<Stage, TraceStage>();
    for (const entry of this.stages) {
      if (!recorded.has(entry.stage)) recorded.set(entry.stage, entry);
    }
    return ORDER.map(
      (stage) => recorded.get(stage) ?? { stage, ran: false, ms: 0, detail: NOT_REACHED[stage] },
    );
  }
}

/** The pipeline, in the order it executes. */
const ORDER: Stage[] = [
  'language',
  'extraction',
  'emergency_check',
  'intent',
  'ai_understanding',
  'follow_up',
  'triage',
  'facilities',
  'phrasing',
  'output_guard',
];

/** Why a stage is absent, when the turn ended before reaching it. */
const NOT_REACHED: Record<Stage, string> = {
  language: 'not reached',
  extraction: 'not reached',
  emergency_check: 'not reached',
  intent: 'not reached',
  ai_understanding: 'not needed',
  follow_up: 'not reached',
  triage: 'more info needed',
  facilities: 'not needed',
  phrasing: 'template',
  output_guard: 'nothing generated',
};

/** Labels are short and fixed-vocabulary; this is the backstop, not the policy. */
function clamp(detail: string | null): string | null {
  if (!detail) return null;
  const trimmed = detail.trim().slice(0, 40);
  return trimmed.length > 0 ? trimmed : null;
}
