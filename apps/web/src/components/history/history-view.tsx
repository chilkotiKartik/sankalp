'use client';

import type { ConversationSummary } from '@sanjeevani/types';
import { Button, SectionLabel, cn } from '@sanjeevani/ui';
import { ChevronRight, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { PageShell } from '@/components/chrome';
import { PageBody, Skeleton, Stagger, StaggerItem } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import { api } from '@/lib/api';
import { useResource } from '@/lib/use-resource';
import type { MessageKey } from '@/lib/i18n';
import { URGENCY_STYLE, formatDate, symptomLabel } from '@/lib/present';

export function HistoryView() {
  const { t, uiLanguage, capabilities, saved } = useApp();
  const { data, error, reload: load } = useResource('history', () => api.listConversations(), t('somethingWrong'));
  const items: ConversationSummary[] | null = data?.conversations ?? null;

  return (
    <PageShell title={t('historyTitle')}>
      <PageBody>
      {error && (
        <div role="alert" className="mb-4 space-y-3 rounded-[var(--radius-lg)] bg-[var(--u-urgent-soft)] p-4">
          <p>{error}</p>
          <Button variant="secondary" onClick={load} icon={<RotateCcw className="size-4" aria-hidden />}>
            {t('retry')}
          </Button>
        </div>
      )}
      {items === null && !error && (
        <ul className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton className="h-24" />
            </li>
          ))}
        </ul>
      )}
      {items?.length === 0 && (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] p-6 text-center text-[var(--ink-soft)]">
          {t('historyEmpty', { days: capabilities?.retentionDays ?? 7 })}
        </p>
      )}
      {items && items.length > 0 && (
        <Stagger as="ol" className="space-y-3">
          {items.map((c) => {
            const style = c.urgency ? URGENCY_STYLE[c.urgency] : null;
            return (
              <StaggerItem as="li" key={c.id}>
                <Link
                  href={`/summary/${c.id}`}
                  className="flex items-center gap-3 sv-card sv-lift rounded-[var(--radius-lg)] border border-[var(--line)] p-4 hover:border-[var(--line-strong)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
                >
                  <span aria-hidden className={cn('h-12 w-1.5 shrink-0 rounded-full', style?.bar ?? 'bg-[var(--line)]')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-[var(--ink-faint)]">{formatDate(c.updatedAt, uiLanguage)}</span>
                    <span className="block truncate font-semibold text-[var(--ink)]">
                      {c.symptomCodes.length ? c.symptomCodes.slice(0, 3).map((s) => symptomLabel(s, uiLanguage)).join(', ') : t('newConversation')}
                    </span>
                    {c.urgency && (
                      <span className={cn('block text-sm font-semibold', style?.fg)}>{t(`urgency_${c.urgency}` as MessageKey)}</span>
                    )}
                  </span>
                  <ChevronRight className="size-5 text-[var(--ink-faint)]" aria-hidden />
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

      {saved.length > 0 && (
        <section className="mt-10" aria-labelledby="saved-h">
          <SectionLabel>
            <span id="saved-h">{t('savedPlaces')}</span>
          </SectionLabel>
          <ul className="mt-3 divide-y divide-[var(--line)] sv-card overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]">
            {saved.map((s) => (
              <li key={s.id}>
                <Link href={`/care/${encodeURIComponent(s.id)}`} className="block min-h-14 px-4 py-3 hover:bg-[var(--paper-sunk)]">
                  <span className="block font-semibold text-[var(--ink)]">{s.name}</span>
                  <span className="block truncate text-sm text-[var(--ink-soft)]">{s.address}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      </PageBody>
    </PageShell>
  );
}
