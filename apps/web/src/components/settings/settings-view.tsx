'use client';

import { SectionLabel } from '@sanjeevani/ui';
import { Accessibility, BookMarked, ChevronRight, Info, Languages, MessageSquareHeart, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { PageShell } from '@/components/chrome';
import { PageBody, Stagger, StaggerItem } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import { LANGUAGE_NAMES, type MessageKey } from '@/lib/i18n';

interface Row {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: MessageKey;
  /** Shown on the right — the current value, so the hub answers the question itself. */
  value?: string;
}

/**
 * Settings as a hub rather than one long scroll. Language and Accessibility each
 * get a screen of their own because they are the two most likely to be opened, and
 * the two that most benefit from room to breathe.
 */
export function SettingsView() {
  const { t, prefs, capabilities, reducedMotion, location, clearLocation } = useApp();

  const textSizeLabel = { normal: t('textNormal'), large: t('textLarge'), xlarge: t('textXL') }[prefs.textSize];
  const a11ySummary = [textSizeLabel, prefs.highContrast ? t('highContrast') : null, reducedMotion ? t('reduceMotion') : null]
    .filter(Boolean)
    .join(' · ');

  const groups: { title: MessageKey; rows: Row[] }[] = [
    {
      title: 'settingsTitle',
      rows: [
        {
          href: '/settings/language',
          icon: Languages,
          label: 'languageTitle',
          value: prefs.language === 'auto' ? t('languageAuto') : LANGUAGE_NAMES[prefs.language],
        },
        { href: '/settings/accessibility', icon: Accessibility, label: 'accessibilityTitle', value: a11ySummary },
        {
          href: '/settings/emergency-contact',
          icon: UserRound,
          label: 'emergencyContactTitle',
          value: prefs.emergencyContact?.name ?? t('emergencyContactNone'),
        },
        { href: '/saved', icon: BookMarked, label: 'savedTitle' },
      ],
    },
    {
      title: 'about',
      rows: [
        { href: '/about', icon: Info, label: 'aboutTitle' },
        { href: '/guide', icon: Sparkles, label: 'guideTitle' },
        { href: '/privacy', icon: ShieldCheck, label: 'privacy' },
        { href: '/feedback', icon: MessageSquareHeart, label: 'feedback' },
      ],
    },
  ];

  return (
    <PageShell title={t('settingsTitle')}>
      <PageBody>
        <Stagger className="space-y-8">
          {groups.map((group) => (
            <StaggerItem as="section" key={group.title} aria-labelledby={`grp-${group.title}`}>
              <SectionLabel>
                <span id={`grp-${group.title}`}>{t(group.title)}</span>
              </SectionLabel>
              <nav className="sv-card mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]">
                {group.rows.map(({ href, icon: Icon, label, value }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex min-h-16 items-center gap-3 px-4 hover:bg-[var(--paper-sunk)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)] focus-visible:ring-inset"
                  >
                    <Icon className="size-5 shrink-0 text-[var(--sage)]" aria-hidden />
                    <span className="flex-1 font-semibold text-[var(--ink)]">{t(label)}</span>
                    {value && <span className="max-w-[45%] truncate text-right text-sm text-[var(--ink-soft)]">{value}</span>}
                    <ChevronRight className="size-5 shrink-0 text-[var(--ink-faint)]" aria-hidden />
                  </Link>
                ))}
              </nav>
            </StaggerItem>
          ))}

          {location && (
            <StaggerItem as="section" className="sv-card flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] p-4">
              <p className="text-[var(--ink)]">{t('locationShared')}</p>
              <button
                type="button"
                onClick={clearLocation}
                className="sv-press min-h-11 rounded-full px-4 font-semibold text-[var(--u-emergency)] hover:bg-[var(--u-emergency-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
              >
                {t('delete')}
              </button>
            </StaggerItem>
          )}

          {capabilities && (
            <StaggerItem as="section" aria-labelledby="engine-h" className="space-y-2">
              <SectionLabel>
                <span id="engine-h">{t('aboutEngineTitle')}</span>
              </SectionLabel>
              <p className="text-[var(--ink)]">
                {capabilities.tts === 'elevenlabs' ? t('voiceServer') : capabilities.tts === 'gemini' ? t('voiceGemini') : t('voiceBrowser')}
              </p>
              <p className="text-sm text-[var(--ink-soft)]">
                {t('poweredBy', {
                  ai:
                    capabilities.ai === 'anthropic' ? t('aiClaude')
                    : capabilities.ai === 'gemini' ? t('aiGemini')
                    : t('aiRules'),
                  maps: capabilities.maps === 'google_places' ? t('mapsGoogle') : t('mapsCurated'),
                })}
              </p>
            </StaggerItem>
          )}
        </Stagger>
      </PageBody>
    </PageShell>
  );
}
