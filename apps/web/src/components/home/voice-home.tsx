'use client';

import type { EmergencyPayload, LanguagePreference, TurnResponse } from '@sanjeevani/types';
import { Chip, Sheet, cn } from '@sanjeevani/ui';
import { ChevronRight, CloudOff, Languages, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrandMark, HomeDock, OfflineBanner, SosButton } from '@/components/chrome';
import { EmergencyTakeover, type EmergencyView } from '@/components/emergency/emergency-takeover';
import { LocationPrompt } from '@/components/location-prompt';
import { VoiceOrb, type OrbMode } from '@/components/orb/voice-orb';
import { useApp } from '@/components/providers/app-provider';
import { TracePanel } from '@/components/trace/trace-panel';
import { TriageSummary } from '@/components/triage/triage-summary';
import { EXAMPLES, LANGUAGE_NAMES, type MessageKey } from '@/lib/i18n';
import { URGENCY_STYLE, km, minutes } from '@/lib/present';
import { useVoiceAgent } from '@/lib/voice/use-voice-agent';
import { Captions } from './captions';
import { Composer } from './composer';

const LANGUAGE_CYCLE: LanguagePreference[] = ['auto', 'hi', 'hinglish', 'en'];
const SHORT_LANGUAGE: Record<LanguagePreference, string> = { auto: 'Auto', hi: 'हिं', hinglish: 'Hing', en: 'EN' };

