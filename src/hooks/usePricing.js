import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getKarachiTodayISO } from '../dateUtils';

// Fuel prices + sales summary for the whole app, plus the Pakistan-time (Asia/Karachi) scheduler.
//
// The database is the authority: it applies a scheduled price the moment anything touches it at or
// after the scheduled time (and always before a shift is valued). This hook makes the switch visible
// immediately in an open browser: every few seconds it checks whether
//   - a pending change has come due, or
//   - the Karachi calendar day rolled over (12:00 AM PKT),
// and if so asks the database to apply due prices, then refreshes prices, sales and tank data.
// Prices and revenue are loaded only when the database says this user may see them (owner/admin).
const CHECK_EVERY_MS = 10000;

export function usePricing(api, session, perms, reloadOverview, viewerRole) {
  const [prices, setPrices] = useState(null);
  const [sales, setSales] = useState(null);
  const [error, setError] = useState(null);
  const isOwnerOrAdmin = viewerRole === 'owner' || viewerRole === 'admin';
  const canManage = Boolean((perms && perms.manage_prices) || isOwnerOrAdmin);
  const canSeeSales = Boolean((perms && perms.view_sales) || isOwnerOrAdmin);
  const lastDay = useRef(getKarachiTodayISO());
  const firing = useRef(false);

  const reloadPricing = useCallback(async () => {
    const jobs = [];
    if (canManage) jobs.push(api.getFuelPrices().then(setPrices));
    if (canSeeSales) jobs.push(api.getSalesSummary().then(setSales));
    if (!jobs.length) return;
    try { await Promise.all(jobs); setError(null); } catch (e) { setError(e); }
  }, [api, canManage, canSeeSales]);

  useEffect(() => {
    if (!session) { setPrices(null); setSales(null); return; }
    reloadPricing();
  }, [session, reloadPricing]);

  // Everything that must refresh after a price change or a shift closing.
  const refreshAll = useCallback(async () => {
    await Promise.all([reloadOverview({ silent: true }), reloadPricing()]);
  }, [reloadOverview, reloadPricing]);

  useEffect(() => {
    if (!session || !(canManage || canSeeSales)) return undefined;
    const timer = window.setInterval(async () => {
      if (firing.current) return;
      const today = getKarachiTodayISO();
      const dayRolled = today !== lastDay.current;
      const due = prices && prices.fuels.some(f => f.pending && new Date(f.pending.effectiveAt).getTime() <= Date.now());
      if (!dayRolled && !due) return;
      firing.current = true;
      try {
        await api.applyDuePrices();
        lastDay.current = today;
        await refreshAll();
      } catch { /* try again on the next tick */ } finally { firing.current = false; }
    }, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [api, session, canManage, canSeeSales, prices, refreshAll]);

  return useMemo(
    () => ({ prices, sales, pricingError: error, reloadPricing, refreshAll, applyPrices: setPrices }),
    [prices, sales, error, reloadPricing, refreshAll],
  );
}
