'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

interface Settled<T> {
  key: string;
  data?: T;
  error?: string;
}

/**
 * Loads data for a key and keeps loading/error state derived from it, so screens never
 * show stale results for a different query. Pass `null` as the key to skip loading.
 */
export function useResource<T>(key: string | null, loader: () => Promise<T>, fallbackError: string) {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  const errorRef = useRef(fallbackError);
  useEffect(() => {
    loaderRef.current = loader;
    errorRef.current = fallbackError;
  });

  const fullKey = key === null ? null : `${key}#${nonce}`;

  useEffect(() => {
    if (fullKey === null) return;
    let cancelled = false;
    loaderRef.current().then(
      (data) => {
        if (!cancelled) setSettled({ key: fullKey, data });
      },
      (error: unknown) => {
        if (!cancelled) setSettled({ key: fullKey, error: error instanceof ApiError ? error.message : errorRef.current });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fullKey]);

  const current = settled?.key === fullKey ? settled : null;
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data: current?.data,
    error: current?.error ?? null,
    loading: fullKey !== null && current === null,
    reload,
  };
}
