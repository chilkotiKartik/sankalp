'use client';

import { DISCLAIMER } from '@sanjeevani/medical-safety';
import type { EmergencyPayload, Language, TurnResponse } from '@sanjeevani/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/providers/app-provider';
import { useToast } from '@/components/providers/toast-provider';
import { ApiError, api } from '@/lib/api';
import { BrowserRecognizer, BrowserSttError, browserSttSupported, recognitionLang } from './browser-stt';
import { SpeechPlayer } from './player';
import { MicError, MicRecorder } from './recorder';

export type AgentState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface Exchange {
  id: string;
  user: string;
  response: TurnResponse | null;
}

const GREETING: Record<Language, string> = {
  en: 'Namaste, I’m Sanjeevani. Tell me what’s troubling you — in Hindi, English or both.',
  hi: 'नमस्ते, मैं संजीवनी हूं। बताइए क्या तकलीफ़ है — हिंदी या अंग्रेज़ी, जैसे आप चाहें।',
  hinglish: 'Namaste, main Sanjeevani hoon. Bataiye kya takleef hai — Hindi ya English, jaise aap chahein.',
};

export function useVoiceAgent(options: { onEmergency: (payload: EmergencyPayload, response: TurnResponse) => void }) {
  const app = useApp();
  const toast = useToast();
  const [state, setState] = useState<AgentState>('idle');
  const [interim, setInterim] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);

  const level = useRef(0);
  const stateRef = useRef<AgentState>('idle');
  const recorder = useRef<MicRecorder | null>(null);
  const recognizer = useRef<BrowserRecognizer | null>(null);
  const player = useRef<SpeechPlayer | null>(null);
  const turnAbort = useRef<AbortController | null>(null);
  const serverSttFailed = useRef(false);
  const serverTtsFailed = useRef(false);
  const ttsWarned = useRef(false);
  /** True once a turn has been answered by the in-browser engine. */
  const offlineRef = useRef(false);
  const [answeredOffline, setAnsweredOffline] = useState(false);

  // Pull the offline engine into cache while the network still works, so it is there
  // when it stops. Imported dynamically and on idle, so none of it — including its Zod
  // dependency — is on the first-paint path.
  useEffect(() => {
    const start = () => {
      void import('@/lib/offline/offline-engine')
        .then((m) => m.warmOfflineEngine())
        .catch(() => undefined);
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (idle) idle(start, { timeout: 5000 });
    else window.setTimeout(start, 3000);
  }, []);
  const conversationRef = useRef<string | null>(null);
  const lastLanguage = useRef<Language>('en');
  const appRef = useRef(app);
  const onEmergencyRef = useRef(options.onEmergency);
  useEffect(() => {
    appRef.current = app;
    onEmergencyRef.current = options.onEmergency;
  });

  const setLevel = useCallback((v: number) => {
    level.current = v;
  }, []);

  const transition = useCallback((next: AgentState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    player.current = new SpeechPlayer(setLevel);
    return () => {
      player.current?.dispose();
      recorder.current?.cancel();
      recognizer.current?.abort();
      turnAbort.current?.abort();
    };
  }, [setLevel]);

  const speak = useCallback(
    async (text: string, language: Language) => {
      const { prefs, capabilities } = appRef.current;
      if (!prefs.voiceReplies || !text) return;
      const p = player.current;
      if (!p) return;
      transition('speaking');
      const rate = prefs.speechRate === 'slow' ? 0.85 : 1;
      try {
        // Server audio is a download. On a metered or patchy connection the built-in
        // browser voice says the same words for nothing, so data saver takes it.
        const serverTtsAvailable = capabilities?.tts === 'elevenlabs' || capabilities?.tts === 'gemini';
        if (serverTtsAvailable && !prefs.dataSaver && !serverTtsFailed.current) {
          try {
            const res = await api.speak(text, language);
            if (stateRef.current !== 'speaking') return;
            await p.playResponse(res);
            return;
          } catch (error) {
            if (stateRef.current !== 'speaking') return;
            if (error instanceof ApiError && (error.status === 501 || error.status === 502 || error.status === 401)) {
              serverTtsFailed.current = true;
            }
          }
        }
        await p.playBrowser(text, language, rate);
      } catch {
        // Text is always on screen; tell the user once, not on every turn.
        if (!ttsWarned.current) {
          ttsWarned.current = true;
          toast(appRef.current.t('ttsFailed'));
        }
      }
    },
    [toast, transition],
  );

  const ensureConversation = useCallback(async () => {
    if (conversationRef.current) return conversationRef.current;
    const { id } = await api.createConversation(appRef.current.prefs.language);
    conversationRef.current = id;
    setConversationId(id);
    return id;
  }, []);

  // Declared up-front so `send` and `listen` can reference each other.
  const listenRef = useRef<(opts?: { auto?: boolean }) => Promise<void>>(async () => undefined);
  const sendRef = useRef<(text: string, mode: 'voice' | 'text' | 'quick_reply', stt?: string | null) => Promise<void>>(async () => undefined);

  const send = useCallback(
    async (text: string, inputMode: 'voice' | 'text' | 'quick_reply', sttLanguage?: string | null) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      player.current?.stop();
      turnAbort.current?.abort();
      const abort = new AbortController();
      turnAbort.current = abort;
      transition('processing');
      setInterim('');
      setAwaitingReply(false);
      setGreeting(null);
      const exchangeId = `${Date.now()}`;
      setExchanges((prev) => [...prev.slice(-19), { id: exchangeId, user: trimmed, response: null }]);

      const { prefs, location } = appRef.current;
      let response: TurnResponse;
      try {
        const id = await ensureConversation();
        response = await api.sendTurn(
          id,
          {
            text: trimmed,
            inputMode,
            languagePreference: prefs.language,
            ...(sttLanguage ? { sttLanguage } : {}),
            ...(location ? { location } : {}),
          },
          abort.signal,
        );
      } catch (error) {
        if (abort.signal.aborted) return;
        if (error instanceof ApiError && error.code === 'not_found') {
          conversationRef.current = null;
          setConversationId(null);
        }

        /*
         * The server is unreachable. The safety rules do not need it, so run them here
         * rather than leaving someone with nothing. Only for transport failures — an
         * API that answered with a 4xx has made a decision, and second-guessing it in
         * the browser would be worse than surfacing it.
         */
        const transportFailure = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
        if (transportFailure) {
          try {
            const { offlineTurn } = await import('@/lib/offline/offline-engine');
            const offline = await offlineTurn({
              text: trimmed,
              inputMode,
              languagePreference: prefs.language,
              ...(sttLanguage ? { sttLanguage } : {}),
            });
            if (abort.signal.aborted) return;
            offlineRef.current = true;
            setAnsweredOffline(true);
            response = offline;
          } catch {
            // Offline triage could not load either — fall through to the error path.
            setExchanges((prev) => prev.filter((e) => e.id !== exchangeId));
            transition('idle');
            const message = error instanceof ApiError ? error.message : appRef.current.t('somethingWrong');
            toast(message, 'error', { label: appRef.current.t('retry'), onClick: () => void sendRef.current(trimmed, inputMode, sttLanguage) });
            return;
          }
        } else {
          setExchanges((prev) => prev.filter((e) => e.id !== exchangeId));
          transition('idle');
          toast(error.message, 'error', { label: appRef.current.t('retry'), onClick: () => void sendRef.current(trimmed, inputMode, sttLanguage) });
          return;
        }
      }
      if (abort.signal.aborted) return;

      lastLanguage.current = response.language;
      appRef.current.setConversationLanguage(response.language);
      setExchanges((prev) => prev.map((e) => (e.id === exchangeId ? { ...e, response } : e)));
      if (response.emergency) onEmergencyRef.current(response.emergency, response);

      await speak(response.reply.speech, response.language);
      if (turnAbort.current !== abort || stateRef.current === 'listening') return;
      transition('idle');

      const expectsAnswer = response.phase === 'follow_up' || response.phase === 'clarify' || (response.phase === 'advice' && response.facilities.length > 0);
      setAwaitingReply(expectsAnswer);
      if (expectsAnswer && appRef.current.prefs.autoListen && appRef.current.prefs.voiceReplies && !response.emergency) {
        void listenRef.current({ auto: true });
      }
    },
    [ensureConversation, speak, toast, transition],
  );

  const listen = useCallback(async ({ auto = false }: { auto?: boolean } = {}) => {
    const { capabilities, prefs, t } = appRef.current;
    const useServer = capabilities?.stt === 'elevenlabs' && !serverSttFailed.current && MicRecorder.isSupported();
    // Automatic turn-taking only continues when voice input can actually work.
    if (auto && !useServer && !browserSttSupported()) {
      setAwaitingReply(true);
      return;
    }
    player.current?.unlock();
    setInterim('');
    setAwaitingReply(false);

    if (useServer) {
      const rec = new MicRecorder();
      recorder.current = rec;
      transition('listening');
      let blob: Blob | null = null;
      try {
        blob = await rec.record({ onLevel: setLevel });
      } catch (error) {
        transition('idle');
        const kind = error instanceof MicError ? error.kind : 'failed';
        toast(kind === 'denied' ? t('micDenied') : t('micUnavailable'), 'error');
        if (!auto) setComposerOpen(true);
        return;
      } finally {
        recorder.current = null;
      }
      if (stateRef.current !== 'listening') return;
      if (!blob) {
        transition('idle');
        toast(t('didntCatch'));
        return;
      }
      transition('processing');
      try {
        const result = await api.transcribe(blob, prefs.language === 'auto' ? undefined : prefs.language);
        if (!result.text) {
          transition('idle');
          toast(t('didntCatch'));
          return;
        }
        setInterim(result.text);
        await send(result.text, 'voice', result.languageCode);
      } catch (error) {
        transition('idle');
        if (error instanceof ApiError && [501, 502, 504].includes(error.status) && browserSttSupported()) {
          serverSttFailed.current = true;
        }
        toast(error instanceof ApiError ? error.message : t('sttFailed'), 'error');
      }
      return;
    }

    if (!browserSttSupported()) {
      toast(t('noSpeechSupport'));
      setComposerOpen(true);
      return;
    }
    const rec = new BrowserRecognizer();
    recognizer.current = rec;
    transition('listening');
    try {
      const text = await rec.listen({
        lang: recognitionLang(prefs.language, lastLanguage.current),
        onInterim: setInterim,
        onLevel: setLevel,
      });
      recognizer.current = null;
      if (stateRef.current !== 'listening') return;
      if (!text) {
        transition('idle');
        toast(t('didntCatch'));
        return;
      }
      await send(text, 'voice');
    } catch (error) {
      recognizer.current = null;
      transition('idle');
      const code = error instanceof BrowserSttError ? error.code : 'failed';
      if (code === 'not-allowed' || code === 'service-not-allowed') toast(t('micDenied'), 'error');
      else if (code === 'audio-capture') toast(t('micUnavailable'), 'error');
      else if (code === 'network') toast(t('offline'), 'error');
      else toast(t('sttFailed'), 'error');
      if (code !== 'network' && !auto) setComposerOpen(true);
      if (auto) setAwaitingReply(true);
    }
  }, [send, setLevel, toast, transition]);
  useEffect(() => {
    listenRef.current = listen;
    sendRef.current = send;
  }, [listen, send]);

  const stopListening = useCallback(() => {
    recorder.current?.stop();
    recognizer.current?.stop();
  }, []);

  const interrupt = useCallback(() => {
    player.current?.stop();
    if (stateRef.current === 'speaking') transition('idle');
  }, [transition]);

  /** The single primary action: the orb. */
  const primaryAction = useCallback(async () => {
    const current = stateRef.current;
    player.current?.unlock();
    if (current === 'listening') return stopListening();
    if (current === 'processing') return;
    if (current === 'speaking') {
      interrupt();
      return listen();
    }
    const { prefs, updatePrefs, uiLanguage } = appRef.current;
    if (!prefs.greeted && exchanges.length === 0) {
      updatePrefs({ greeted: true });
      const text = GREETING[uiLanguage];
      setGreeting(text);
      await speak(text, uiLanguage);
      if (stateRef.current !== 'speaking' && stateRef.current !== 'idle') return;
      transition('idle');
      if (prefs.voiceReplies) return listen();
      return;
    }
    return listen();
  }, [exchanges.length, interrupt, listen, speak, stopListening, transition]);

  const cancelAll = useCallback(() => {
    recorder.current?.cancel();
    recognizer.current?.abort();
    player.current?.stop();
    turnAbort.current?.abort();
    transition('idle');
  }, [transition]);

  const reset = useCallback(() => {
    cancelAll();
    conversationRef.current = null;
    setConversationId(null);
    setExchanges([]);
    setInterim('');
    setGreeting(null);
    setAwaitingReply(false);
    offlineRef.current = false;
    setAnsweredOffline(false);
  }, [cancelAll]);

  /**
   * Continues an earlier conversation instead of starting a fresh one, so the
   * symptoms, duration and answered red-flag screens are all still in play. Used by
   * the "check again" action, where re-asking everything would be both tedious and
   * clinically worse than building on what is already known.
   */
  const resume = useCallback(
    (id: string) => {
      cancelAll();
      conversationRef.current = id;
      setConversationId(id);
      setExchanges([]);
      setInterim('');
      setGreeting(null);
      setAwaitingReply(false);
    },
    [cancelAll],
  );

  const latest = exchanges.at(-1) ?? null;
  const latestResponse = [...exchanges].reverse().find((e) => e.response)?.response ?? null;

  return {
    state,
    level,
    interim,
    exchanges,
    latest,
    latestResponse,
    awaitingReply,
    greeting,
    conversationId,
    answeredOffline,
    composerOpen,
    setComposerOpen,
    primaryAction,
    stopListening,
    interrupt,
    cancelAll,
    reset,
    resume,
    send,
    speak,
    disclaimer: DISCLAIMER.short,
  };
}
