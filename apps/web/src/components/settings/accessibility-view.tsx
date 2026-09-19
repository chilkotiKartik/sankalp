'use client';

import { SectionLabel, Segmented, Surface, Switch } from '@sanjeevani/ui';
import { Volume2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PageShell } from '@/components/chrome';
import { PageBody, Stagger, StaggerItem } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import { useToast } from '@/components/providers/toast-provider';
import { SpeechPlayer } from '@/lib/voice/player';

/**
 * Accessibility on its own screen, with a live preview.
 *
 * The preview is the point: text size, contrast and theme are hard to choose from
 * a label, and easy to choose when you can see a real sentence change as you tap.
 * It uses the same type styles as the triage verdict, so what you tune here is
 * exactly what you will read when it matters.
 */
export function AccessibilityView() {
  const { t, prefs, updatePrefs, reducedMotion, uiLanguage } = useApp();
  const toast = useToast();
  // A player of its own, so the preview never interferes with a live conversation.
  const playerRef = useRef<SpeechPlayer | null>(null);
  useEffect(() => {
    const player = new SpeechPlayer(() => undefined);
    playerRef.current = player;
    return () => player.stop();
  }, []);

  const preview = () => {
    const rate = prefs.speechRate === 'slow' ? 0.85 : 1;
    playerRef.current?.playBrowser(t('previewSample'), uiLanguage, rate).catch(() => toast(t('ttsFailed'), 'error'));
  };

  return (
    <PageShell title={t('accessibilityTitle')}>
      <PageBody>
        <Stagger className="space-y-8">
          <StaggerItem>
            <p className="leading-relaxed text-[var(--ink-soft)]">{t('accessibilityIntro')}</p>
          </StaggerItem>

          <StaggerItem as="section" aria-labelledby="a11y-preview">
            <SectionLabel>
              <span id="a11y-preview">{t('previewLabel')}</span>
            </SectionLabel>
            <div className="sv-card sv-plate mt-3 rounded-[var(--radius-lg)] border-l-[6px] border-[var(--u-routine)] p-4">
              <p className="text-[0.8rem] font-extrabold tracking-[0.14em] text-[var(--u-routine)] uppercase">{t('urgency_routine')}</p>
              <p className="font-display mt-2.5 text-[1.45rem] leading-snug text-[var(--ink)]">{t('previewSample')}</p>
              <button
                type="button"
                onClick={preview}
                className="sv-press mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--line)] px-4 font-semibold text-[var(--ink)] hover:bg-[var(--paper-sunk)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
              >
                <Volume2 className="size-4" aria-hidden /> {t('voiceReplies')}
              </button>
            </div>
          </StaggerItem>

          <StaggerItem as="section" aria-labelledby="a11y-text" className="space-y-3">
            <SectionLabel>
              <span id="a11y-text">{t('textSize')}</span>
            </SectionLabel>
            <Segmented
              label={t('textSize')}
              value={prefs.textSize}
              onChange={(textSize) => updatePrefs({ textSize })}
              options={[
                { value: 'normal', label: <span className="text-base">{t('textNormal')}</span> },
                { value: 'large', label: <span className="text-lg">{t('textLarge')}</span> },
                { value: 'xlarge', label: <span className="text-xl">{t('textXL')}</span> },
              ]}
            />
          </StaggerItem>

          <StaggerItem as="section" aria-labelledby="a11y-display" className="space-y-3">
            <SectionLabel>
              <span id="a11y-display">{t('theme')}</span>
            </SectionLabel>
            <Segmented
              label={t('theme')}
              value={prefs.theme}
              onChange={(theme) => updatePrefs({ theme })}
              options={[
                { value: 'system', label: t('themeSystem') },
                { value: 'light', label: t('themeLight') },
                { value: 'dark', label: t('themeDark') },
              ]}
            />
            <Surface className="divide-y divide-[var(--line)] px-4">
              <Switch
                label={t('highContrast')}
                description={t('highContrastHelp')}
                checked={prefs.highContrast}
                onChange={(highContrast) => updatePrefs({ highContrast })}
              />
              <Switch
                label={t('reduceMotion')}
                description={t('reduceMotionHelp')}
                checked={reducedMotion}
                onChange={(v) => updatePrefs({ reduceMotion: v })}
              />
            </Surface>
          </StaggerItem>

          <StaggerItem as="section" aria-labelledby="a11y-voice" className="space-y-3">
            <SectionLabel>
              <span id="a11y-voice">{t('voiceEngine')}</span>
            </SectionLabel>
            <Surface className="divide-y divide-[var(--line)] px-4">
              <Switch
                label={t('voiceReplies')}
                description={t('voiceRepliesHelp')}
                checked={prefs.voiceReplies}
                onChange={(voiceReplies) => updatePrefs({ voiceReplies })}
              />
              <Switch
                label={t('autoListen')}
                description={t('autoListenHelp')}
                checked={prefs.autoListen}
                onChange={(autoListen) => updatePrefs({ autoListen })}
              />
              <Switch
                label={t('dataSaver')}
                description={t('dataSaverHelp')}
                checked={prefs.dataSaver}
                onChange={(dataSaver) => updatePrefs({ dataSaver })}
              />
            </Surface>
            <div>
              <p className="mb-2 font-semibold text-[var(--ink)]">{t('speechRate')}</p>
              <Segmented
                label={t('speechRate')}
                value={prefs.speechRate}
                onChange={(speechRate) => updatePrefs({ speechRate })}
                options={[
                  { value: 'slow', label: t('rateSlow') },
                  { value: 'normal', label: t('rateNormal') },
                ]}
              />
            </div>
          </StaggerItem>
        </Stagger>
      </PageBody>
    </PageShell>
  );
}
