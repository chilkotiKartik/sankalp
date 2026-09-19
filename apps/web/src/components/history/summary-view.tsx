'use client';

import type { ConversationDetail } from '@sanjeevani/types';
import { Button, SectionLabel, cn } from '@sanjeevani/ui';
import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/chrome';
import { PageBody, Skeleton, Stagger, StaggerItem } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import { useToast } from '@/components/providers/toast-provider';
import { CareCard } from '@/components/triage/care-card';
import { TriageSummary } from '@/components/triage/triage-summary';
import { ApiError, api } from '@/lib/api';
import type { MessageKey } from '@/lib/i18n';
import { durationLabel, formatDate, symptomLabel } from '@/lib/present';
import { useResource } from '@/lib/use-resource';

export function SummaryView({ id }: { id: string }) {
  const { t, uiLanguage } = useApp();
  const toast = useToast();
  const router = useRouter();
  const { data, error, reload: load } = useResource(`conversation:${id}`, () => api.conversation(id), t('somethingWrong'));
  const detail: ConversationDetail | null = data ?? null;

  const remove = async () => {
    try {
      await api.deleteConversation(id);
      toast(t('deleted'));
      router.push('/history');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('somethingWrong'), 'error');
    }
  };

  return (
    <PageShell
      title={t('summary')}
      backHref="/history"
      actions={
        detail && (
          <Button variant="ghost" onClick={remove} icon={<Trash2 className="size-4" aria-hidden />} aria-label={t('delete')}>
            <span className="hidden sm:inline">{t('delete')}</span>
          </Button>
        )
      }
    >
      <PageBody>
      {error && (
        <div role="alert" className="space-y-3 rounded-[var(--radius-lg)] bg-[var(--u-urgent-soft)] p-4">
          <p>{error}</p>
          <Button variant="secondary" onClick={load} icon={<RotateCcw className="size-4" aria-hidden />}>
            {t('retry')}
          </Button>
        </div>
      )}
      {!detail && !error && (
        <div aria-busy="true" className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {detail && (
        <div className="space-y-8">
          <p className="text-sm text-[var(--ink-faint)]">{formatDate(detail.startedAt, uiLanguage)}</p>
          {detail.latestTriage ? (
            <>
              {/*
                Continues this conversation rather than starting a new one, so the
                symptoms and the red flags already ruled out stay in play and only the
                change since last time is asked about.
              */}
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.setItem('sv:resume', id);
                  } catch {
                    /* storage blocked — fall through to a fresh conversation */
                  }
                  router.push('/');
                }}
                className="sv-card sv-lift sv-press flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] p-4 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
              >
                <RefreshCw className="size-5 shrink-0 text-[var(--sage)]" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--ink)]">{t('checkAgain')}</span>
                  <span className="block text-sm text-[var(--ink-soft)]">{t('checkAgainHint')}</span>
                </span>
              </button>

              <TriageSummary triage={detail.latestTriage} showFacilities={false} />
              <CareCard triage={detail.latestTriage} preparedAt={detail.startedAt} />
              <Link
                href={`/care?type=${detail.latestTriage.requiredFacilityType}&specialty=${detail.latestTriage.specialty}&urgency=${detail.latestTriage.urgency}`}
                className="flex min-h-12 items-center justify-center rounded-full bg-[var(--sage)] font-semibold text-[var(--paper-raised)]"
              >
                {t('nearbyCare')}
              </Link>
            </>
          ) : (
            <p className="text-[var(--ink-soft)]">{t('guidanceUnavailable')}</p>
          )}

          {detail.timeline.length > 0 && (
            <section aria-labelledby="tl">
              <SectionLabel>
                <span id="tl">{t('timeline')}</span>
              </SectionLabel>
              <Stagger as="ol" className="relative mt-4 space-y-4 border-l-2 border-[var(--line)] pl-5">
                {detail.timeline.map((s) => (
                  <StaggerItem as="li" key={s.code} className="relative">
                    <span aria-hidden className="absolute top-1.5 -left-[27px] size-3 rounded-full border-2 border-[var(--paper)] bg-[var(--sage)]" />
                    <p className="font-semibold text-[var(--ink)]">
                      {symptomLabel(s.code, uiLanguage)}
                      {s.severity !== 'unknown' && <span className="font-normal text-[var(--ink-soft)]"> · {t(`severity_${s.severity}` as MessageKey)}</span>}
                    </p>
                    <p className="text-sm text-[var(--ink-faint)]">
                      {formatDate(s.firstReportedAt, uiLanguage)}
                      {s.reportedDurationHours !== null && ` · ${t('duration')}: ${durationLabel(s.reportedDurationHours, uiLanguage)}`}
                    </p>
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          )}

          <section aria-labelledby="tr">
            <SectionLabel>
              <span id="tr">{t('transcript')}</span>
            </SectionLabel>
            <Stagger as="ol" className="mt-3 space-y-2" step={0.035}>
              {detail.messages.map((m) => (
                <StaggerItem as="li" key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <p
                    className={cn(
                      'max-w-[85%] rounded-[var(--radius-md)] px-4 py-2.5 text-[0.98rem] leading-relaxed',
                      m.role === 'user' ? 'bg-[var(--sage)] text-[var(--paper-raised)]' : 'border border-[var(--line)] bg-[var(--paper-raised)] text-[var(--ink)]',
                    )}
                  >
                    {m.text}
                  </p>
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        </div>
      )}
      </PageBody>
    </PageShell>
  );
}
