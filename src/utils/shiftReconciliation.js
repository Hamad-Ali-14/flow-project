// Shift stock reconciliation engine (pure functions, no I/O).
//
// Everything is derived from the append-only fuel ledger (fuel_transactions), so the table can
// never drift away from the tanks:
//
//   stockAt(T)    = live tank total - sum(ledger movements after T)
//   Opening stock = stockAt(shift opened)           -> equals the previous shift's closing stock
//   Purchases     = sum(FUEL_RECEIVED while the shift was running)
//   Total stock   = Opening stock + Purchases
//   12-hour sales = sum(NOZZLE_SALE posted by this shift's closing)
//   Closing stock = Total stock - 12-hour sales      (closed shifts use the ledger balance at close,
//                                                     which is identical unless an authorised stock
//                                                     adjustment happened mid-shift)
//   Gain / loss   = Closing stock - (Total stock - 12-hour sales)   i.e. the net adjustments
//
// The running shift is shown as "Pending": its sales are only posted when the meters are closed,
// so its closing stock is provisional.
 
import {
  addDaysISO,
  getKarachiMonthStartISO,
  getKarachiTodayISO,
  getKarachiWeekStartISO,
  karachiToInstant,
} from '../dateUtils.js';
 
export const SHIFT_SLOTS = Object.freeze({
  1: Object.freeze({ name: 'Shift 1 - Day', hours: '07:00 AM - 07:00 PM' }),
  2: Object.freeze({ name: 'Shift 2 - Night', hours: '07:00 PM - 07:00 AM' }),
});
 
// The database cycles shift_number 1,2,1,2,... (see _open_shift), so parity decides Day / Night.
export function shiftSlotFromNumber(shiftNumber) {
  return Number(shiftNumber) % 2 === 0 ? 2 : 1;
}
 
// "Shift 2 - Night" -> 2, "Shift 1 - Day" -> 1, anything else -> null.
export function shiftSlotFromName(name) {
  const s = String(name || '').toLowerCase();
  if (/night|shift\s*2/.test(s)) return 2;
  if (/day|shift\s*1/.test(s)) return 1;
  return null;
}
 
// Day / Night from the real clock (Karachi): 07:00-19:00 is Shift 1 (Day), 19:00-07:00 is Shift 2 (Night).
// The running shift takes the slot of the current system time; a closed shift takes the slot of the time
// it was opened. The database's shift_number counter is NOT used (it only cycles 1,2,1,2 and drifts from the clock).
export function shiftSlotFromTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(d.getTime())) return 1;
  const hour = new Date(d.getTime() + 5 * 60 * 60 * 1000).getUTCHours();
  return hour >= 7 && hour < 19 ? 1 : 2;
}
 
export const PERIOD_OPTIONS = Object.freeze([
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
]);
 
// Daily = today, Weekly = the last 7 days (today and the 6 days before; a calendar week would be nearly empty
// early in the week, e.g. on a Monday), Monthly = 1st -> today.
// Custom keeps whatever dates were picked; an empty side means "no limit".
export function resolvePeriodRange(period, todayISO = getKarachiTodayISO(), custom = {}) {
  if (period === 'daily') return { start: todayISO, end: todayISO };
  if (period === 'weekly') return { start: addDaysISO(todayISO, -6), end: todayISO };
  if (period === 'monthly') return { start: getKarachiMonthStartISO(todayISO), end: todayISO };
  return { start: custom.start || '', end: custom.end || '' };
}
 
