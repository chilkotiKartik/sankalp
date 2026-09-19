'use client';

import type { FeedbackRequest } from '@sanjeevani/types';
import { Button, Chip } from '@sanjeevani/ui';
import { Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PageShell } from '@/components/chrome';
import { PageBody } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import { useToast } from '@/components/providers/toast-provider';
import { ApiError, api } from '@/lib/api';
import type { MessageKey } from '@/lib/i18n';

const CATEGORIES: FeedbackRequest['category'][] = ['voice', 'triage', 'facilities', 'accessibility', 'language', 'other'];

export function FeedbackView() {
  const { t } = useApp();
  const toast = useToast();
  const params = useSearchParams();
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [category, setCategory] = useState<FeedbackRequest['category']>('other');
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const submit = async () => {
    if (helpful === null) return;
    setState('sending');
    try {
      const conversationId = params.get('conversation');
      await api.feedback({ helpful, category, ...(comment.trim() ? { comment: comment.trim() } : {}), ...(conversationId ? { conversationId } : {}) });
      setState('sent');
    } catch (e) {
      setState('idle');
      toast(e instanceof ApiError ? e.message : t('somethingWrong'), 'error');
    }
  };

  return (
    <PageShell title={t('feedback')}>
      <PageBody>
      {state === 'sent' ? (
        <p role="status" className="sv-plate font-display rounded-[var(--radius-lg)] bg-[var(--sage-soft)] p-8 text-center text-[1.5rem] text-[var(--sage-deep)] shadow-[var(--shadow-soft)]">
          {t('feedbackThanks')}
        </p>
      ) : (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset>
            <legend className="font-display text-[1.6rem] text-[var(--ink)]">{t('feedbackTitle')}</legend>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={helpful === v}
                  onClick={() => setHelpful(v)}
                  className={
                    'flex min-h-28 flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border-2 text-base font-semibold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)] ' +
                    (helpful === v
                      ? 'sv-plate border-[var(--sage)] bg-[var(--sage-soft)] text-[var(--sage-deep)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--sage)_18%,transparent)]'
                      : 'sv-card sv-lift border-[var(--line)] text-[var(--ink)]')
                  }
                >
                  {v ? <ThumbsUp className="size-7" aria-hidden /> : <ThumbsDown className="size-7" aria-hidden />}
                  {v ? t('feedbackYes') : t('feedbackNo')}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-semibold text-[var(--ink)]">{t('feedbackAbout')}</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
                  {t(`cat_${c}` as MessageKey)}
                </Chip>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="fb-comment" className="mb-2 block font-semibold text-[var(--ink)]">
              {t('feedbackComment')}
            </label>
            <textarea
              id="fb-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={600}
              rows={4}
              className="w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper-raised)] p-3 text-[var(--ink)] focus:border-[var(--sage)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]/40"
            />
          </div>

          <Button type="submit" size="lg" block disabled={helpful === null || state === 'sending'} icon={<Send className="size-4" aria-hidden />}>
            {t('feedbackSend')}
          </Button>
        </form>
      )}
      </PageBody>
    </PageShell>
  );
}
