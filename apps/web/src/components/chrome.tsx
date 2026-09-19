'use client';

import { IconButton, cn } from '@sanjeevani/ui';
import { ChevronLeft, History, Keyboard, Settings2, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useApp } from './providers/app-provider';

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" aria-hidden className="size-7">
        <circle cx="16" cy="16" r="15" fill="var(--sage)" />
        <path d="M16 7c-3.6 3.2-5.4 6.2-5.4 9.2a5.4 5.4 0 0 0 10.8 0C21.4 13.2 19.6 10.2 16 7Z" fill="var(--paper-raised)" />
        <path d="M16 13.2v9.4M13.4 18.6 16 21.2l2.6-2.6" stroke="var(--sage)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[1.35rem] leading-none tracking-tight text-[var(--ink)]">Sanjeevani</span>
    </span>
  );
}

/** Always-visible emergency shortcut: opens the emergency screen with a one-tap call to 112. */
export function SosButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useApp();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('sosLabel')}
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--sos)] px-4 text-[0.95rem] font-bold tracking-wide text-white shadow-[var(--shadow-soft)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2"
    >
      <span aria-hidden className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2.5 rounded-full bg-white" />
      </span>
      SOS 112
    </button>
  );
}

export function OfflineBanner() {
  const { online, t } = useApp();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-3 bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)]">
      <WifiOff className="size-4" aria-hidden />
      <span>{t('offline')}</span>
      <Link href="/emergency" className="font-bold underline underline-offset-4">
        {t('offlineEmergency')}
      </Link>
    </div>
  );
}

export function HomeDock({ onType }: { onType: () => void }) {
  const { t } = useApp();
  return (
    <nav aria-label="Secondary" className="flex items-center justify-center gap-2">
      <IconButton label={t('typeInstead')} onClick={onType} variant="quiet">
        <Keyboard className="size-5" aria-hidden />
      </IconButton>
      <Link
        href="/history"
        aria-label={t('history')}
        title={t('history')}
        className="inline-flex size-11 items-center justify-center rounded-full bg-[var(--paper-sunk)] text-[var(--ink)] transition-colors hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
      >
        <History className="size-5" aria-hidden />
      </Link>
      <Link
        href="/settings"
        aria-label={t('settings')}
        title={t('settings')}
        className="inline-flex size-11 items-center justify-center rounded-full bg-[var(--paper-sunk)] text-[var(--ink)] transition-colors hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
      >
        <Settings2 className="size-5" aria-hidden />
      </Link>
    </nav>
  );
}

/** Header + container for secondary screens. */
export function PageShell({
  title,
  children,
  backHref,
  actions,
  wide,
}: {
  title: string;
  children: ReactNode;
  backHref?: string;
  actions?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useApp();
  const router = useRouter();
  return (
    <div className="relative min-h-dvh">
      <div className="sv-ambient sv-ambient--quiet" aria-hidden />
      <div className="sv-grain" aria-hidden />
      <OfflineBanner />
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--paper)]/85 backdrop-blur-xl">
        <div className={cn('mx-auto flex h-16 items-center gap-2 px-3', wide ? 'max-w-5xl' : 'max-w-2xl')}>
          <IconButton
            label={t('back')}
            onClick={() => (window.history.length > 1 ? router.back() : router.push(backHref ?? '/'))}
          >
            <ChevronLeft className="size-6" aria-hidden />
          </IconButton>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-[var(--ink)]">{title}</h1>
          {actions}
        </div>
      </header>
      <main id="main" className={cn('relative z-10 mx-auto px-4 pt-5 pb-16', wide ? 'max-w-5xl' : 'max-w-2xl')}>
        {children}
      </main>
    </div>
  );
}
