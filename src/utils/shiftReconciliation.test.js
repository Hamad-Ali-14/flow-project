import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildShiftLedger, formatShiftDateTime, formatShiftDate, attachMeterReadings, resolvePeriodRange, rangeToInstants,
  shiftSlotFromNumber, shiftSlotFromName, shiftSlotFromTime, RECON_COL as C,
} from './shiftReconciliation.js';

// Karachi (UTC+5) wall clock -> ISO instant.
const pkt = (date, time) => new Date(`${date}T${time}:00+05:00`).toISOString();

// Ledger: stock starts at 100,000 L on 9 Oct 07:00.
//   Shift 1 (9 Oct 07:00-19:00): +10,000 delivered at 12:00, sells 5,000
//   Shift 2 (9 Oct 19:00 - 10 Oct 07:00): sells 6,000
//   Shift 1 (10 Oct 07:00-19:00): sells 4,000
//   Shift 2 (10 Oct 19:02 - running): +3,000 delivered at 20:00
const shifts = [
  { id: 's1', shift_number: 1, business_date: '2026-10-09', status: 'closed', opened_at: pkt('2026-10-09', '07:00'), closed_at: pkt('2026-10-09', '19:00'), closed_by: 'u-bilal', closedByName: 'Closer A' },
  { id: 's2', shift_number: 2, business_date: '2026-10-09', status: 'closed', opened_at: pkt('2026-10-09', '19:00'), closed_at: pkt('2026-10-10', '07:00'), closed_by: 'u-usman', closedByName: 'Closer B' },
  { id: 's3', shift_number: 1, business_date: '2026-10-10', status: 'closed', opened_at: pkt('2026-10-10', '07:00'), closed_at: pkt('2026-10-10', '19:00'), closed_by: 'u-bilal', closedByName: 'Closer A' },
  { id: 's4', shift_number: 2, business_date: '2026-10-10', status: 'open', opened_at: pkt('2026-10-10', '19:02'), closed_at: null, closed_by: null, openedByName: 'Closer A' },
];
const tx = (type, qty, at, shift) => ({ transaction_type: type, quantity_litres: qty, created_at: at, shift_closing_id: shift || null });
const ledger = [
  tx('FUEL_RECEIVED', 10000, pkt('2026-10-09', '12:00')),
  tx('NOZZLE_SALE', -5000, pkt('2026-10-09', '19:00'), 's1'),
  tx('NOZZLE_SALE', -6000, pkt('2026-10-10', '07:00'), 's2'),
  tx('NOZZLE_SALE', -4000, pkt('2026-10-10', '19:00'), 's3'),
  tx('FUEL_RECEIVED', 3000, pkt('2026-10-10', '20:00')),
];
// 100,000 + 10,000 - 5,000 - 6,000 - 4,000 + 3,000
const liveTotal = 98000;
const now = new Date(pkt('2026-10-10', '20:30'));
const supervisors = { 1: 'Bilal Ahmed', 2: 'Usman Ali' };

const rows = buildShiftLedger({ shifts, transactions: ledger, liveTotal, supervisors, now });

test('sorting: active shift first, then closed shifts newest to oldest', () => {
  assert.deepEqual(rows.map(r => r[C.META].id), ['s4', 's3', 's2', 's1']);
  assert.equal(rows[0][C.STATUS], 'Pending');
  assert.ok(rows.slice(1).every(r => r[C.STATUS] === 'Completed'));
});

test('Shift 1 closing is its own row even though shift_number repeats (1,2,1,2)', () => {
  assert.equal(rows.filter(r => r[C.NAME] === 'Shift 1 - Day').length, 2);
  assert.equal(rows.filter(r => r[C.NAME] === 'Shift 2 - Night').length, 2);
});

test('hours use 12-hour AM/PM format', () => {
  assert.equal(rows[0][C.HOURS], '07:00 PM - 07:00 AM');
  assert.equal(rows[1][C.HOURS], '07:00 AM - 07:00 PM');
});

