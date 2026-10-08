import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { inventoryApi } from '../services';
import { useInventory } from './useInventory';
import { useAuth, resolveDisplayName } from './useAuth';
import { usePricing } from './usePricing';
import { withStockMetrics } from '../utils/inventoryCalculations';

// ONE authoritative tank dataset for the whole app.
//
//   Supabase (get_tank_overview)  ->  useInventory (fetch + state)  ->  this context
//        ->  Overview snapshot, Tanks & nozzles, Reports, ...
//
// Every consumer reads the same records, and percentage/status come from
// withStockMetrics(), so the pages cannot drift apart. After any inventory operation the
// Tanks page calls reload(); all consumers re-render from the refreshed dataset.
const TankDataContext = createContext(null);

export function TankDataProvider({ children }) {
  const { session } = useAuth(); // already authenticated: this provider only mounts behind <AuthGate>
  const state = useInventory(inventoryApi, session);
  const { overview, refreshIfStale } = state;
  const pricing = usePricing(inventoryApi, session, overview ? overview.permissions : null, state.reload, overview?.viewer?.role);

  const tanks = useMemo(() => (overview ? overview.tanks.map(withStockMetrics) : []), [overview]);
  const machines = useMemo(() => (overview?.machines || []), [overview]);

  // Revalidate when the person comes back to this browser tab (no realtime subscription).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshIfStale(30000); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshIfStale]);

  const userName = resolveDisplayName(session, overview?.viewer?.name);
  const value = useMemo(() => ({ ...state, ...pricing, session, userName, tanks, machines, api: inventoryApi, demo: inventoryApi.mode === 'demo' }), [state, pricing, session, userName, tanks, machines]);
  return <TankDataContext.Provider value={value}>{children}</TankDataContext.Provider>;
}

export function useTanks() {
  const value = useContext(TankDataContext);
  if (!value) throw new Error('useTanks must be used inside <TankDataProvider>');
  return value;
}
