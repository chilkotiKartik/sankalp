'use client';

import type { Capabilities, ClientLocation, Language, RankedFacility } from '@sanjeevani/types';
import { useReducedMotion } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { translate, type MessageKey } from '@/lib/i18n';
import {
  DEFAULT_PREFERENCES,
  LOCATION_KEY,
  PREFS_KEY,
  SAVED_KEY,
  applyPreferencesToDocument,
  readArray,
  readJson,
  removeKey,
  writeJson,
  type Preferences,
} from '@/lib/storage';

export type LocationStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable';

export interface SavedFacility {
  id: string;
  name: string;
  address: string;
  savedAt: string;
}

interface AppContextValue {
  prefs: Preferences;
  updatePrefs: (patch: Partial<Preferences>) => void;
  uiLanguage: Language;
  setConversationLanguage: (language: Language) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  reducedMotion: boolean;
  capabilities: Capabilities | null;
  capabilitiesError: boolean;
  location: ClientLocation | null;
  locationStatus: LocationStatus;
  requestLocation: () => Promise<ClientLocation | null>;
  applyDemoLocation: () => ClientLocation | null;
  clearLocation: () => void;
  saved: SavedFacility[];
  toggleSaved: (facility: Pick<RankedFacility, 'id' | 'name' | 'address'>) => boolean;
  isSaved: (id: string) => boolean;
  online: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [conversationLanguage, setConversationLanguage] = useState<Language>('en');
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [capabilitiesError, setCapabilitiesError] = useState(false);
  const [location, setLocation] = useState<ClientLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [saved, setSaved] = useState<SavedFacility[]>([]);
  const [online, setOnline] = useState(true);
  const systemReduced = useReducedMotion() ?? false;

  // Hydrate from browser storage once, after mount: reading it during render would make
  // the server and client markup differ.
  useEffect(() => {
    const stored = readJson('local', PREFS_KEY, DEFAULT_PREFERENCES);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from an external store
    setPrefs(stored);
    setSaved(readArray<SavedFacility>('local', SAVED_KEY));
    const loc = readJson<ClientLocation | null>('session', LOCATION_KEY, null);
    if (loc && typeof loc.lat === 'number') {
      setLocation(loc);
      setLocationStatus('ready');
    }
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    applyPreferencesToDocument(prefs);
  }, [prefs]);

  useEffect(() => {
    let cancelled = false;
    const load = (attempt: number) => {
      api
        .capabilities()
        .then((c) => {
          if (!cancelled) {
            setCapabilities(c);
            setCapabilitiesError(false);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setCapabilitiesError(true);
          if (attempt < 4) window.setTimeout(() => load(attempt + 1), 1500 * (attempt + 1));
        });
    };
    load(0);
    return () => {
      cancelled = true;
    };
  }, [online]);

  const updatePrefs = useCallback((patch: Partial<Preferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      writeJson('local', PREFS_KEY, next);
      return next;
    });
  }, []);

  const uiLanguage: Language = prefs.language === 'auto' ? conversationLanguage : prefs.language;

  useEffect(() => {
    document.documentElement.lang = uiLanguage === 'hi' ? 'hi' : uiLanguage === 'hinglish' ? 'hi-Latn' : 'en-IN';
  }, [uiLanguage]);

  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(uiLanguage, key, vars), [uiLanguage]);

  const storeLocation = useCallback((loc: ClientLocation) => {
    setLocation(loc);
    setLocationStatus('ready');
    writeJson('session', LOCATION_KEY, loc);
  }, []);

  const requestLocation = useCallback((): Promise<ClientLocation | null> => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('unavailable');
      return Promise.resolve(null);
    }
    setLocationStatus('requesting');
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc: ClientLocation = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyMeters: Math.min(100_000, Math.round(pos.coords.accuracy)),
            origin: 'gps',
          };
          storeLocation(loc);
          resolve(loc);
        },
        (err) => {
          setLocationStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 120_000 },
      );
    });
  }, [storeLocation]);

  const applyDemoLocation = useCallback((): ClientLocation | null => {
    if (!capabilities) return null;
    const loc: ClientLocation = { ...capabilities.region.demoLocation, origin: 'demo' };
    storeLocation(loc);
    return loc;
  }, [capabilities, storeLocation]);

  const clearLocation = useCallback(() => {
    setLocation(null);
    setLocationStatus('idle');
    removeKey('session', LOCATION_KEY);
  }, []);

  const toggleSaved = useCallback(
    (facility: Pick<RankedFacility, 'id' | 'name' | 'address'>) => {
      const exists = saved.some((s) => s.id === facility.id);
      const next = exists
        ? saved.filter((s) => s.id !== facility.id)
        : [{ id: facility.id, name: facility.name, address: facility.address, savedAt: new Date().toISOString() }, ...saved].slice(0, 20);
      setSaved(next);
      writeJson('local', SAVED_KEY, next);
      return !exists;
    },
    [saved],
  );

  const isSaved = useCallback((id: string) => saved.some((s) => s.id === id), [saved]);

  const value = useMemo<AppContextValue>(
    () => ({
      prefs,
      updatePrefs,
      uiLanguage,
      setConversationLanguage,
      t,
      reducedMotion: prefs.reduceMotion ?? systemReduced,
      capabilities,
      capabilitiesError,
      location,
      locationStatus,
      requestLocation,
      applyDemoLocation,
      clearLocation,
      saved,
      toggleSaved,
      isSaved,
      online,
    }),
    [prefs, updatePrefs, uiLanguage, t, systemReduced, capabilities, capabilitiesError, location, locationStatus, requestLocation, applyDemoLocation, clearLocation, saved, toggleSaved, isSaved, online],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
