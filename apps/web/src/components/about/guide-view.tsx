'use client';

import { Clock, Hand, Languages, MessageCircle, ThumbsUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import { PageShell } from '@/components/chrome';
import { PageBody, Stagger, StaggerItem } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import { EXAMPLES, type MessageKey } from '@/lib/i18n';

const TIPS: { icon: ComponentType<{ className?: string }>; title: MessageKey; body: MessageKey }[] = [
  { icon: MessageCircle, title: 'guideTip1', body: 'guideTip1Body' },
  { icon: Languages, title: 'guideTip2', body: 'guideTip2Body' },
  { icon: Clock, title: 'guideTip3', body: 'guideTip3Body' },
  { icon: ThumbsUp, title: 'guideTip4', body: 'guideTip4Body' },
  { icon: Hand, title: 'guideTip5', body: 'guideTip5Body' },
];

/**
 * How to speak to it. People freeze at a microphone because they think there is a
 * correct phrasing; this screen exists to remove that. Each example is tappable and
 * starts a real conversation, so the page teaches by doing rather than telling.
 */
export function GuideView() {
  const { t, uiLanguage } = useApp();
  const router = useRouter();

  const start = (text: string) => {
    // The home screen picks this up and sends it as the opening turn.
    try {
      sessionStorage.setItem('sv:prefill', text);
    } catch {
      /* private mode — the home screen simply starts empty */
    }
    router.push('/');
  };

  return (
    <PageShell title={t('guideTitle')}>
      <PageBody>
        <div className="space-y-8">
          <p className="font-display text-[1.45rem] leading-snug text-balance text-[var(--ink)]">{t('guideLead')}</p>

          <Stagger as="ul" className="space-y-3">
            {TIPS.map(({ icon: Icon, title, body }) => (
              <StaggerItem as="li" key={title} className="sv-card flex gap-4 rounded-[var(--radius-lg)] border border-[var(--line)] p-4">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--sage-soft)] text-[var(--sage-deep)]">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-[var(--ink)]">{t(title)}</h3>
                  <p className="mt-1 leading-relaxed text-[var(--ink-soft)]">{t(body)}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <section aria-labelledby="g-try">
            <h2 id="g-try" className="text-[0.78rem] font-bold tracking-[0.12em] text-[var(--ink-faint)] uppercase sv-rule">
              {t('guideTryIt')}
            </h2>
            <Stagger as="ul" className="mt-3 space-y-2">
              {EXAMPLES[uiLanguage].map((example) => (
                <StaggerItem as="li" key={example}>
                  <button
                    type="button"
                    onClick={() => start(example)}
                    className="sv-card sv-lift sv-press w-full rounded-[var(--radius-lg)] border border-[var(--line)] px-4 py-3.5 text-left text-[1.02rem] leading-snug text-[var(--ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
                  >
                    “{example}”
                  </button>
                </StaggerItem>
              ))}
            </Stagger>
          </section>

          <p className="text-sm leading-relaxed text-[var(--ink-faint)]">{t('disclaimer')}</p>
        </div>
      </PageBody>
    </PageShell>
  );
}