function useOrbSize() {
  const [size, setSize] = useState(300);
  useEffect(() => {
    const update = () => setSize(Math.round(Math.max(220, Math.min(window.innerWidth * 0.78, window.innerHeight * 0.42, 380))));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

export function VoiceHome() {
  const app = useApp();
  const { t, prefs, updatePrefs, uiLanguage, capabilities, location, reducedMotion } = app;
  const [emergency, setEmergency] = useState<EmergencyView | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [locationDismissed, setLocationDismissed] = useState(false);
  const orbSize = useOrbSize();

  const onEmergency = useCallback((payload: EmergencyPayload, response: TurnResponse) => {
    setSummaryOpen(false);
    setEmergency({ payload, facilities: response.facilities, conversationId: response.conversationId });
  }, []);

  const agent = useVoiceAgent({ onEmergency });
  const { state, latest, latestResponse, interim, greeting } = agent;

  const orbMode: OrbMode = emergency ? 'emergency' : state === 'idle' ? 'idle' : state;

  const statusText = useMemo(() => {
    if (state === 'listening') return t('listening');
    if (state === 'processing') return t('thinking');
    if (state === 'speaking') return t('speaking');
    if (agent.awaitingReply) return t('waiting');
    return t('tapToSpeak');
  }, [state, agent.awaitingReply, t]);

  const orbLabel = state === 'listening' ? t('stopListening') : state === 'speaking' ? t('interrupt') : t('startListening');

  // Keyboard: Space to talk, Escape to stop — without stealing keys from inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="alertdialog"]') || target.tagName === 'BUTTON' || target.tagName === 'A')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        void agent.primaryAction();
      } else if (e.key === 'Escape') {
        agent.cancelAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [agent]);

  // Hand-offs from other screens: a tip tapped on the Guide, or a conversation
  // being re-checked from the summary. Both are consumed once and never repeated.
  const [rechecking, setRechecking] = useState(false);
  useEffect(() => {
    let prefill: string | null = null;
    let resumeId: string | null = null;
    try {
      prefill = sessionStorage.getItem('sv:prefill');
      if (prefill) sessionStorage.removeItem('sv:prefill');
      resumeId = sessionStorage.getItem('sv:resume');
      if (resumeId) sessionStorage.removeItem('sv:resume');
    } catch {
      /* storage blocked — nothing to carry over */
    }
    if (resumeId) {
      agent.resume(resumeId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hand-off from another screen
      setRechecking(true);
    } else if (prefill) {
      void agent.send(prefill, 'text');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Sends the re-check answer into the resumed conversation. */
  const sendRecheck = (state: 'recheckBetter' | 'recheckSame' | 'recheckWorse') => {
    setRechecking(false);
    void agent.send(t('recheckOpener', { state: t(state) }), 'quick_reply');
  };

  // Re-run the last turn once location becomes available, so advice gains nearby care.
  const needsLocation = latestResponse?.facilitiesStatus === 'needs_location' && !location;
  useEffect(() => {
    if (!location || !latestResponse || latestResponse.facilitiesStatus !== 'needs_location' || latestResponse.phase === 'emergency') return;
    if (latestResponse.phase === 'advice' || latestResponse.phase === 'facility_search') {
      void agent.send(uiLanguage === 'hi' ? 'पास के अस्पताल दिखाओ' : uiLanguage === 'hinglish' ? 'paas ke hospital dikhao' : 'show nearby hospitals', 'quick_reply');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const userText = state === 'listening' ? interim || null : (latest?.user ?? (interim || null));
  const assistantText = state === 'processing' ? null : (latest?.response?.reply.display ?? greeting);
  const triage = latestResponse?.triage && latestResponse.phase !== 'emergency' ? latestResponse.triage : null;
  const topFacility = latestResponse?.facilities[0];
  const quickReplies = state === 'idle' || state === 'speaking' ? (latest?.response?.quickReplies ?? []) : [];
  const isFresh = agent.exchanges.length === 0 && !greeting;
  const examples = EXAMPLES[uiLanguage];

  const cycleLanguage = () => {
    const idx = LANGUAGE_CYCLE.indexOf(prefs.language);
    updatePrefs({ language: LANGUAGE_CYCLE[(idx + 1) % LANGUAGE_CYCLE.length]! });
  };

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="sv-ambient" aria-hidden />
      <div className="sv-grain" aria-hidden />
      <OfflineBanner />
      <a href="#orb" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-[var(--ink)] focus:px-4 focus:py-2 focus:text-[var(--paper)]">
        {t('startListening')}
      </a>

      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2">
          <BrandMark />
          {capabilities?.demoMode && (
            <span className="hidden rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.7rem] font-bold tracking-wider text-[var(--ink-faint)] uppercase sm:inline">
              {t('demoBadge')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cycleLanguage}
            aria-label={`${t('language')}: ${prefs.language === 'auto' ? t('languageAuto') : LANGUAGE_NAMES[prefs.language]}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--paper-raised)] px-3 text-sm font-semibold text-[var(--ink)] hover:border-[var(--line-strong)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
          >
            <Languages className="size-4 text-[var(--sage)]" aria-hidden />
            <span className="hidden sm:inline">{prefs.language === 'auto' ? t('languageAuto') : LANGUAGE_NAMES[prefs.language]}</span>
            <span className="sm:hidden" aria-hidden>
              {SHORT_LANGUAGE[prefs.language]}
            </span>
          </button>
          <SosButton onOpen={() => setEmergency({ payload: null, facilities: [], conversationId: agent.conversationId })} />
        </div>
      </header>

      <main id="main" className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4">
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 py-4">
          <AnimatePresence>
            {isFresh && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                className="flex flex-col items-center gap-3"
              >
                <p className="flex items-center gap-2 text-[0.68rem] font-bold tracking-[0.22em] text-[var(--ink-faint)] uppercase">
                  {['voice', 'understand', 'triage', 'care'].map((step, i) => (
                    <span key={step} className="flex items-center gap-2">
                      {i > 0 && <span className="h-px w-3 bg-[var(--line-strong)]" aria-hidden />}
                      {step}
                    </span>
                  ))}
                </p>
                <h1 className="font-display max-w-md text-center text-[calc(1.85rem*var(--text-scale))] leading-[1.12] text-balance text-[var(--ink)] sm:text-[calc(2.3rem*var(--text-scale))]">
                  {t('tagline')}
                </h1>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            id="orb"
            type="button"
            onClick={() => void agent.primaryAction()}
            aria-label={orbLabel}
            aria-pressed={state === 'listening'}
            aria-busy={state === 'processing'}
            disabled={!capabilities && !app.capabilitiesError}
            whileTap={reducedMotion ? undefined : { scale: 0.97 }}
            className="relative rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--paper)] disabled:cursor-wait"
            style={{ width: orbSize, height: orbSize }}
          >
            <VoiceOrb mode={orbMode} level={agent.level} reducedMotion={reducedMotion} size={orbSize} pulse={agent.exchanges.length} />
          </motion.button>

          <div className="flex flex-col items-center gap-1.5">
            <p
              aria-live="polite"
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[calc(0.98rem*var(--text-scale))] font-semibold tracking-wide transition-colors',
                state === 'idle'
                  ? 'text-[var(--sage-deep)]'
                  : 'border border-[var(--line)] bg-[var(--paper-raised)]/80 text-[var(--sage-deep)] backdrop-blur-sm',
              )}
            >
              {state !== 'idle' && (
                <span aria-hidden className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--sage)]/60 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2 rounded-full bg-[var(--sage)]" />
                </span>
              )}
              {statusText}
            </p>
            {isFresh && state === 'idle' && <span className="text-sm text-[var(--ink-faint)]">{t('tapToSpeakHint')}</span>}
          </div>

          {/*
            Says plainly that the answer came from the phone, and what that costs.
            A silent degradation would be worse than the degradation itself.
          */}
          {agent.answeredOffline && (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="sv-card mx-auto flex max-w-md gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] p-3.5 text-left"
            >
              <CloudOff className="mt-0.5 size-5 shrink-0 text-[var(--u-urgent)]" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-[var(--ink)]">{t('offlineAnswer')}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-[var(--ink-soft)]">{t('offlineAnswerHelp')}</p>
              </div>
            </motion.div>
          )}

          <Captions
            userText={userText}
            assistantText={assistantText}
            assistantKey={latest?.response?.turnId ?? greeting ?? 'none'}
            thinking={state === 'processing'}
          />

          {/* Re-check: three fixed answers, so a follow-up never depends on recall or typing. */}
          {rechecking && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 text-center">
              <p className="text-[1.05rem] text-[var(--ink)]">{t('checkAgainHint')}</p>
              <ul className="flex flex-wrap justify-center gap-2">
                {(['recheckBetter', 'recheckSame', 'recheckWorse'] as const).map((key) => (
                  <li key={key}>
                    <Chip onClick={() => sendRecheck(key)}>{t(key)}</Chip>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {quickReplies.length > 0 && (
            <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex flex-wrap justify-center gap-2" aria-label="Quick replies">
              {quickReplies.map((q) => (
                <li key={q.value}>
                  <Chip onClick={() => void agent.send(q.value, 'quick_reply')}>{q.label}</Chip>
                </li>
              ))}
            </motion.ul>
          )}

          {isFresh && state === 'idle' && (
            <div className="mt-2 flex w-full max-w-lg flex-col items-center gap-2">
              <p className="text-xs font-bold tracking-[0.14em] text-[var(--ink-faint)] uppercase">{t('tryExample')}</p>
              <ul className="flex flex-wrap justify-center gap-2">
                {examples.map((ex) => (
                  <li key={ex}>
                    <Chip onClick={() => void agent.send(ex, 'text')} className="text-[var(--ink-soft)]">
                      “{ex}”
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="w-full max-w-xl space-y-3 pb-3">
          <AnimatePresence>
            {needsLocation && !locationDismissed && (
              <motion.div key="loc" exit={{ opacity: 0 }}>
                <LocationPrompt compact={false} />
                <button type="button" onClick={() => setLocationDismissed(true)} className="mt-1 min-h-11 w-full text-sm font-semibold text-[var(--ink-faint)]">
                  {t('notNow')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {triage && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              aria-label={t('summary')}
              className={cn('sv-card overflow-hidden rounded-[var(--radius-lg)] border', URGENCY_STYLE[triage.urgency].ring)}
            >
              <button type="button" onClick={() => setSummaryOpen(true)} className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]">
                <span className={cn('h-10 w-1.5 shrink-0 rounded-full', URGENCY_STYLE[triage.urgency].bar)} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-[1.05rem] font-bold', URGENCY_STYLE[triage.urgency].fg)}>
                    {t(`urgency_${triage.urgency}` as MessageKey)}
                  </span>
                  {topFacility ? (
                    <span className="block truncate text-sm text-[var(--ink-soft)]">
                      {topFacility.name} · {km(topFacility.travel.distanceMeters)} {t('km')} · {topFacility.travel.estimated ? `${t('approx')} ` : ''}
                      {minutes(topFacility.travel.durationSeconds)} {t('min')}
                    </span>
                  ) : (
                    <span className="block truncate text-sm text-[var(--ink-soft)]">{triage.recommendedAction}</span>
                  )}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--sage)]">
                  <span className="hidden sm:inline">{t('viewSummary')}</span> <ChevronRight className="size-5" aria-hidden />
                </span>
              </button>
            </motion.section>
          )}

          <div className="flex items-center justify-between gap-2">
            {agent.exchanges.length > 0 ? (
              <button
                type="button"
                onClick={agent.reset}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-[var(--ink-soft)] hover:bg-[var(--paper-sunk)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
              >
                <RotateCcw className="size-4" aria-hidden /> {t('newConversation')}
              </button>
            ) : (
              <span />
            )}
            <HomeDock onType={() => agent.setComposerOpen(true)} />
          </div>
          <p className="text-center text-xs leading-relaxed text-[var(--ink-faint)]">
            {t('disclaimer')}{' '}
            <Link href="/privacy" className="underline underline-offset-2">
              {t('privacy')}
            </Link>
          </p>
        </div>
      </main>

      <Composer open={agent.composerOpen} onClose={() => agent.setComposerOpen(false)} onSend={(text) => void agent.send(text, 'text')} />

      <Sheet open={summaryOpen && Boolean(triage)} onClose={() => setSummaryOpen(false)} title={t('summary')}>
        {triage && latestResponse && (
          <div className="space-y-4">
            <TriageSummary triage={triage} facilities={latestResponse.facilities} />
            {latestResponse.facilities.length > 0 && (
              <Link
                href={`/care?type=${triage.requiredFacilityType}&specialty=${triage.specialty}&urgency=${triage.urgency}`}
                className="flex min-h-12 items-center justify-center rounded-full border border-[var(--line)] font-semibold text-[var(--ink)] hover:border-[var(--line-strong)]"
              >
                {t('seeAllNearby')}
              </Link>
            )}
            <TracePanel trace={latestResponse.trace} totalMs={latestResponse.totalMs} />
          </div>
        )}
      </Sheet>

      <EmergencyTakeover
        view={emergency}
        onClose={(dismissed) => {
          setEmergency(null);
          if (dismissed) agent.interrupt();
        }}
      />

      {!capabilities && app.capabilitiesError && (
        <p role="alert" className="fixed inset-x-4 bottom-4 mx-auto max-w-md rounded-[var(--radius-md)] bg-[var(--ink)] p-3 text-center text-sm text-[var(--paper)]">
          {t('somethingWrong')}{' '}
          <button type="button" className="font-bold underline" onClick={() => window.location.reload()}>
            {t('retry')}
          </button>
        </p>
      )}
      <PrefetchSession />
    </div>
  );
}

/** Warms the anonymous session so the first spoken turn doesn't wait for it. */
function PrefetchSession() {
  useEffect(() => {
    void import('@/lib/api').then(({ ensureSession }) => ensureSession().catch(() => undefined));
  }, []);
  return null;
}

