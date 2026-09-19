import { compileAll, hasAffirmed, prepareText } from './matcher';

export type Framing = 'present' | 'past' | 'hypothetical';

/**
 * Is this utterance about something happening now, something that happened and ended,
 * or something imagined?
 *
 * ## Why this is deliberately timid
 *
 * The only thing this is used for is *suppressing* an emergency, which makes a wrong
 * answer here the most dangerous kind of wrong in the whole system. So it is built to
 * fail towards `present`:
 *
 * - Past tense alone is never enough. "I **had** chest pain since this morning" is a
 *   present illness described in the past tense, and that is how people talk. Only an
 *   explicit *past time expression* — "last year", "two months ago" — counts.
 * - Any present-time marker vetoes the whole thing. "I had a heart attack last year and
 *   it is happening again right now" stays `present`.
 * - What it returns is only ever applied to the composite rules that fire on generic
 *   extracted symptoms. Explicit emergency phrases are never suppressed, because
 *   someone typing "snake bite" is overwhelmingly reporting one.
 */

/** Explicit past-time expressions. Not verb tense — these name a finished time. */
const PAST_MARKERS = compileAll(
  [
    'last year', 'last month', 'last week', 'years ago', 'year ago', 'months ago', 'month ago', 'weeks ago',
    'long ago', 'a while back', 'back then', 'used to', 'in the past', 'previously', 'history of',
    'when i was', 'when he was', 'when she was', 'got better', 'was checked', 'already treated', 'recovered from',
    'pichle saal', 'pichhle saal', 'pichle mahine', 'kai saal pehle', 'saal pehle', 'mahine pehle', 'pehle hua tha',
    'theek ho gaya tha', 'ilaaj ho gaya',
    'पिछले साल', 'पिछले महीने', 'साल पहले', 'महीने पहले', 'ठीक हो गया था', 'पहले हुआ था',
  ],
  1,
);

/** Conditional and imagined framings. */
const HYPOTHETICAL_MARKERS = compileAll(
  [
    'what should i do if', 'what to do if', 'what if', 'what happens if', 'in case of', 'in case someone',
    'suppose', 'supposing', 'hypothetically', 'if someone has', 'if someone gets', 'if a person has',
    'how do i know if', 'how to tell if', 'just asking', 'just curious',
    'agar kisi ko', 'agar mujhe', 'kya karun agar', 'agar aisa ho', 'maan lijiye',
    'अगर किसी को', 'क्या करूं अगर', 'मान लीजिए',
  ],
  1,
);

/** Anything asserting that it is happening now. Any of these forces `present`. */
const PRESENT_MARKERS = compileAll(
  [
    'right now', 'just now', 'at the moment', 'currently', 'is happening', 'happening again', 'started today',
    'since morning', 'since yesterday', 'since last night', 'today', 'tonight', 'this morning', 'from morning',
    'is going on', 'going on now', 'again now', 'still',
    'abhi', 'abhi abhi', 'aaj se', 'aaj subah se', 'kal se', 'raat se', 'ho raha hai', 'ho rahi hai', 'chal raha hai',
    'अभी', 'आज', 'आज सुबह से', 'कल से', 'हो रहा है', 'हो रही है',
  ],
  1,
);

/**
 * Classifies the framing of an utterance. Returns `present` whenever there is any
 * doubt — including when both a past and a present marker appear.
 */
export function detectFraming(text: string): Framing {
  const prepared = prepareText(text);

  // A present-time assertion settles it, whatever else is in the sentence.
  if (hasAffirmed(prepared, PRESENT_MARKERS)) return 'present';
  if (hasAffirmed(prepared, HYPOTHETICAL_MARKERS)) return 'hypothetical';
  if (hasAffirmed(prepared, PAST_MARKERS)) return 'past';
  return 'present';
}
