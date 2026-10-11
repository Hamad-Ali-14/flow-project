import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gauge, Link2, Plus, ReceiptText } from 'lucide-react';
import { useTanks } from '../../hooks/useTanks';
import { useLanguage } from '../../context/LanguageContext';
import { addDaysISO, getKarachiTodayISO } from '../../dateUtils';
import ShiftClosingModal from '../tanks/ShiftClosingModal';
import { useViewerScope } from '../../hooks/useViewerScope';
import {
  RECON_COL as C,
  buildShiftLedger,
  shiftSlotFromName,
  formatShiftDate,
  formatShiftDateTime,
  filterShiftRowsByRange,
  resolvePeriodRange,
} from '../../utils/shiftReconciliation';

const liters = (n) => `${Number(n || 0).toLocaleString('en-PK')} L`;

const statusTone = (status) => (status === 'Completed' ? 'success' : 'warning');

// Meter readings can have decimals (e.g. 5,928.64).
const meter = (n) => (Number.isFinite(Number(n)) && n !== null && n !== undefined
  ? Number(n).toLocaleString('en-PK', { maximumFractionDigits: 2 })
  : '-');

// "M1" -> "Machine 1"; anything else keeps its own name.
const machineLabel = (m) => {
  const digits = String(m.machineNumber || '').replace(/\D/g, '');
  return digits ? `Machine ${digits}` : (m.name || m.machineNumber);
};