// Karachi calendar dates -> [from, to) instants. `to` is the start of the day AFTER `end`.
export function rangeToInstants({ start, end } = {}) {
  return {
    from: start ? karachiToInstant(start, '00:00') : null,
    to: end ? karachiToInstant(addDaysISO(end, 1), '00:00') : null,
  };
}
 
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // Pakistan has no DST
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 
// "10 Oct 2026, 07:02 PM" (Karachi time). Built by hand so ICU differences ("Sept", narrow
// no-break spaces, lower-case pm) can never change the text.
export function formatShiftDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  const k = new Date(d.getTime() + PKT_OFFSET_MS);
  const h = k.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(k.getUTCMinutes()).padStart(2, '0');
  return `${k.getUTCDate()} ${MONTHS[k.getUTCMonth()]} ${k.getUTCFullYear()}, ${String(h12).padStart(2, '0')}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}
 
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const ms = v => (v ? new Date(v).getTime() : NaN);
 
// Row layout is an array (the app's historical contract) with a metadata object appended:
//   [name, assignedTo, hours, opening, purchases, total, sales, closing, status, closedBy,
//    openingCash, closingCash, meta]
export const RECON_COL = Object.freeze({
  NAME: 0, PERSON: 1, HOURS: 2, OPENING: 3, PURCHASES: 4, TOTAL: 5, SALES: 6, CLOSING: 7,
  STATUS: 8, CLOSED_BY: 9, OPENING_CASH: 10, CLOSING_CASH: 11, META: 12,
});
 
/**
 * @param {object}   p
 * @param {Array}    p.shifts        raw shift_closings rows: { id, shift_number, business_date, status,
 *                                   opened_at, closed_at, closed_by, closedByName?, openedByName?,
 *                                   opening_cash?, closing_cash? }
 * @param {Array}    p.transactions  ledger rows (active tanks only): { transaction_type, quantity_litres,
 *                                   created_at, shift_closing_id? }
 * @param {number}   p.liveTotal     current stock across active tanks
 * @param {object}   p.supervisors   { 1: 'Name', 2: 'Name' } assigned shift supervisor per slot
 * @param {boolean}  p.includeActive keep the running shift (as the top "Pending" row)
 */
export function buildShiftLedger({ shifts = [], transactions = [], liveTotal = 0, supervisors = {}, now = new Date(), includeActive = true } = {}) {
  const nowMs = now.getTime();
  const txs = (transactions || []).map(t => ({
    type: t.transaction_type,
    qty: Number(t.quantity_litres) || 0,
    at: ms(t.created_at),
    shiftId: t.shift_closing_id || null,
    nozzleId: t.nozzle_id || null,
    nozzleNumber: t.nozzle_number != null ? String(t.nozzle_number) : null,
  })).filter(t => Number.isFinite(t.at));
 
  const stockAt = T => round2(Number(liveTotal) - txs.reduce((sum, t) => (t.at > T ? sum + t.qty : sum), 0));
 
  const rows = [];
  for (const s of shifts || []) {
    const isOpen = s.status === 'open' || !s.closed_at;
    if (isOpen && !includeActive) continue;
 
    const openedMs = ms(s.opened_at);
    const endMs = isOpen ? nowMs : ms(s.closed_at);
    if (!Number.isFinite(openedMs)) continue;
 
    const inWindow = t => t.at > openedMs && t.at <= endMs;
    const windowTxs = txs.filter(inWindow);
 
    const opening = stockAt(openedMs);
    const purchases = round2(windowTxs.filter(t => t.type === 'FUEL_RECEIVED').reduce((a, t) => a + t.qty, 0));
    const saleTxs = isOpen ? [] : txs
      .filter(t => t.type === 'NOZZLE_SALE' && (t.shiftId ? t.shiftId === s.id : inWindow(t)));
    const sales = round2(saleTxs.reduce((a, t) => a - t.qty, 0));
    // Litres sold per nozzle in this shift (the page groups them by machine). Keyed by nozzle id when the
    // ledger carries it, and by nozzle number otherwise.
    const nozzleSales = { byId: {}, byNumber: {} };
    for (const t of saleTxs) {
      if (t.nozzleId) nozzleSales.byId[t.nozzleId] = round2((nozzleSales.byId[t.nozzleId] || 0) - t.qty);
      if (t.nozzleNumber) nozzleSales.byNumber[t.nozzleNumber] = round2((nozzleSales.byNumber[t.nozzleNumber] || 0) - t.qty);
    }
    const total = round2(opening + purchases);
    const expectedClosing = round2(total - sales);
    const closing = isOpen ? expectedClosing : stockAt(endMs);
    const gainLoss = round2(closing - expectedClosing);
 
    const slot = isOpen ? shiftSlotFromTime(now) : shiftSlotFromTime(openedMs);
    const person = supervisors[slot] || s.closedByName || s.openedByName || '-';
    const lastTouch = windowTxs.reduce((m, t) => Math.max(m, t.at), openedMs);
 
    rows.push({
      sortKey: isOpen ? Infinity : endMs,
      openedMs,
      row: [
        SHIFT_SLOTS[slot].name,
        person,
        SHIFT_SLOTS[slot].hours,
        opening,
        purchases,
        total,
        sales,
        closing,
        isOpen ? 'Pending' : 'Completed',
        s.closed_by || null,
        s.opening_cash ?? 0,
        s.closing_cash ?? 0,
        {
          id: s.id,
          shiftNumber: s.shift_number,
          slot,
          businessDate: s.business_date,
          openedAt: s.opened_at,
          closedAt: s.closed_at || null,
          // Pending rows show when the shift started or was last touched (e.g. fuel received).
          updatedAt: isOpen ? new Date(lastTouch).toISOString() : s.closed_at,
          gainLoss,
          nozzleSales,
          active: isOpen,
        },
      ],
    });
  }
 
  // 1st: the running (Pending) shift. Then the most recently closed shift, then older ones.
  rows.sort((a, b) => (b.sortKey - a.sortKey) || (b.openedMs - a.openedMs));
  return rows.map(r => r.row);
}
 
/**
 * Time filter (Daily / Weekly / Monthly / Custom) for the shift cards.
 * A shift belongs to the Karachi calendar day shown on its card:
 *   - Completed shift -> the day it was closed
 *   - Pending (running) shift -> today (its card shows the current date & time)
 * So "Daily" shows only today's shifts, never an older closed shift or a previous day's shift.
 * Order of `rows` is kept (running shift first, then newest closed).
 */
export function filterShiftRowsByRange(rows = [], range = {}, now = new Date()) {
  const { from, to } = rangeToInstants(range);
  const fromMs = from ? from.getTime() : -Infinity;
  const toMs = to ? to.getTime() : Infinity;
  return (rows || []).filter((row) => {
    const meta = row[RECON_COL.META] || {};
    const at = row[RECON_COL.STATUS] === 'Pending' ? now.getTime() : Date.parse(meta.closedAt);
    return Number.isFinite(at) && at >= fromMs && at < toMs;
  });
}
 
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
 
// "Sun, 11 Oct 2026" (Karachi calendar day). Used on the running shift's card, which only shows a date.
export function formatShiftDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  const k = new Date(d.getTime() + PKT_OFFSET_MS);
  return `${WEEKDAYS[k.getUTCDay()]}, ${k.getUTCDate()} ${MONTHS[k.getUTCMonth()]} ${k.getUTCFullYear()}`;
}
 
/**
 * Puts each shift's nozzle meter readings (meter_readings rows) on its ledger row:
 *   row[META].meters = { [nozzleId]: { previous, current } }   (previous = opening meter, current = closing meter)
 * The running shift has no readings yet: its cards show the nozzle's present meter as the opening reading.
 */
export function attachMeterReadings(rows = [], readings = []) {
  const byShift = new Map();
  for (const r of readings || []) {
    const shiftId = r.shift_closing_id;
    if (!shiftId || !r.nozzle_id) continue;
    if (!byShift.has(shiftId)) byShift.set(shiftId, {});
    byShift.get(shiftId)[r.nozzle_id] = { previous: Number(r.previous_reading), current: Number(r.current_reading) };
  }
  for (const row of rows) {
    const meta = row[RECON_COL.META];
    if (meta) meta.meters = byShift.get(meta.id) || {};
  }
  return rows;
}