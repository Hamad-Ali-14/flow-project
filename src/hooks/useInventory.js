import { useCallback, useEffect, useRef, useState } from 'react';

// Loads the tank overview for the signed-in user and exposes reload().
// Authentication is NOT handled here: the session comes from AuthProvider (one app-wide login).
export function useInventory(api, session) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const latest = useRef(0); // ignore responses from superseded requests
  const loadedAt = useRef(0);
  const signedIn = useRef(false);
  signedIn.current = Boolean(session);

  const load = useCallback(async ({ silent = false } = {}) => {
    const id = ++latest.current;
    if (!silent) setLoading(true);
    try {
      const data = await api.getOverview();
      if (id === latest.current) { setOverview(data); setError(null); loadedAt.current = Date.now(); }
    } catch (e) {
      if (id === latest.current) setError(e);
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (session) { load(); return; }
    if (session === null) { latest.current += 1; setOverview(null); setError(null); setLoading(false); }
  }, [session, load]);

  // Cheap revalidation for page changes / tab focus: skips the request if data is fresh enough.
  const refreshIfStale = useCallback((maxAgeMs = 5000) => {
    if (signedIn.current && Date.now() - loadedAt.current > maxAgeMs) return load({ silent: true });
    return Promise.resolve();
  }, [load]);

  // Instant UI feedback, but ONLY from a record the database returned after a successful write.
  // Invalidates any older in-flight load so it cannot paint stale stock over this.
  const applyPersistedTank = useCallback(record => {
    latest.current += 1;
    setOverview(prev => (prev ? {
      ...prev,
      tanks: prev.tanks.map(t => (t.id === record.id ? { ...t, currentStock: record.currentStock } : t)),
    } : prev));
  }, []);

  return { overview, loading, error, reload: load, refreshIfStale, applyPersistedTank };
}