// One card per shift (same card for the running and the closed shifts):
//   header  : shift name, date (running shift) or date & time of closing (completed), status badge
//   body    : Machine 1 / 2 / 3 boxes, one row per nozzle with its opening and closing meter
//   footer  : stock reconciliation of the 12 hours (Opening + received = Total, minus sales = Closing)
// Every number comes from the database: nozzle meters from meter_readings (closed shifts) or the nozzle's
// present meter (running shift), stock from the append-only fuel ledger.
function ShiftCard({ row, machines, showPerson }) {
  const meta = row[C.META] || {};
  const pending = row[C.STATUS] === 'Pending';
  // Running shift: its date. Completed shift: the date and time it was closed.
  // Running shift: the current date & time (kept ticking). Completed shift: when it was closed.
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(() => setNowIso(new Date().toISOString()), 30000);
    return () => clearInterval(timer);
  }, [pending]);
  const stamp = pending ? formatShiftDateTime(nowIso) : formatShiftDateTime(meta.closedAt);
  return (
    <article className={'shift-card ' + (pending ? 'is-pending' : 'is-completed')}>
      <div className="shift-card-head">
        <div>
          <h3>{row[C.NAME]}</h3>
          <p>
            <span>{stamp || '-'}</span>
            {showPerson && row[C.PERSON] && (
              <>
                <span className="shift-card-dot" aria-hidden="true">•</span>
                <span>Assigned to <b>{row[C.PERSON]}</b></span>
              </>
            )}
          </p>
        </div>
        <span className={'shift-badge ' + (pending ? 'pending' : 'completed')}>{row[C.STATUS]}</span>
      </div>

      <div className="shift-machine-boxes">
        {machines.map((m) => (
          <section className="shift-machine-box" key={m.id}>
            <h4>{m.label}</h4>
            <div className="shift-meter-grid" role="table">
              <div className="shift-meter-row shift-meter-head" role="row">
                <span>Nozzle</span><span>Opening</span><span>Closing</span><span>Sold (L)</span>
              </div>
              {m.nozzles.map((n) => {
                const reading = (meta.meters || {})[n.id];
                const opening = pending ? n.meter : reading?.previous;
                const closing = pending ? null : reading?.current;
                const sold = !pending && reading ? Number(reading.current) - Number(reading.previous) : null;
                return (
                  <div className="shift-meter-row" role="row" key={n.id}>
                    <strong>Nozzle {n.number}</strong>
                    <span>{meter(opening)}</span>
                    <span>{meter(closing)}</span>
                    <span>{sold === null || Number.isNaN(sold) ? '-' : liters(sold)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

    </article>
  );
}

export default function ShiftClosingPage() {
  const { api, tanks, overview, refreshAll, userName, session } = useTanks();
  const { t } = useLanguage();
  const [shiftDialog, setShiftDialog] = useState(false);
  const [dbRows, setDbRows] = useState(null);
  const [loadError, setLoadError] = useState('');
  const viewerScope = useViewerScope();

  // Time filter (same Daily / Weekly / Monthly / Custom bar as the other ledgers).
  const [period, setPeriod] = useState('weekly');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  // Karachi "today" is kept in state so Daily / Weekly / Monthly roll over by themselves at midnight.
  const [todayISO, setTodayISO] = useState(() => getKarachiTodayISO());
  useEffect(() => {
    const timer = setInterval(() => setTodayISO(getKarachiTodayISO()), 60000);
    return () => clearInterval(timer);
  }, []);
  const range = useMemo(
    () => resolvePeriodRange(period, todayISO, { start: customStart, end: customEnd }),
    [period, todayISO, customStart, customEnd],
  );

  const perms = overview ? overview.permissions : {};
  const userRole = overview?.viewer?.role || 'owner';
  const isAdminOrOwner = userRole === 'owner' || userRole === 'admin';
  const isManager = !isAdminOrOwner;

  // Machines (Machine 1 / 2 / 3 ...) with their nozzles, straight from the station setup in the database.
  const machines = useMemo(() => {
    const byNumber = new Map();
    (overview?.machines || []).filter((m) => m.active !== false).forEach((m) => {
      byNumber.set(m.machineNumber, { ...m, nozzles: [] });
    });
    (overview?.tanks || []).forEach((tk) => (tk.nozzles || []).filter((n) => n.active).forEach((n) => {
      const key = n.machineNumber || 'M?';
      if (!byNumber.has(key)) byNumber.set(key, { id: key, machineNumber: key, name: key, nozzles: [] });
      byNumber.get(key).nozzles.push({
        id: n.id, number: String(n.nozzleNumber), meter: n.currentMeter, status: n.status,
        tankName: tk.name, fuelName: tk.fuelName,
      });
    }));
    const natural = (a, b) => String(a.machineNumber).localeCompare(String(b.machineNumber), undefined, { numeric: true });
    return [...byNumber.values()]
      .map((m) => ({ ...m, label: machineLabel(m), nozzles: m.nozzles.sort((a, b) => Number(a.number) - Number(b.number)) }))
      .filter((m) => m.nozzles.length)
      .sort(natural);
  }, [overview]);

  // The ledger is always loaded for the last 60 days (or back to the custom start date); the Daily / Weekly /
  // Monthly / Custom bar then narrows what is shown. That way a closed shift is never missing just because it
  // finished before the filter's first day.
  const baseStart = addDaysISO(todayISO, -60);
  const fetchStart = customStart && customStart < baseStart ? customStart : baseStart;

  // Ignore answers of superseded requests (quick filter changes, refresh after closing a shift).
  const requestId = useRef(0);
  const loadReconciliation = useCallback(() => {
    if (!api?.getShiftReconciliation) return;
    const id = ++requestId.current;
    api
      .getShiftReconciliation({ startDate: fetchStart, includeActive: true, withStock: false })
      .then((res) => { if (id === requestId.current) { setDbRows(Array.isArray(res) ? res : null); setLoadError(''); } })
      .catch((err) => { if (id === requestId.current) { setDbRows(null); setLoadError(err?.message || 'Could not load the shift ledger.'); } });
  }, [api, fetchStart]);

  const liveTotalStock = (tanks || []).reduce((sum, tk) => sum + (Number(tk.currentStock) || 0), 0);
  const openShiftId = overview?.openShift?.id;

  // Reload when the filter changes, a shift opens / closes, or stock moves (fuel received, adjustments).
  useEffect(() => {
    loadReconciliation();
  }, [loadReconciliation, openShiftId, liveTotalStock]);

  // The running shift must always be the top row, even before the ledger query answers.
  const rows = useMemo(() => {
    const loaded = dbRows || [];
    const hasPending = loaded.some((r) => r[C.STATUS] === 'Pending');
    if (hasPending || !overview?.openShift) return loaded;
    const os = overview.openShift;
    const [fallback] = buildShiftLedger({
      shifts: [{ id: os.id, shift_number: os.shiftNumber, status: 'open', opened_at: os.openedAt, closed_at: null, business_date: overview.businessDate }],
      transactions: [],
      liveTotal: liveTotalStock,
      supervisors: {},
      includeActive: true,
    });
    if (!fallback) return loaded;
    // Built without the stock ledger (it did not load): never show stock numbers for it.
    fallback[C.META].stockOk = false;
    return [fallback, ...loaded];
  }, [dbRows, overview, liveTotalStock]);

  // Period filter: only shifts that fall on the chosen days (running shift = today, closed shift = its closing day).
  // Daily therefore shows today only; older shifts appear under Weekly / Monthly / Custom.
  const periodRows = useMemo(() => filterShiftRowsByRange(rows, range), [rows, range]);

  // Owner, admin and managers all see every shift card; only the "Assigned to" name is owner/admin-only.
  const displayedRows = periodRows;

  const emptyText = isManager
    ? "No shift closings recorded in this period. Use 'Close shift' to record your shift reconciliation."
    : 'No shift closings recorded in this period. Use \'Close shift\' to record shift closings.';

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <ReceiptText size={15} /> {t('station_management', 'STATION MANAGEMENT')}
          </div>
          <h1>{t('shifts_title', 'Shift closing')}</h1>
          <p>{t('shifts_page_desc', 'Reconcile meter sales, tank dips, and cash for the current shift')}</p>
        </div>
        <div className="heading-actions shift-heading-actions">
          {/* Same control as Expense range on the Expenses page */}
          <label className="expense-range-control">
            {t('time_filter', 'Time filter')}
            <select
              value={period}
              onChange={(e) => {
                const value = e.target.value;
                setPeriod(value);
                // Entering Custom starts from the range that was on screen, like Other income does.
                if (value === 'custom' && !customStart && !customEnd) {
                  setCustomStart(range.start);
                  setCustomEnd(range.end);
                }
              }}
            >
              <option value="daily">{t('period_daily', 'Daily')}</option>
              <option value="weekly">{t('period_weekly', 'Weekly')}</option>
              <option value="monthly">{t('period_monthly', 'Monthly')}</option>
              <option value="custom">{t('period_custom_short', 'Custom')}</option>
            </select>
          </label>
          <button className="button primary" onClick={() => setShiftDialog(true)}>
            <Plus size={18} />
            {t('close_shift', 'Close shift')}
          </button>
        </div>
      </div>

      {period === 'custom' && (
        <div className="expense-custom-dates shift-custom-dates">
          <label className="income-date-field">
            <span className="income-filter-label">{t('start_date', 'START DATE')}</span>
            <input
              type="date"
              value={customStart}
              max={customEnd || undefined}
              onChange={(e) => { const v = e.target.value; setCustomStart(v); if (v && customEnd && v > customEnd) setCustomEnd(v); }}
              aria-label={t('start_date', 'Start date')}
            />
          </label>
          <label className="income-date-field">
            <span className="income-filter-label">{t('end_date', 'END DATE')}</span>
            <input
              type="date"
              value={customEnd}
              min={customStart || undefined}
              onChange={(e) => { const v = e.target.value; setCustomEnd(v); if (v && customStart && v < customStart) setCustomStart(v); }}
              aria-label={t('end_date', 'End date')}
            />
          </label>
        </div>
      )}

      {loadError && <div className="formula-note" role="alert"><span><strong>Ledger not loaded.</strong> {loadError}</span></div>}

      <div className="shift-flow">
        <div>
          <span>Shift 1 closing</span>
          <strong>-&gt; Shift 2 opening</strong>
        </div>
        <Link2 size={18} />
        <div>
          <span>Shift 2 closing</span>
          <strong>-&gt; next Shift 1 opening</strong>
        </div>
      </div>

      <div className="card table-card shift-table">
        <div className="card-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <h2>{isManager ? t('my_shift_reconciliation', 'My Shift Reconciliation') : t('shift_stock_reconciliation', '12-hour stock reconciliation')}</h2>
              <span className={`status ${isAdminOrOwner ? 'success' : 'info'}`} style={{ fontSize: '11px', padding: '2px 8px' }}>
                {isAdminOrOwner ? 'Admin / Owner: All Shifts' : `Manager: ${viewerScope.shiftName || userName}`}
              </span>
            </div>
            <p>
              {isManager
                ? 'Running shift and previously closed shifts, with meter readings per machine and nozzle.'
                : 'Continuous 12-hour stock reconciliation ledger across Day and Night shifts.'}
            </p>
          </div>
        </div>

        <div className="shift-card-list">
          {displayedRows.map((r) => {
            const meta = r[C.META] || {};
            return <ShiftCard key={meta.id || `${r[C.NAME]}-${meta.openedAt}`} row={r} machines={machines} showPerson={isAdminOrOwner} />;
          })}
          {!displayedRows.length && <p className="empty-state">{emptyText}</p>}
        </div>
      </div>

      <div className="formula-note">
        <Gauge size={18} />
        <span>
          <strong>Opening meter is linked automatically.</strong> A nozzle's opening meter is the closing meter of
          the previous shift (Shift 1 closing carries into Shift 2 opening; Shift 2 closing carries into the next
          Shift 1 opening). Total stock = Opening stock + fuel received during the shift; Closing stock = Total stock -
          12-hour sales. Received fuel goes into the tank, never onto a meter. The running shift stays Pending until
          its meters are closed.
        </span>
      </div>

      {shiftDialog && (
        <ShiftClosingModal
          tanks={tanks ?? []}
          openShift={overview?.openShift ?? null}
          focusTankId={null}
          api={api}
          onClose={() => setShiftDialog(false)}
          onDone={() => { setShiftDialog(false); refreshAll(); loadReconciliation(); }}
          onRefresh={() => { refreshAll(); loadReconciliation(); }}
          perms={perms}
        />
      )}
    </>
  );
}
