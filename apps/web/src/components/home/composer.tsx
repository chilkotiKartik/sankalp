'use client';

import { Button, Sheet } from '@sanjeevani/ui';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/providers/app-provider';

/** Text input for anyone who can't or prefers not to speak. Same pipeline as voice. */
export function Composer({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (text: string) => void }) {
  const { t } = useApp();
  const [text, setText] = useState('');

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText('');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('typeInstead')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3 pb-2"
      >
        <label htmlFor="composer" className="sr-only">
          {t('typePlaceholder')}
        </label>
        <textarea
          id="composer"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          maxLength={1000}
          placeholder={t('typePlaceholder')}
          className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper-raised)] p-4 text-[calc(1.1rem*var(--text-scale))] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:border-[var(--sage)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]/40"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--ink-faint)]">{t('typeHint')}</p>
          <Button type="submit" size="lg" disabled={!text.trim()} icon={<Send className="size-4" aria-hidden />}>
            {t('send')}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
