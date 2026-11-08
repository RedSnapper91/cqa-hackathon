import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
export function useApi<T>(path: string, revision = 0, poll = 0) {
  const [state, setState] = useState<{
    path: string;
    data: T | null;
    error: string;
    loading: boolean;
  }>({ path: '', data: null, error: '', loading: true });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((value) => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const controller = new AbortController();
    setState((previous) => ({
      path,
      data: previous.path === path ? previous.data : null,
      error: '',
      loading: true,
    }));
    async function get() {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await api<T>(path, { signal: controller.signal });
        if (!cancelled) setState({ path, data, error: '', loading: false });
      } catch (error) {
        if (!cancelled)
          setState((previous) => ({
            path,
            data: previous.path === path ? previous.data : null,
            error: (error as Error).message,
            loading: false,
          }));
      } finally {
        inFlight = false;
      }
    }
    void get();
    const timer = poll ? window.setInterval(() => void get(), poll) : undefined;
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [path, revision, poll, nonce]);
  const matches = state.path === path;
  return {
    data: matches ? state.data : null,
    error: matches ? state.error : '',
    loading: !matches || state.loading,
    reload,
  };
}
