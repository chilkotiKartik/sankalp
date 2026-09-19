'use client';

import type { RankedFacility } from '@sanjeevani/types';
import { cn } from '@sanjeevani/ui';
import { Bookmark, BookmarkCheck, ChevronRight, Navigation, Phone } from 'lucide-react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AnimatedNumber } from '@/components/motion/primitives';
import { POP } from '@/lib/motion';
import { useApp } from '@/components/providers/app-provider';
import { useToast } from '@/components/providers/toast-provider';
import { minutes, reasonBadges, telHref } from '@/lib/present';

export function ReasonPills({ facility, specialty, max = 3 }: { facility: RankedFacility; specialty?: string; max?: number }) {
  const { uiLanguage } = useApp();
  const badges = reasonBadges(facility, uiLanguage, specialty).slice(0, max);
  return (
    <ul className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <li
          key={b.code}
          className={cn(
            'rounded-full px-2.5 py-1 text-[0.8rem] font-semibold',
            b.tone === 'positive' && 'bg-[var(--sage-soft)] text-[var(--sage-deep)]',
            b.tone === 'neutral' && 'bg-[var(--paper-sunk)] text-[var(--ink-soft)]',
            b.tone === 'caution' && 'bg-[var(--u-urgent-soft)] text-[var(--u-urgent)]',
          )}
        >
          {b.label}
        </li>
      ))}
    </ul>
  );
}

export function TravelLine({ facility, className }: { facility: RankedFacility; className?: string }) {
  const { t } = useApp();
  // Distances count up when a filter changes, so a shifting list reads as a
  // recalculation rather than a set of numbers that silently swapped.
  const distance = facility.travel.distanceMeters / 1000;
  return (
    <p className={cn('flex items-baseline gap-1.5 text-[var(--ink-soft)] tabular-nums', className)}>
      <span className="text-[1.05rem] font-bold text-[var(--ink)]">
        <AnimatedNumber value={distance} decimals={distance < 10 ? 1 : 0} /> {t('km')}
      </span>
      <span aria-hidden>·</span>
      <span>
        {facility.travel.estimated ? `${t('approx')} ` : ''}
        <AnimatedNumber value={minutes(facility.travel.durationSeconds)} /> {t('min')} {t('byRoad')}
      </span>
    </p>
  );
}

export function FacilityCard({
  facility,
  specialty,
  rank,
  compact,
  selectable,
  selected,
  onSelect,
  onDirections,
}: {
  facility: RankedFacility;
  specialty?: string;
  rank?: number;
  compact?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onDirections?: () => void;
}) {
  const { t, toggleSaved, isSaved } = useApp();
  const toast = useToast();
  const reduce = useReducedMotion() ?? false;
  const saved = isSaved(facility.id);
  const phone = facility.emergencyPhone ?? facility.phone;
  const href = `/care/${encodeURIComponent(facility.id)}${specialty ? `?specialty=${specialty}` : ''}`;

  return (
    <article
      className={cn(
        'sv-card sv-lift group relative rounded-[var(--radius-lg)] border p-4',
        selected ? 'border-[var(--sage)] ring-2 ring-[var(--sage)]/30' : 'border-[var(--line)]',
      )}
      aria-labelledby={`f-${facility.id}`}
    >
      <div className="flex items-start gap-3">
        {rank !== undefined && (
          <span
            aria-hidden
            className={cn(
              'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums',
              rank === 1 ? 'bg-[var(--sage)] text-[var(--paper-raised)]' : 'bg-[var(--paper-sunk)] text-[var(--ink-soft)]',
            )}
          >
            {rank}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 id={`f-${facility.id}`} className="text-[1.08rem] leading-snug font-bold text-[var(--ink)]">
            <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
              {facility.name}
            </Link>
          </h3>
          <TravelLine facility={facility} className="mt-1" />
          {!compact && <p className="mt-1 line-clamp-1 text-sm text-[var(--ink-faint)]">{facility.address}</p>}
          <div className="mt-2.5">
            <ReasonPills facility={facility} {...(specialty ? { specialty } : {})} max={compact ? 2 : 4} />
          </div>
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-[var(--ink-faint)]" aria-hidden />
      </div>

      <div className="relative z-10 mt-3.5 flex flex-wrap items-center gap-2">
        <a
          href={facility.directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onDirections}
          className="sv-press inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--sage)] px-4 text-[0.95rem] font-semibold text-[var(--paper-raised)] hover:bg-[var(--sage-deep)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
        >
          <Navigation className="size-4" aria-hidden /> {t('directions')}
        </a>
        {phone && (
          <a
            href={telHref(phone)}
            className="sv-press inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--paper-raised)] px-4 text-[0.95rem] font-semibold text-[var(--ink)] hover:border-[var(--line-strong)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
          >
            <Phone className="size-4" aria-hidden /> {t('call')}
          </a>
        )}
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? t('saved') : t('save')}
          onClick={() => {
            const now = toggleSaved(facility);
            toast(now ? t('saved') : t('removed'));
          }}
          className="inline-flex size-11 items-center justify-center rounded-full text-[var(--ink-soft)] hover:bg-[var(--paper-sunk)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
        >
          {/* The bookmark pops on save — the one place a little overshoot is earned. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={saved ? 'on' : 'off'}
              initial={reduce ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduce ? { duration: 0.15 } : POP}
              className="flex"
            >
              {saved ? <BookmarkCheck className="size-5 text-[var(--sage)]" aria-hidden /> : <Bookmark className="size-5" aria-hidden />}
            </motion.span>
          </AnimatePresence>
        </button>
        {selectable && (
          <label className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-semibold text-[var(--ink-soft)] hover:bg-[var(--paper-sunk)]">
            <input type="checkbox" checked={selected} onChange={onSelect} className="size-5 accent-[var(--sage)]" />
            {t('compare')}
          </label>
        )}
      </div>
    </article>
  );
}
