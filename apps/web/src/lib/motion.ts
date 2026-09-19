/**
 * The motion system.
 *
 * Three ideas hold it together:
 *
 *  1. **Springs, not durations.** Physical motion reads as responsive because it
 *     carries momentum. Durations are used only for opacity and colour, where
 *     there is nothing physical to model.
 *  2. **One family of curves.** Every transition here comes from four springs, so
 *     unrelated parts of the app feel like they share a body.
 *  3. **Reduced motion is a real mode, not an off switch.** Things still change
 *     state and still fade; they simply stop travelling. Nothing is ever hidden
 *     from someone who has asked for calm.
 *
 * Every export takes `reduce` and returns a spec that is already correct for it,
 * so a component can never forget to honour the preference.
 */
import type { Transition, Variants } from 'motion/react';

/** Crisp and quick — buttons, chips, small state flips. */
export const SNAP: Transition = { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 };
/** The default for anything that travels — cards, list items, sections. */
export const GLIDE: Transition = { type: 'spring', stiffness: 260, damping: 28, mass: 0.9 };
/** Heavier, for full surfaces: sheets, takeovers, page bodies. */
export const SURFACE: Transition = { type: 'spring', stiffness: 210, damping: 30, mass: 1.1 };
/** A touch of overshoot, used sparingly where arrival should feel like good news. */
export const POP: Transition = { type: 'spring', stiffness: 420, damping: 18, mass: 0.6 };

/** Opacity- and colour-only transitions, where a spring has nothing to model. */
export const FADE: Transition = { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] };
export const FADE_SLOW: Transition = { duration: 0.42, ease: [0.2, 0.8, 0.2, 1] };

/** Reduced motion keeps the fade and drops the travel. */
export const calm = (reduce: boolean, transition: Transition): Transition => (reduce ? FADE : transition);

/** Rises into place. Used for cards, banners and anything that "arrives". */
export const rise = (reduce: boolean, distance = 12): Variants => ({
  hidden: { opacity: 0, y: reduce ? 0 : distance },
  shown: { opacity: 1, y: 0, transition: calm(reduce, GLIDE) },
  exit: { opacity: 0, y: reduce ? 0 : -6, transition: FADE },
});

/** Settles in place with a small scale change. For things that appear where they are. */
export const settle = (reduce: boolean): Variants => ({
  hidden: { opacity: 0, scale: reduce ? 1 : 0.97 },
  shown: { opacity: 1, scale: 1, transition: calm(reduce, GLIDE) },
  exit: { opacity: 0, scale: reduce ? 1 : 0.99, transition: FADE },
});

/**
 * Staggered container. Children reveal in sequence so a list reads as an order of
 * importance rather than a block that flashed in. The stagger collapses under
 * reduced motion — everything still appears, just together.
 */
export const stagger = (reduce: boolean, step = 0.055, delay = 0.02): Variants => ({
  hidden: {},
  shown: { transition: { staggerChildren: reduce ? 0 : step, delayChildren: reduce ? 0 : delay } },
  exit: {},
});

/** Page body transition. Content slides a little along the reading direction. */
export const page = (reduce: boolean): Variants => ({
  hidden: { opacity: 0, y: reduce ? 0 : 10 },
  shown: { opacity: 1, y: 0, transition: calm(reduce, SURFACE) },
  exit: { opacity: 0, transition: { duration: 0.14 } },
});

/** Bottom sheet. Travels the full way up so the gesture is legible. */
export const sheet = (reduce: boolean): Variants => ({
  hidden: { opacity: reduce ? 0 : 1, y: reduce ? 0 : '100%' },
  shown: { opacity: 1, y: 0, transition: calm(reduce, SURFACE) },
  exit: { opacity: reduce ? 0 : 1, y: reduce ? 0 : '100%', transition: reduce ? FADE : { ...SURFACE, damping: 34 } },
});

/**
 * The emergency takeover. It scales *down* into place from slightly larger, which
 * reads as the screen coming toward you rather than sliding politely in. It is the
 * only place in the app that uses this, and it is deliberately the fastest arrival.
 */
export const takeover = (reduce: boolean): Variants => ({
  hidden: { opacity: 0, scale: reduce ? 1 : 1.03 },
  shown: { opacity: 1, scale: 1, transition: reduce ? FADE : { type: 'spring', stiffness: 380, damping: 32, mass: 0.8 } },
  exit: { opacity: 0, transition: { duration: 0.16 } },
});

/** Press feedback for a tappable surface. Disabled entirely under reduced motion. */
export const press = (reduce: boolean) => (reduce ? {} : { whileTap: { scale: 0.97 }, transition: SNAP });

/** Chat bubbles: the speaker's side decides which edge it grows from. */
export const bubble = (reduce: boolean, mine: boolean): Variants => ({
  hidden: { opacity: 0, y: reduce ? 0 : 8, x: reduce ? 0 : mine ? 6 : -6 },
  shown: { opacity: 1, y: 0, x: 0, transition: calm(reduce, GLIDE) },
  exit: { opacity: 0, transition: FADE },
});

/**
 * Counts a number up to its value. Returns the final number immediately under
 * reduced motion, and for values small enough that animating them is just noise.
 */
export function countUp(from: number, to: number, reduce: boolean): { from: number; to: number } {
  if (reduce || Math.abs(to - from) < 0.05) return { from: to, to };
  return { from, to };
}
