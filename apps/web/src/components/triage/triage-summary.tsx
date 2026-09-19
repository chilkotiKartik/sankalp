'use client';

import type { RankedFacility, TriageResult } from '@sanjeevani/types';
import { SectionLabel, cn } from '@sanjeevani/ui';
import { AlertTriangle, ChevronDown, HeartPulse, Hospital, Stethoscope } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { FacilityCard } from '@/components/care/facility-card';
import { Stagger, StaggerItem } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import { GLIDE, FADE } from '@/lib/motion';
import { URGENCY_STYLE, durationLabel, rationaleText, specialtyLabel, symptomLabel } from '@/lib/present';

const URGENCY_ICON = {
  emergency: AlertTriangle,
  urgent: Hospital,
  routine: Stethoscope,
  self_care: HeartPulse,
} as const;

export function UrgencyBanner({ triage }: { triage: TriageResult }) {
  const { t, uiLanguage } = useApp();
  const style = URGENCY_STYLE[triage.urgency];
  const Icon = URGENCY_ICON[triage.urgency];
  return (
    <div className={cn('sv-plate rounded-[var(--radius-lg)] border-l-[6px] p-4 shadow-[var(--shadow-soft)]', style.bg, style.ring)}>
      <div className="flex items-center gap-2.5">
        <Icon className={cn('size-6 shrink-0', style.fg)} aria-hidden />
        <p className={cn('text-[0.8rem] font-extrabold tracking-[0.14em] uppercase', style.fg)}>{t(`urgency_${triage.urgency}`)}</p>
      </div>
      <p className="font-display mt-2.5 text-[1.45rem] leading-snug text-[var(--ink)]">{triage.recommendedAction}</p>
      {triage.urgency !== 'emergency' && triage.urgency !== 'self_care' && (
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          {specialtyLabel(triage.specialty, uiLanguage)}
        </p>
      )}
    </div>
  );
}

/** The care note: plain-language, scannable, and honest about its limits. */
export function TriageSummary({
  triage,
  facilities,
  showFacilities = true,
}: {
  triage: TriageResult;
  facilities?: RankedFacility[];
  showFacilities?: boolean;
}) {
  const { t, uiLanguage } = useApp();
  const reduce = useReducedMotion() ?? false;
  const [whyOpen, setWhyOpen] = useState(false);
  const reasons = [...new Set(triage.rationale.map((r) => rationaleText(r, uiLanguage)).filter((x): x is string => Boolean(x)))];
  const duration = durationLabel(triage.duration?.hours, uiLanguage);

  return (
    <Stagger className="space-y-6">
      <StaggerItem>
        <UrgencyBanner triage={triage} />
      </StaggerItem>

      <StaggerItem as="section" aria-labelledby="ts-told">
        <SectionLabel>
          <span id="ts-told">{t('whatYouTold')}</span>
        </SectionLabel>
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {triage.symptoms.map((s) => (
            <li key={s.code} className="rounded-full border border-[var(--line)] bg-[var(--paper-raised)] px-3.5 py-1.5 text-[0.95rem] font-medium text-[var(--ink)]">
              {symptomLabel(s.code, uiLanguage)}
              {s.severity !== 'unknown' && <span className="text-[var(--ink-faint)]"> · {t(`severity_${s.severity}`)}</span>}
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          {duration && (
            <div>
              <dt className="text-[var(--ink-faint)]">{t('duration')}</dt>
              <dd className="font-semibold text-[var(--ink)]">{duration}</dd>
            </div>
          )}
          <div>
            <dt className="text-[var(--ink-faint)]">{t('forWhom')}</dt>
            <dd className="font-semibold text-[var(--ink)]">{t(`age_${triage.ageGroup}`)}</dd>
          </div>
        </dl>
      </StaggerItem>

      {triage.careAdvice.length > 0 && (
        <StaggerItem as="section" aria-labelledby="ts-care">
          <SectionLabel>
            <span id="ts-care">{t('careAtHome')}</span>
          </SectionLabel>
          <ul className="mt-2.5 space-y-2">
            {triage.careAdvice.map((c) => (
              <li key={c} className="flex gap-2.5 text-[1rem] leading-relaxed text-[var(--ink)]">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[var(--sage)]" />
                {c}
              </li>
            ))}
          </ul>
        </StaggerItem>
      )}

      {triage.warningSigns.length > 0 && (
        <StaggerItem as="section" aria-labelledby="ts-warn" className="sv-plate rounded-[var(--radius-lg)] bg-[var(--u-emergency-soft)] p-4">
          <h2 id="ts-warn" className="flex items-center gap-2 font-bold text-[var(--u-emergency)]">
            <AlertTriangle className="size-5" aria-hidden /> {t('seekHelpIf')}
          </h2>
          <ul className="mt-2 space-y-1.5">
            {triage.warningSigns.map((w) => (
              <li key={w} className="text-[1rem] text-[var(--ink)]">
                — {w}
              </li>
            ))}
          </ul>
          <a href="tel:112" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--sos)] px-4 font-bold text-white">
            {t('callNow', { number: '112' })}
          </a>
        </StaggerItem>
      )}

      {showFacilities && facilities && facilities.length > 0 && (
        <StaggerItem as="section" aria-labelledby="ts-care-near" className="space-y-3">
          <SectionLabel>
            <span id="ts-care-near">{t('nearbyCare')}</span>
          </SectionLabel>
          {facilities.slice(0, 3).map((f, i) => (
            <FacilityCard key={f.id} facility={f} rank={i + 1} specialty={triage.specialty} compact />
          ))}
        </StaggerItem>
      )}

      <StaggerItem as="section" className="sv-card overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]">
        <button
          type="button"
          aria-expanded={whyOpen}
          onClick={() => setWhyOpen((o) => !o)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left font-semibold text-[var(--ink)]"
        >
          {t('whyThis')}
          <ChevronDown className={cn('size-5 transition-transform duration-300', whyOpen && 'rotate-180')} aria-hidden />
        </button>
        {/* The panel opens by growing, so the reason reads as unfolding from the question. */}
        <AnimatePresence initial={false}>
          {whyOpen && (
            <motion.div
              key="why"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={reduce ? FADE : { ...GLIDE, opacity: FADE }}
              className="overflow-hidden"
            >
              <div className="space-y-3 border-t border-[var(--line)] px-4 py-3 text-[0.95rem] text-[var(--ink-soft)]">
                {reasons.length > 0 ? (
                  <ul className="space-y-1.5">
                    {reasons.map((r) => (
                      <li key={r}>• {r}</li>
                    ))}
                  </ul>
                ) : null}
                <p>
                  <span className="font-semibold text-[var(--ink)]">{t('confidence')}: </span>
                  {t(`confidence_${triage.confidence}`)}
                </p>
                <p>
                  <span className="font-semibold text-[var(--ink)]">{t('howRanked')}: </span>
                  {t('rankingExplainer')}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </StaggerItem>

      <StaggerItem as="section">
        <p className="text-sm leading-relaxed text-[var(--ink-faint)]">{t('disclaimer')}</p>
      </StaggerItem>
    </Stagger>
  );
}