test('Total = Opening + Purchases and Closing = Total - Sales for every closed shift', () => {
  for (const r of rows.slice(1)) {
    assert.equal(r[C.TOTAL], r[C.OPENING] + r[C.PURCHASES]);
    assert.equal(r[C.CLOSING], r[C.TOTAL] - r[C.SALES]);
    assert.equal(r[C.META].gainLoss, 0);
  }
  const s1 = rows[3];
  assert.deepEqual([s1[C.OPENING], s1[C.PURCHASES], s1[C.TOTAL], s1[C.SALES], s1[C.CLOSING]], [100000, 10000, 110000, 5000, 105000]);
});

test('each shift opens with the previous shift closing stock (continuous ledger)', () => {
  for (let i = 0; i < rows.length - 1; i++) {
    assert.equal(rows[i][C.OPENING], rows[i + 1][C.CLOSING]);
  }
});

test('running shift picks up purchases made during it and has no sales yet', () => {
  const live = rows[0];
  assert.equal(live[C.OPENING], 95000);
  assert.equal(live[C.PURCHASES], 3000);
  assert.equal(live[C.TOTAL], 98000);
  assert.equal(live[C.SALES], 0);
  assert.equal(live[C.CLOSING], 98000);
});

test('pending row carries the last-updated time (latest purchase, else shift start)', () => {
  assert.equal(formatShiftDateTime(rows[0][C.META].updatedAt), '10 Oct 2026, 08:00 PM');
  const noPurchase = buildShiftLedger({ shifts: [shifts[3]], transactions: [], liveTotal: 95000, now });
  assert.equal(formatShiftDateTime(noPurchase[0][C.META].updatedAt), '10 Oct 2026, 07:02 PM');
});

test('assigned to follows the shift supervisor, not one fixed user', () => {
  assert.deepEqual(rows.map(r => r[C.PERSON]), ['Usman Ali', 'Bilal Ahmed', 'Usman Ali', 'Bilal Ahmed']);
  const noSupervisors = buildShiftLedger({ shifts, transactions: ledger, liveTotal, now });
  assert.deepEqual(noSupervisors.map(r => r[C.PERSON]), ['Closer A', 'Closer A', 'Closer B', 'Closer A']);
});

test('a mid-shift stock adjustment shows up as gain / loss and keeps the ledger continuous', () => {
  const withAdj = [...ledger, tx('STOCK_ADJUSTMENT', -150, pkt('2026-10-09', '15:00'))];
  const r = buildShiftLedger({ shifts, transactions: withAdj, liveTotal: liveTotal - 150, supervisors, now });
  const s1 = r[3];
  assert.equal(s1[C.META].gainLoss, -150);
  assert.equal(s1[C.CLOSING], s1[C.TOTAL] - s1[C.SALES] - 150);
  assert.equal(r[2][C.OPENING], s1[C.CLOSING]);
});

test('includeActive=false drops the running shift', () => {
  const r = buildShiftLedger({ shifts, transactions: ledger, liveTotal, now, includeActive: false });
  assert.deepEqual(r.map(x => x[C.META].id), ['s3', 's2', 's1']);
});

test('formatShiftDateTime matches the required style and uses Karachi time', () => {
  assert.equal(formatShiftDateTime('2026-10-10T14:02:00Z'), '10 Oct 2026, 07:02 PM');
  assert.equal(formatShiftDateTime('2026-09-01T19:30:00Z'), '2 Sep 2026, 12:30 AM');
  assert.equal(formatShiftDateTime(null), '');
});

test('slot helpers', () => {
  assert.equal(shiftSlotFromNumber(1), 1);
  assert.equal(shiftSlotFromNumber(2), 2);
  assert.equal(shiftSlotFromNumber(7), 1);
  assert.equal(shiftSlotFromName('Shift 2 - Night'), 2);
  assert.equal(shiftSlotFromName('Shift 1 - Day'), 1);
  assert.equal(shiftSlotFromName('General'), null);
});

