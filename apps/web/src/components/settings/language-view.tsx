'use client';

import type { LanguagePreference } from '@sanjeevani/types';
import { SectionLabel, Segmented } from '@sanjeevani/ui';
import { Check } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { PageShell } from '@/components/chrome';
import { PageBody, Stagger, StaggerItem, Swap } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import { EXAMPLES, LANGUAGE_NAMES } from '@/lib/i18n';

const ORDER: LanguagePreference[] = ['auto', 'hi', 'hinglish', 'en'];

/**
 * Language on its own screen, because for many people it is the first thing they
 * change and the thing that decides whether the app is usable at all. Choosing a
 * language swaps the examples live, so the choice is previewed rather than promised.
 */
export function LanguageView() {
  const { t, prefs, updatePrefs, uiLanguage } = useApp();

  const options = ORDER.map((value) => ({
    value,
    label: value === 'auto' ? t('languageAuto') : LANGUAGE_NAMES[value],
  }));

  return (
    <PageShell title={t('languageTitle')}>
      <PageBody>
        <div className="space-y-8">
          <p className="leading-relaxed text-[var(--ink-soft)]">{t('languageScreenIntro')}</p>

          <Segmented label={t('language')} value={prefs.language} onChange={(language) => updatePrefs({ language })} options={options} />

          <section aria-labelledby="lang-choices">
            <SectionLabel>
              <span id="lang-choices">{t('language')}</span>
            </SectionLabel>
            <Stagger as="ul" className="sv-card mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]">
              {ORDER.map((value) => {
                const active = prefs.language === value;
                return (
                  <StaggerItem as="li" key={value}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => updatePrefs({ language: value })}
                      className="flex min-h-16 w-full items-center gap-3 px-4 text-left hover:bg-[var(--paper-sunk)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)] focus-visible:ring-inset"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-[var(--ink)]">
                          {value === 'auto' ? t('languageAuto') : LANGUAGE_NAMES[value]}
                        </span>
                        {value === 'auto' && <span className="block text-sm text-[var(--ink-soft)]">{t('languageHelp')}</span>}
                      </span>
                      {active && <Check className="size-5 shrink-0 text-[var(--sage)]" aria-hidden />}
                    </button>
                  </StaggerItem>
                );
              })}
            </Stagger>
          </section>

          <section aria-labelledby="lang-sample">
            <SectionLabel>
              <span id="lang-sample">{t('languageSample')}</span>
            </SectionLabel>
            {/* Examples crossfade as the choice changes, so the effect is immediate. */}
            <AnimatePresence mode="wait" initial={false}>
              <Swap id={uiLanguage} className="mt-3 space-y-2">
                {EXAMPLES[uiLanguage].map((example) => (
                  <p
                    key={example}
                    lang={uiLanguage === 'hi' ? 'hi' : 'en'}
                    className="sv-card rounded-[var(--radius-lg)] border border-[var(--line)] px-4 py-3 text-[1.02rem] leading-snug text-[var(--ink-soft)]"
                  >
                    “{example}”
                  </p>
                ))}
              </Swap>
            </AnimatePresence>
          </section>
        </div>
      </PageBody>
    </PageShell>
  );
}
