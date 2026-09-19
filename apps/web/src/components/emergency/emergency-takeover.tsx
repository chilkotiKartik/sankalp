'use client';

import { INDIA_EMERGENCY_CONTACTS } from '@sanjeevani/config';
import type { EmergencyPayload, RankedFacility } from '@sanjeevani/types';
import { MessageSquare, Navigation, Phone, Share2, UserRound, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/providers/app-provider';
import { useToast } from '@/components/providers/toast-provider';
import { api } from '@/lib/api';
import { takeover } from '@/lib/motion';
import { km, minutes, telHref } from '@/lib/present';

export interface EmergencyView {
  payload: EmergencyPayload | null;
  facilities: RankedFacility[];
  conversationId: string | null;
}

/**
 * Full-screen emergency mode. One dominant action (call), then the few things that
 * matter: what to do now, where to go, and sharing location. Nothing else.
 */
export function EmergencyTakeover({ view, onClose }: { view: EmergencyView | null; onClose: (dismissed: boolean) => void }) {
  const { t, location, requestLocation, prefs } = useApp();
  const toast = useToast();
  const reduce = useReducedMotion();
  const callRef = useRef<HTMLAnchorElement>(null);
  const [fetched, setFetched] = useState<{ view: EmergencyView; facility: RankedFacility | null } | null>(null);
  const payload = view?.payload ?? null;
  const nearest = view?.facilities[0] ?? (fetched && fetched.view === view ? fetched.facility : null);
  const contacts = payload?.contacts ?? INDIA_EMERGENCY_CONTACTS;
  const primary = contacts.find((c) => c.primary) ?? contacts[0]!;
  const others = contacts.filter((c) => c.number !== primary.number);

  useEffect(() => {
    if (!view) return;
    callRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view, onClose]);

  // Manual SOS or a response without facilities: look up the nearest emergency department ourselves.
  useEffect(() => {
    if (!view || view.facilities.length > 0 || !location || payload?.category === 'self_harm') return;
    let cancelled = false;
    api
      .facilities({ lat: location.lat, lng: location.lng, type: 'emergency_department', urgency: 'emergency', limit: 1 })
      .then((r) => {
        if (!cancelled) setFetched({ view, facility: r.facilities[0] ?? null });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [view, location, payload?.category]);

  const log = (action: 'call_initiated' | 'location_shared' | 'directions_opened' | 'dismissed', number?: string) => {
    void api
      .emergencyAction({
        action,
        ...(view?.conversationId ? { conversationId: view.conversationId } : {}),
        ...(payload?.category ? { category: payload.category } : {}),
        ...(number ? { contactNumber: number } : {}),
      })
      .catch(() => undefined);
  };

  const contact = prefs.emergencyContact;

  /**
   * Opens the phone's SMS composer, pre-filled with a map link. It never sends
   * anything by itself — the person still presses send — and no number or message
   * reaches our server.
   */
  const textLocation = async () => {
    if (!contact) return;
    const loc = location ?? (await requestLocation());
    const url = loc
      ? `https://www.google.com/maps/search/?api=1&query=${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`
      : '';
    log('location_shared');
    const body = url ? t('smsBody', { url }) : t('emergencyTitle');
    // `?&body=` is the form both iOS and Android accept.
    window.location.href = `sms:${contact.phone}?&body=${encodeURIComponent(body)}`;
  };

  const shareLocation = async () => {
    const loc = location ?? (await requestLocation());
    if (!loc) {
      toast(t('locationDenied'), 'error');
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`;
    log('location_shared');
    try {
      if (navigator.share) {
        await navigator.share({ title: t('emergencyTitle'), text: t('emergencyTitle'), url });
        return;
      }
    } catch {
      /* user cancelled share sheet — fall back to copying */
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(t('locationCopied'));
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  };

  return (
    <AnimatePresence>
      {view && (
        <motion.div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="em-title"
          aria-describedby="em-steps"
          className="fixed inset-0 z-50 overflow-y-auto bg-[var(--paper)]"
          variants={takeover(reduce ?? false)}
          initial="hidden"
          animate="shown"
          exit="exit"
        >
          <div className="relative overflow-hidden bg-[var(--sos)] px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8 text-white">
            {/* Depth in the red field: one warm light from the top-left, one cool from the right. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{
                background:
                  'radial-gradient(60% 70% at 12% 0%, rgba(255,255,255,0.22), transparent 70%), radial-gradient(50% 60% at 100% 40%, rgba(0,0,0,0.25), transparent 70%)',
              }}
            />
            <div className="relative mx-auto max-w-xl">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold tracking-[0.14em] uppercase opacity-90">{t('emergencyTitle')}</p>
                <button
                  type="button"
                  onClick={() => onClose(false)}
                  aria-label={t('close')}
                  className="inline-flex size-11 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              <h2 id="em-title" className="font-display mt-3 text-[2rem] leading-tight">
                {payload?.headline ?? t('emergencySub')}
              </h2>
              {payload && <p className="mt-1 text-white/85">{t('emergencySub')}</p>}

              <a
                ref={callRef}
                href={telHref(primary.number)}
                onClick={() => log('call_initiated', primary.number)}
                className="mt-6 flex min-h-20 items-center justify-center gap-3 rounded-[var(--radius-xl)] bg-white text-[1.6rem] font-extrabold text-[var(--sos)] shadow-[0_18px_40px_-16px_rgb(0_0_0/0.45)] transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
              >
                <span className="relative flex size-11 items-center justify-center rounded-full bg-[var(--sos)] text-white">
                  <span className="absolute inset-0 animate-ping rounded-full bg-[var(--u-emergency)]/40 motion-reduce:animate-none" aria-hidden />
                  <Phone className="relative size-5" aria-hidden />
                </span>
                {t('callNow', { number: primary.number })}
              </a>
              <p className="mt-2 text-center text-sm text-white/85">{primary.description}</p>
            </div>
          </div>

          <div className="mx-auto max-w-xl space-y-6 px-5 py-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
            {/*
              The trusted contact sits right under 112 — second only to the emergency
              services themselves, because the person who can actually come is often
              the one who gets there first. Both actions are plain links, so they work
              with no network and no JavaScript beyond the click handler.
            */}
            {contact && (
              <section aria-labelledby="em-contact" className="sv-card rounded-[var(--radius-lg)] border border-[var(--line)] p-4">
                <h3 id="em-contact" className="flex items-center gap-2 text-[0.78rem] font-bold tracking-[0.12em] text-[var(--ink-faint)] uppercase">
                  <UserRound className="size-4" aria-hidden /> {t('emergencyContactTitle')}
                </h3>
                <p className="mt-1.5 text-lg font-bold text-[var(--ink)]">
                  {contact.name}
                  {contact.relation && <span className="font-normal text-[var(--ink-soft)]"> · {contact.relation}</span>}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={telHref(contact.phone)}
                    onClick={() => log('call_initiated')}
                    className="sv-press inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--ink)] px-5 font-semibold text-[var(--paper)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
                  >
                    <Phone className="size-4" aria-hidden /> {t('callContact', { name: contact.name })}
                  </a>
                  <button
                    type="button"
                    onClick={textLocation}
                    className="sv-press inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--line)] px-5 font-semibold text-[var(--ink)] hover:bg-[var(--paper-sunk)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
                  >
                    <MessageSquare className="size-4" aria-hidden /> {t('textLocationTo', { name: contact.name })}
                  </button>
                </div>
              </section>
            )}

            {payload && payload.instructions.length > 0 && (
              <ol id="em-steps" className="space-y-3">
                {payload.instructions.map((step, i) => (
                  <li key={step} className="flex gap-3 text-[1.08rem] leading-snug text-[var(--ink)]">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--u-emergency-soft)] font-bold text-[var(--u-emergency)] tabular-nums">
                      {i + 1}
                    </span>
                    <span className="pt-1">{step}</span>
                  </li>
                ))}
              </ol>
            )}

            <button
              type="button"
              onClick={shareLocation}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-full border-2 border-[var(--ink)] text-base font-bold text-[var(--ink)] hover:bg-[var(--paper-sunk)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
            >
              <Share2 className="size-5" aria-hidden /> {t('shareMyLocation')}
            </button>

            {nearest && (
              <section aria-labelledby="em-nearest" className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper-raised)] p-4">
                <h3 id="em-nearest" className="text-[0.78rem] font-bold tracking-[0.12em] text-[var(--ink-faint)] uppercase">
                  {t('nearestEmergency')}
                </h3>
                <p className="mt-1.5 text-lg font-bold text-[var(--ink)]">{nearest.name}</p>
                <p className="text-[var(--ink-soft)] tabular-nums">
                  {km(nearest.travel.distanceMeters)} {t('km')} · {nearest.travel.estimated ? `${t('approx')} ` : ''}
                  {minutes(nearest.travel.durationSeconds)} {t('min')}
                  {nearest.emergency24x7 ? ` · ${t('emergency24x7')}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={nearest.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => log('directions_opened')}
                    className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--ink)] px-5 font-semibold text-[var(--paper)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
                  >
                    <Navigation className="size-4" aria-hidden /> {t('directions')}
                  </a>
                  {(nearest.emergencyPhone ?? nearest.phone) && (
                    <a
                      href={telHref((nearest.emergencyPhone ?? nearest.phone)!)}
                      onClick={() => log('call_initiated', nearest.emergencyPhone ?? nearest.phone ?? undefined)}
                      className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--line)] px-5 font-semibold text-[var(--ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
                    >
                      <Phone className="size-4" aria-hidden /> {nearest.emergencyPhone ? t('callEmergencyLine') : t('call')}
                    </a>
                  )}
                </div>
              </section>
            )}

            {others.length > 0 && (
              <section aria-labelledby="em-others">
                <h3 id="em-others" className="text-[0.78rem] font-bold tracking-[0.12em] text-[var(--ink-faint)] uppercase">
                  {t('otherNumbers')}
                </h3>
                <ul className="mt-2 divide-y divide-[var(--line)] rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper-raised)]">
                  {others.map((c) => (
                    <li key={c.number}>
                      <a
                        href={telHref(c.number)}
                        onClick={() => log('call_initiated', c.number)}
                        className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 hover:bg-[var(--paper-sunk)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
                      >
                        <span>
                          <span className="block font-semibold text-[var(--ink)]">{c.label}</span>
                          <span className="block text-sm text-[var(--ink-soft)]">{c.description}</span>
                        </span>
                        <span className="text-xl font-bold text-[var(--ink)] tabular-nums">{c.number}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {payload && (
              <button
                type="button"
                onClick={() => {
                  log('dismissed');
                  onClose(true);
                }}
                className="mx-auto block min-h-11 rounded-full px-4 text-sm font-semibold text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--ink)]"
              >
                {t('notEmergency')}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
