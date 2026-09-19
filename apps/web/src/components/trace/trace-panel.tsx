'use client';

import type { TraceStage } from '@sanjeevani/types';
import { cn } from '@sanjeevani/ui';
import { Check, ChevronDown, Minus } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { useApp } from '@/components/providers/app-provider';
import type { MessageKey } from '@/lib/i18n';
import { FADE, GLIDE } from '@/lib/motion';

/**
 * "How this answer was produced."
 *
 * The product makes a specific claim — that deterministic safety rules run before
 * anything is generated — and this panel is how a user checks it instead of
 * believing it. The data is the real per-stage record of the turn they just had,
 * including the stages that did *not* run and why.
 *
 * It carries stage names, outcomes and milliseconds. The server builds it from a
 * fixed vocabulary, so nothing clinical can reach it.
 */
export function TracePanel({ trace, totalMs, className }: { trace: TraceStage[]; totalMs: number; className?: string }) {
  const { t } = useApp();
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);

  if (trace.length === 0) return null;
  const slowest = Math.max(...trace.map((s) => s.ms), 1);

  return (
    <section className={cn('sv-card overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]', className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left font-semibold text-[var(--ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)] focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1 leading-snug text-balance">{t('howProduced')}</span>
        <span className="shrink-0 text-sm font-normal text-[var(--ink-faint)] tabular-nums">{Math.round(totalMs)} ms</span>
        <ChevronDown className={cn('size-5 shrink-0 transition-transform duration-300', open && 'rotate-180')} aria-hidden />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="trace"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? FADE : { ...GLIDE, opacity: FADE }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--line)] px-4 py-3">
              <p className="text-sm leading-relaxed text-[var(--ink-soft)]">{t('howProducedIntro')}</p>

              <ol className="mt-3 space-y-1.5">
                {trace.map((stage) => (
                  <li key={stage.stage} className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full',
                        stage.ran ? 'bg-[var(--sage-soft)] text-[var(--sage-deep)]' : 'bg-[var(--paper-sunk)] text-[var(--ink-faint)]',
                      )}
                    >
                      {stage.ran ? <Check className="size-3" strokeWidth={3} /> : <Minus className="size-3" strokeWidth={3} />}
                    </span>

                    <span className={cn('min-w-0 flex-1 text-[0.95rem]', stage.ran ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)]')}>
                      {t(`stage_${stage.stage}` as MessageKey)}
                      {stage.detail && <span className="text-[var(--ink-faint)]"> · {stage.ran ? stage.detail : t('traceSkipped')}</span>}
                    </span>

                    {/* A bar proportional to the slowest stage, so the cost is visible at a glance. */}
                    {stage.ran && (
                      <span className="hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--paper-sunk)] sm:block" aria-hidden>
                        <span
                          className="block h-full rounded-full bg-[var(--sage)]"
                          style={{ width: `${Math.max(4, (stage.ms / slowest) * 100)}%` }}
                        />
                      </span>
                    )}
                    <span className={cn('w-14 shrink-0 text-right text-sm tabular-nums', stage.ran ? 'text-[var(--ink-soft)]' : 'text-[var(--ink-faint)]')}>
                      {stage.ran ? `${Math.round(stage.ms)} ms` : '—'}
                    </span>
                  </li>
                ))}
              </ol>

              <p className="mt-3 flex justify-between border-t border-[var(--line)] pt-2 text-sm font-semibold text-[var(--ink)]">
                <span>{t('traceTotal')}</span>
                <span className="tabular-nums">{Math.round(totalMs)} ms</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
