'use client';

import { BookmarkX, ChevronRight, MapPin, Navigation } from 'lucide-react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PageShell } from '@/components/chrome';
import { PageBody, Stagger, StaggerItem } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import { useToast } from '@/components/providers/toast-provider';
import { FADE, GLIDE } from '@/lib/motion';

/**
 * Saved places. Kept on the device, never sent anywhere — someone who bookmarks the
 * hospital their parent goes to should not thereby be telling a server about it.
 * Removing one collapses its row so the list closes up rather than jumping.
 */
export function SavedView() {
  const { t, saved, toggleSaved } = useApp();
  const toast = useToast();
  const reduce = useReducedMotion() ?? false;

  return (
    <PageShell title={t('savedTitle')}>
      <PageBody>
        {saved.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] p-8 text-center">
            <MapPin className="mx-auto size-8 text-[var(--ink-faint)]" aria-hidden />
            <p className="mt-3 leading-relaxed text-[var(--ink-soft)]">{t('savedEmpty')}</p>
            <Link
              href="/care"
              className="sv-press mt-5 inline-flex min-h-12 items-center rounded-full bg-[var(--sage)] px-6 font-semibold text-[var(--paper-raised)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
            >
              {t('nearbyCare')}
            </Link>
          </div>
        ) : (
          <Stagger as="ul" className="space-y-3">
            <AnimatePresence initial={false}>
              {saved.map((place) => (
                <motion.li
                  key={place.id}
                  layout={!reduce}
                  exit={{ opacity: 0, height: 0, marginTop: 0, transition: reduce ? FADE : { ...GLIDE, opacity: FADE } }}
                  className="overflow-hidden"
                >
                  <StaggerItem className="sv-card sv-lift relative flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] p-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="leading-snug font-bold text-[var(--ink)]">
                        <Link
                          href={`/care/${encodeURIComponent(place.id)}`}
                          className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                        >
                          {place.name}
                        </Link>
                      </h2>
                      <p className="mt-0.5 truncate text-sm text-[var(--ink-soft)]">{place.address}</p>
                    </div>
                    <div className="relative z-10 flex shrink-0 items-center gap-1">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.name}, ${place.address}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={t('directions')}
                        title={t('directions')}
                        className="inline-flex size-11 items-center justify-center rounded-full text-[var(--sage)] hover:bg-[var(--paper-sunk)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
                      >
                        <Navigation className="size-5" aria-hidden />
                      </a>
                      <button
                        type="button"
                        aria-label={t('savedRemove')}
                        title={t('savedRemove')}
                        onClick={() => {
                          toggleSaved(place);
                          toast(t('removed'));
                        }}
                        className="inline-flex size-11 items-center justify-center rounded-full text-[var(--ink-soft)] hover:bg-[var(--paper-sunk)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
                      >
                        <BookmarkX className="size-5" aria-hidden />
                      </button>
                      <ChevronRight className="size-5 text-[var(--ink-faint)]" aria-hidden />
                    </div>
                  </StaggerItem>
                </motion.li>
              ))}
            </AnimatePresence>
          </Stagger>
        )}
        <p className="mt-8 text-sm leading-relaxed text-[var(--ink-faint)]">{t('privacyLocation')}</p>
      </PageBody>
    </PageShell>
  );
}
