import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaleAmount, projectShiftClosing } from './inventoryCalculations.js';
import { pctChange, formatPct, buildChart, niceCeil, formatCompact } from './salesMetrics.js';
import {
  karachiToInstant, getNextKarachiMidnight, msUntilNextKarachiMidnight, getKarachiTodayISO,
  getKarachiWeekStartISO, getKarachiMonthStartISO, addDaysISO, formatKarachiDateTime, getKarachiShift,
} from '../dateUtils.js';
import { formatPKR, formatPrice } from './formatters.js';

test('calculateSaleAmount: litres x unit price, rounded to paisa', () => {
  assert.equal(calculateSaleAmount(850, 268.75), 228437.5);
  assert.equal(calculateSaleAmount(0, 268.75), 0);
  assert.equal(calculateSaleAmount(0.3, 0.1), 0.03);
  assert.equal(calculateSaleAmount(-5, 100), 0);
  assert.equal(calculateSaleAmount(10, NaN), 0);
});

const tank = (id, unitPrice, nozzles, stock = 50000) => ({
  id, name: id, fuelName: id, currentStock: stock, unitPrice,
  nozzles: nozzles.map(([nid, meter]) => ({ id: nid, nozzleNumber: nid, currentMeter: meter, active: true })),
});

test('projectShiftClosing: revenue per nozzle / tank / total uses each tank\'s own price', () => {
  const tanks = [tank('t1', 285.5, [['n1', 1000], ['n2', 2000]]), tank('t2', 268.75, [['n3', 5000]])];
  const p = projectShiftClosing(tanks, { n1: '1100', n2: '2050', n3: '5200' });
  assert.equal(p.valid, true);
  assert.equal(p.tanks[0].nozzles[0].amount, 28550);
  assert.equal(p.tanks[0].revenue, 28550 + 14275);
  assert.equal(p.tanks[1].revenue, 53750);
  assert.equal(p.totalRevenue, 28550 + 14275 + 53750);
  assert.equal(p.missingPriceFuel, null);
});

test('projectShiftClosing: hides revenue when prices are not visible, flags a missing price', () => {
  const hidden = projectShiftClosing([tank('t1', null, [['n1', 0]])], { n1: '10' });
  assert.equal(hidden.totalRevenue, null);
  assert.equal(hidden.tanks[0].nozzles[0].amount, null);
  const unset = projectShiftClosing([tank('t1', 0, [['n1', 0]])], { n1: '10' });
  assert.equal(unset.missingPriceFuel, 't1');
  const unsetButNothingSold = projectShiftClosing([tank('t1', 0, [['n1', 0]])], { n1: '0' });
  assert.equal(unsetButNothingSold.missingPriceFuel, null);
});

test('Pakistan time: 12:00 AM PKT is 19:00 UTC the previous day, no DST', () => {
  assert.equal(karachiToInstant('2026-10-03', '00:00').toISOString(), '2026-10-02T19:00:00.000Z');
  assert.equal(karachiToInstant('2026-07-01', '00:00').toISOString(), '2026-06-30T19:00:00.000Z'); // same offset in summer
  assert.equal(karachiToInstant('nope', '00:00'), null);
});

test('next Karachi midnight: before and after the rollover', () => {
  // 2026-10-02 18:59:59 UTC = 23:59:59 PKT on the 2nd -> midnight is 1 second away
  const before = new Date('2026-10-02T18:59:59Z');
  assert.equal(getKarachiTodayISO(before), '2026-10-02');
  assert.equal(getNextKarachiMidnight(before).toISOString(), '2026-10-02T19:00:00.000Z');
  assert.equal(msUntilNextKarachiMidnight(before), 1000);
  // one second later it is already the 3rd in Karachi and the next midnight is a day away
  const after = new Date('2026-10-02T19:00:00Z');
  assert.equal(getKarachiTodayISO(after), '2026-10-03');
  assert.equal(getNextKarachiMidnight(after).toISOString(), '2026-10-03T19:00:00.000Z');
});

test('date helpers: week (Monday start), month start, day arithmetic, label', () => {
  assert.equal(getKarachiWeekStartISO('2026-10-03'), '2026-09-28'); // Saturday -> Monday
  assert.equal(getKarachiWeekStartISO('2026-09-28'), '2026-09-28');
  assert.equal(getKarachiWeekStartISO('2026-10-04'), '2026-09-28'); // Sunday belongs to the previous Monday
  assert.equal(getKarachiMonthStartISO('2026-10-03'), '2026-10-01');
  assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01');
  assert.equal(formatKarachiDateTime('2026-10-02T19:00:00Z'), '3 Oct 2026, 12:00 am PKT');
});

test('sales metrics: pct change, formatting, chart', () => {
  assert.equal(pctChange(150, 100), 50);
  assert.equal(pctChange(80, 100), -20);
  assert.equal(pctChange(10, 0), null);
  assert.equal(formatPct(12.84), '+12.8%');
  assert.equal(formatPct(-3), '-3.0%');
  assert.equal(formatPct(null), 'no previous data');
  assert.equal(niceCeil(1234), 2000);
  assert.equal(niceCeil(0), 0);
  assert.equal(formatCompact(1500000), '1.5M');
  assert.equal(formatCompact(2500), '2.5k');
  const empty = buildChart([{ date: '2026-10-01', revenue: 0, litres: 0 }], 7);
  assert.equal(empty.empty, true);
  const series = [{ date: '2026-10-01', revenue: 100, litres: 1 }, { date: '2026-10-02', revenue: 400, litres: 4 }, { date: '2026-10-03', revenue: 200, litres: 2 }];
  const c = buildChart(series, 7);
  assert.equal(c.empty, false);
  assert.deepEqual(c.xLabels, ['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.equal(c.ticks[0], '500');
  assert.match(c.revenuePath, /^M0\.0 /);
  assert.match(c.revenueArea, / Z$/);
});

test('money formatters', () => {
  assert.equal(formatPKR(4835900.4), 'PKR 4,835,900');
  assert.equal(formatPrice(268.7), 'PKR 268.70');
});

test('12-hour shift system follows the Karachi clock (Day 7 AM-7 PM, Night 7 PM-7 AM)', () => {
  const at = iso => getKarachiShift(new Date(iso));
  assert.equal(at('2026-10-03T01:59:00Z').id, 'night');   // 06:59 PKT
  assert.equal(at('2026-10-03T02:00:00Z').id, 'day');     // 07:00 PKT
  assert.equal(at('2026-10-03T13:59:00Z').id, 'day');     // 18:59 PKT
  assert.equal(at('2026-10-03T14:00:00Z').id, 'night');   // 19:00 PKT
  assert.equal(at('2026-10-02T19:00:00Z').id, 'night');   // 00:00 PKT (past midnight, still night)
  assert.equal(at('2026-10-03T08:00:00Z').name, 'Shift 1 - Day');
  assert.equal(at('2026-10-03T08:00:00Z').hours, '7:00 AM - 7:00 PM');
  assert.equal(at('2026-10-03T16:00:00Z').hours, '7:00 PM - 7:00 AM');
});
