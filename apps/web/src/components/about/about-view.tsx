'use client';

import { RANKING_WEIGHTS } from '@sanjeevani/maps';
import { SectionLabel } from '@sanjeevani/ui';
import { Ban, Ear, Hospital, ListChecks, ShieldAlert, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { PageShell } from '@/components/chrome';
import { PageBody, Stagger, StaggerItem } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import type { MessageKey } from '@/lib/i18n';

const STEPS: { icon: ComponentType<{ className?: string }>; title: MessageKey; body: MessageKey }[] = [
  { icon: Ear, title: 'aboutStep1', body: 'aboutStep1Body' },
  { icon: ShieldAlert, title: 'aboutStep2', body: 'aboutStep2Body' },
  { icon: ListChecks, title: 'aboutStep3', body: 'aboutStep3Body' },
  { icon: Stethoscope, title: 'aboutStep4', body: 'aboutStep4Body' },
  { icon: Hospital, title: 'aboutStep5', body: 'aboutStep5Body' },
];

const NEVER: MessageKey[] = ['aboutNever1', 'aboutNever2', 'aboutNever3', 'aboutNever4'];

const FACTORS: { key: keyof typeof RANKING_WEIGHTS.urgent; label: MessageKey }[] = [
  { key: 'distance', label: 'aboutFactorDistance' },
  { key: 'operational', label: 'aboutFactorOperational' },
  { key: 'relevance', label: 'aboutFactorRelevance' },
  { key: 'service', label: 'aboutFactorService' },
];

/**
 * How it works. Written to be read by someone deciding whether to trust this with
 * a sick relative, so it leads with what the app will never do and shows the real
 * ranking weights rather than describing them.
 */
export function AboutView() {
  const { t, capabilities } = useApp();
  const weights = RANKING_WEIGHTS.urgent;

  return (
    <PageShell title={t('aboutTitle')}>
      <PageBody>
        <Stagger className="space-y-10" step={0.07}>
          <StaggerItem>
            <p className="font-display text-[1.45rem] leading-snug text-balance text-[var(--ink)]">{t('aboutLead')}</p>
          </StaggerItem>

          <StaggerItem as="section" aria-labelledby="ab-steps">
            <SectionLabel>
              <span id="ab-steps">{t('aboutStepsTitle')}</span>
            </SectionLabel>
            {/* A vertical rule ties the five steps into one sequence. */}
            <Stagger as="ol" className="relative mt-4 space-y-5 border-l-2 border-[var(--line)] pl-6">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <StaggerItem as="li" key={title} className="relative">
                  <span
                    aria-hidden
                    className="absolute top-0.5 -left-[35px] flex size-8 items-center justify-center rounded-full border-2 border-[var(--paper)] bg-[var(--sage-soft)] text-[var(--sage-deep)]"
                  >
                    <Icon className="size-4" />
                  </span>
                  <h3 className="font-bold text-[var(--ink)]">
                    <span className="text-[var(--ink-faint)] tabular-nums">{i + 1}. </span>
                    {t(title)}
                  </h3>
                  <p className="mt-1 leading-relaxed text-[var(--ink-soft)]">{t(body)}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </StaggerItem>

          <StaggerItem>
            <section aria-labelledby="ab-never" className="sv-plate rounded-[var(--radius-lg)] bg-[var(--u-emergency-soft)] p-5">
              <h2 id="ab-never" className="flex items-center gap-2 font-bold text-[var(--u-emergency)]">
                <Ban className="size-5" aria-hidden /> {t('aboutSafetyTitle')}
              </h2>
              <ul className="mt-3 space-y-2">
                {NEVER.map((key) => (
                  <li key={key} className="flex gap-2.5 leading-relaxed text-[var(--ink)]">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--u-emergency)]" />
                    {t(key)}
                  </li>
                ))}
              </ul>
            </section>
          </StaggerItem>

          <StaggerItem>
            <section aria-labelledby="ab-rank">
              <SectionLabel>
                <span id="ab-rank">{t('aboutRankingTitle')}</span>
              </SectionLabel>
              <p className="mt-2 leading-relaxed text-[var(--ink-soft)]">{t('aboutRankingBody')}</p>
              {/* The weights are read from the same constant the server ranks with. */}
              <ul className="mt-4 space-y-3">
                {FACTORS.map(({ key, label }) => (
                  <li key={key}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-[var(--ink)]">{t(label)}</span>
                      <span className="text-sm text-[var(--ink-faint)] tabular-nums">{Math.round(weights[key] * 100)}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--paper-sunk)]">
                      <div
                        className="h-full rounded-full bg-[var(--sage)] transition-[width] duration-700 ease-out"
                        style={{ width: `${weights[key] * 100}%` }}
                        aria-hidden
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </StaggerItem>

          {capabilities && (
            <StaggerItem>
              <section aria-labelledby="ab-engine">
                <SectionLabel>
                  <span id="ab-engine">{t('aboutEngineTitle')}</span>
                </SectionLabel>
                <dl className="sv-card mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]">
                  {[
                    [t('voiceEngine'), capabilities.tts === 'elevenlabs' ? t('voiceServer') : capabilities.tts === 'gemini' ? t('voiceGemini') : t('voiceBrowser')],
                    [
                      t('aboutSourcesTitle'),
                      capabilities.maps === 'google_places' ? t('mapsGoogle') : t('mapsCurated'),
                    ],
                    [
                      'AI',
                      capabilities.ai === 'anthropic' ? t('aiClaude') : capabilities.ai === 'gemini' ? t('aiGemini') : t('aiRules'),
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
                      <dt className="text-sm text-[var(--ink-faint)]">{label}</dt>
                      <dd className="text-right font-semibold text-[var(--ink)]">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </StaggerItem>
          )}

          <StaggerItem>
            <div className="space-y-3">
              <Link
                href="/guide"
                className="sv-press flex min-h-12 items-center justify-center rounded-full bg-[var(--sage)] font-semibold text-[var(--paper-raised)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
              >
                {t('guideTitle')}
              </Link>
              <p className="text-sm leading-relaxed text-[var(--ink-faint)]">{t('disclaimer')}</p>
            </div>
          </StaggerItem>
        </Stagger>
      </PageBody>
    </PageShell>
  );
}
