import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, subscribeToChanges } from '../api';
import { serverNow, useClockOffset } from './clock';

/**
 * Data/hora atual (corrigida pelo servidor) que se atualiza sozinha,
 * para status e contagens. Também atualiza quando o relógio é ressincronizado.
 */
export function useNow(intervalMs = 30000): Date {
  const offset = useClockOffset();
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    setNow(serverNow());
    const t = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, offset]);
  return now;
}

type Remote<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  reload: () => Promise<void>;
  /** Para o "puxar para atualizar". */
  refresh: () => Promise<void>;
  setData: (v: T) => void;
};

/**
 * Carrega dados do servidor quando a tela ganha foco e, se `live`,
 * recarrega quando o banco avisa de mudanças (Supabase Realtime).
 */
export function useRemote<T>(loader: () => Promise<T>, deps: unknown[], opts: { live?: boolean } = {}): Remote<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const v = await loaderRef.current();
      if (!alive.current) return;
      setData(v);
      setError(null);
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
      if (!opts.live) return undefined;
      // Junta várias mudanças seguidas numa recarga só.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const unsub = subscribeToChanges(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(reload, 400);
      });
      return () => {
        if (timer) clearTimeout(timer);
        unsub();
      };
    }, [reload, opts.live]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  return { data, error, loading, refreshing, reload, refresh, setData };
}

/** Roda uma ação, guardando "ocupado" e a mensagem de erro. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Trava síncrona: dois toques antes da tela atualizar não disparam a ação duas vezes.
  const inFlight = useRef(false);
  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