test('period presets and instants', () => {
  assert.deepEqual(resolvePeriodRange('daily', '2026-10-10'), { start: '2026-10-10', end: '2026-10-10' });
  assert.deepEqual(resolvePeriodRange('weekly', '2026-10-10'), { start: '2026-10-05', end: '2026-10-10' });
  assert.deepEqual(resolvePeriodRange('monthly', '2026-10-10'), { start: '2026-10-01', end: '2026-10-10' });
  assert.deepEqual(resolvePeriodRange('custom', '2026-10-10', { start: '2026-09-01', end: '2026-09-15' }), { start: '2026-09-01', end: '2026-09-15' });
  const { from, to } = rangeToInstants({ start: '2026-10-10', end: '2026-10-10' });
  assert.equal(from.toISOString(), '2026-10-09T19:00:00.000Z');
  assert.equal(to.toISOString(), '2026-10-10T19:00:00.000Z');
});

test('shift name follows the system clock, not the database counter', () => {
  assert.equal(shiftSlotFromTime(new Date(pkt('2026-10-11', '11:00'))), 1);
  assert.equal(shiftSlotFromTime(new Date(pkt('2026-10-11', '06:59'))), 2);
  assert.equal(shiftSlotFromTime(new Date(pkt('2026-10-11', '19:00'))), 2);
  // running shift opened last night with counter 2, but it is 11:00 now -> Shift 1 - Day
  const running = [{ id: 'x', shift_number: 2, status: 'open', opened_at: pkt('2026-10-10', '20:15'), closed_at: null }];
  const r = buildShiftLedger({ shifts: running, transactions: [], liveTotal: 1000, supervisors: { 1: 'Bilal Ahmed', 2: 'Usman Ali' }, now: new Date(pkt('2026-10-11', '11:00')) });
  assert.deepEqual([r[0][C.NAME], r[0][C.PERSON], r[0][C.HOURS], r[0][C.STATUS]], ['Shift 1 - Day', 'Bilal Ahmed', '07:00 AM - 07:00 PM', 'Pending']);
});

test('sales of a closed shift are split per nozzle (the page groups nozzles into machines)', () => {
  const sale = (qty, at, shift, nozzleId, nozzleNumber) => ({ transaction_type: 'NOZZLE_SALE', quantity_litres: qty, created_at: at, shift_closing_id: shift, nozzle_id: nozzleId, nozzle_number: nozzleNumber });
  const txs = [
    sale(-1000, pkt('2026-10-09', '19:00'), 's1', 'n1', '1'),
    sale(-500, pkt('2026-10-09', '19:00'), 's1', 'n2', '2'),
    sale(-300, pkt('2026-10-09', '19:00'), 's1', 'n3', '3'),
    tx('NOZZLE_SALE', -9, pkt('2026-10-10', '07:00'), 's2'), // other shift, must not leak in
  ];
  const r = buildShiftLedger({ shifts: [shifts[0]], transactions: txs, liveTotal: 50000, now });
  const ns = r[0][C.META].nozzleSales;
  assert.deepEqual(ns.byId, { n1: 1000, n2: 500, n3: 300 });
  assert.deepEqual(ns.byNumber, { 1: 1000, 2: 500, 3: 300 });
  assert.equal(r[0][C.SALES], 1800);
  // the running shift has no sales yet
  const live = buildShiftLedger({ shifts: [shifts[3]], transactions: txs, liveTotal: 50000, now });
  assert.deepEqual(live[0][C.META].nozzleSales, { byId: {}, byNumber: {} });
});

test('formatShiftDate gives weekday, day month year', () => {
  assert.equal(formatShiftDate('2026-10-10T14:02:00Z'), 'Sat, 10 Oct 2026');
});

test('attachMeterReadings groups readings per shift and nozzle', () => {
  const rows = [[], []];
  rows[0][C.META] = { id: 's1' };
  rows[1][C.META] = { id: 's2' };
  const out = attachMeterReadings(rows, [
    { shift_closing_id: 's1', nozzle_id: 'n1', previous_reading: 100, current_reading: 150 },
    { shift_closing_id: 's1', nozzle_id: 'n2', previous_reading: 10, current_reading: 20 },
  ]);
  const m = (out || rows)[0][C.META].meters;
  assert.equal(m.n1.current, 150);
  assert.equal(m.n2.previous, 10);
});
