// Run with: npm test   (uses Node's built-in test runner; no extra dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDispensedLiters, calculateStockPercentage, calculateCurrentStock, calculateTankStatus,
  checkStockBounds, validateReceiveQuantity, validateAdjustment, validateMeterReading,
  projectShiftClosing, parseDecimalInput, withStockMetrics, roundLiters, InventoryValidationError, STOCK_STATUS_THRESHOLDS,
} from './inventoryCalculations.js';
import { formatNozzleRange, formatLiters, formatSignedLiters } from './formatters.js';

test('calculateDispensedLiters: normal values from the requirements', () => {
  assert.equal(calculateDispensedLiters(125000, 125850), 850);
  assert.equal(calculateDispensedLiters(210000, 210700), 700);
});

test('calculateDispensedLiters: zero dispensed and decimals', () => {
  assert.equal(calculateDispensedLiters(500, 500), 0);
  assert.equal(calculateDispensedLiters(100.1, 100.3), 0.2); // no float drift
  assert.equal(calculateDispensedLiters(0, 0), 0);
});

test('calculateDispensedLiters: rejects closing < opening', () => {
  assert.throws(() => calculateDispensedLiters(125850, 125000), err => err instanceof InventoryValidationError && err.code === 'INVALID_METER');
});

test('calculateDispensedLiters: rejects negative / non-numeric readings', () => {
  assert.throws(() => calculateDispensedLiters(-1, 10), /negative/);
  assert.throws(() => calculateDispensedLiters(10, -1), /negative/);
  assert.throws(() => calculateDispensedLiters(NaN, 10), /valid numbers/);
  assert.throws(() => calculateDispensedLiters('10', 20), /valid numbers/);
  assert.throws(() => calculateDispensedLiters(10, undefined), /valid numbers/);
});

test('calculateStockPercentage: example from the requirements (57.89%)', () => {
  assert.equal(calculateStockPercentage(24750, 42750), 57.89);
});

test('calculateStockPercentage: zero, full, over-full, bad capacity', () => {
  assert.equal(calculateStockPercentage(0, 42750), 0);
  assert.equal(calculateStockPercentage(42750, 42750), 100);
  assert.equal(calculateStockPercentage(50000, 42750), 100);
  assert.equal(calculateStockPercentage(-5, 42750), 0);
  assert.equal(calculateStockPercentage(100, 0), 0);
  assert.equal(calculateStockPercentage(NaN, 100), 0);
});

test('calculateCurrentStock: Tank 2 worked example = 33,200 L', () => {
  assert.equal(calculateCurrentStock(24750, 10000, 850 + 700), 33200);
});

test('calculateCurrentStock: adjustments, zeros and validation', () => {
  assert.equal(calculateCurrentStock(20000, 0, 0, -150), 19850);
  assert.equal(calculateCurrentStock(20000, 0, 0, 150), 20150);
  assert.equal(calculateCurrentStock(0, 0, 0, 0), 0);
  assert.equal(calculateCurrentStock(100), 100);
  assert.throws(() => calculateCurrentStock(100, -1, 0), InventoryValidationError);
  assert.throws(() => calculateCurrentStock(100, 0, -1), InventoryValidationError);
  assert.throws(() => calculateCurrentStock(NaN, 0, 0), InventoryValidationError);
});

test('insufficient stock: result goes negative and is flagged by checkStockBounds', () => {
  const stock = calculateCurrentStock(1000, 0, 1500);
  assert.equal(stock, -500);
  assert.deepEqual(checkStockBounds(stock, 42750), { ok: false, code: 'INSUFFICIENT_STOCK' });
  assert.deepEqual(checkStockBounds(0, 42750), { ok: true, code: null }); // exactly empty is allowed
});

test('capacity overflow: 40,000 + 5,000 > 42,750 is rejected', () => {
  assert.deepEqual(checkStockBounds(45000, 42750), { ok: false, code: 'CAPACITY_EXCEEDED' });
  const result = validateReceiveQuantity({ quantity: 5000, currentStock: 40000, capacity: 42750 });
  assert.equal(result.valid, false);
  assert.equal(result.code, 'CAPACITY_EXCEEDED');
  assert.equal(result.spaceAvailable, 2750);
  assert.match(result.message, /exceed the tank capacity/);
});

test('validateReceiveQuantity: valid, exact-fill, zero and negative', () => {
  assert.equal(validateReceiveQuantity({ quantity: 10000, currentStock: 24750, capacity: 42750 }).valid, true);
  assert.equal(validateReceiveQuantity({ quantity: 10000, currentStock: 24750, capacity: 42750 }).projectedStock, 34750);
  assert.equal(validateReceiveQuantity({ quantity: 18000, currentStock: 24750, capacity: 42750 }).valid, true); // exactly full
  assert.equal(validateReceiveQuantity({ quantity: 0, currentStock: 100, capacity: 200 }).code, 'INVALID_QUANTITY');
  assert.equal(validateReceiveQuantity({ quantity: -5, currentStock: 100, capacity: 200 }).code, 'INVALID_QUANTITY');
  assert.equal(validateReceiveQuantity({ quantity: NaN, currentStock: 100, capacity: 200 }).code, 'INVALID_QUANTITY');
});

test('calculateTankStatus: thresholds >=30 GOOD, 10-29.99 LOW, <10 CRITICAL', () => {
  assert.equal(STOCK_STATUS_THRESHOLDS.good, 30);
  assert.equal(calculateTankStatus(57.89), 'GOOD');
  assert.equal(calculateTankStatus(30), 'GOOD');
  assert.equal(calculateTankStatus(29.99), 'LOW');
  assert.equal(calculateTankStatus(10), 'LOW');
  assert.equal(calculateTankStatus(9.99), 'CRITICAL');
  assert.equal(calculateTankStatus(0), 'CRITICAL');
  assert.equal(calculateTankStatus(NaN), 'CRITICAL');
});

test('validateAdjustment: reconciliation example (-150) and bounds', () => {
  const ok = validateAdjustment({ direction: 'decrease', amountText: '150', currentStock: 20000, capacity: 42750 });
  assert.equal(ok.valid, true);
  assert.equal(ok.signedAmount, -150);
  assert.equal(ok.projectedStock, 19850);
  assert.equal(validateAdjustment({ direction: 'decrease', amountText: '500', currentStock: 100, capacity: 42750 }).code, 'INSUFFICIENT_STOCK');
  assert.equal(validateAdjustment({ direction: 'increase', amountText: '5000', currentStock: 40000, capacity: 42750 }).code, 'CAPACITY_EXCEEDED');
  assert.equal(validateAdjustment({ direction: 'increase', amountText: '0', currentStock: 100, capacity: 200 }).valid, false);
  assert.equal(validateAdjustment({ direction: 'increase', amountText: 'abc', currentStock: 100, capacity: 200 }).valid, false);
});

test('validateMeterReading: valid, blank, lower than opening, bad text, too many decimals', () => {
  const ok = validateMeterReading(125000, '125,850.00');
  assert.equal(ok.valid, true);
  assert.equal(ok.dispensed, 850);
  assert.equal(validateMeterReading(125000, '').valid, false);
  assert.equal(validateMeterReading(125000, '').entered, false);
  const low = validateMeterReading(125000, '124999');
  assert.equal(low.valid, false);
  assert.match(low.error, /cannot be lower/);
  assert.equal(validateMeterReading(100, '12x').valid, false);
  assert.equal(validateMeterReading(100, '-5').valid, false);
  assert.equal(validateMeterReading(100, '100.123').valid, false);
  assert.equal(validateMeterReading(100, '100').dispensed, 0);
});

const stationTanks = [
  { id: 't2', name: 'Tank 2', fuelName: 'Petrol / PMG', currentStock: 34750, nozzles: [
    { id: 'n3', nozzleNumber: '3', currentMeter: 125000, active: true },
    { id: 'n4', nozzleNumber: '4', currentMeter: 210000, active: true },
    { id: 'n9', nozzleNumber: '9', currentMeter: 5, active: false }] },
];

test('projectShiftClosing: totals, projected stock and ignoring inactive nozzles', () => {
  const p = projectShiftClosing(stationTanks, { n3: '125850', n4: '210700' });
  assert.equal(p.valid, true);
  assert.equal(p.totalDispensed, 1550);
  assert.equal(p.tanks[0].projectedStock, 33200);
  assert.equal(p.tanks[0].nozzles.length, 2);
});

test('projectShiftClosing: invalid when a reading is missing, low, or stock is insufficient', () => {
  assert.equal(projectShiftClosing(stationTanks, { n3: '125850' }).valid, false);
  assert.equal(projectShiftClosing(stationTanks, { n3: '100', n4: '210700' }).valid, false);
  const insufficient = projectShiftClosing(stationTanks, { n3: '999999', n4: '999999' });
  assert.equal(insufficient.valid, false);
  assert.equal(insufficient.tanks[0].insufficient, true);
});

test('parseDecimalInput / roundLiters edge cases', () => {
  assert.deepEqual(parseDecimalInput('10,000'), { value: 10000, error: null });
  assert.equal(parseDecimalInput('1.234').error, 'Use at most 2 decimal places.');
  assert.equal(parseDecimalInput('-1').error, 'Enter a valid number.');
  assert.deepEqual(parseDecimalInput('-1.5', { allowNegative: true }), { value: -1.5, error: null });
  assert.equal(roundLiters(0.1 + 0.2), 0.3);
  assert.equal(roundLiters(-1.005), -1.01);
  assert.equal(Object.is(roundLiters(-0.001), 0), true); // never "-0"
});

test('formatters', () => {
  assert.equal(formatNozzleRange(['3', '4']), 'Nozzles 3-4');
  assert.equal(formatNozzleRange(['1', '2', '5']), 'Nozzles 1, 2, 5');
  assert.equal(formatNozzleRange(['3']), 'Nozzle 3');
  assert.equal(formatNozzleRange([]), 'No nozzles');
  assert.equal(formatLiters(24750), '24,750 L');
  assert.equal(formatLiters(125000, { fixed: true }), '125,000.00 L');
  assert.equal(formatSignedLiters(-850), '-850 L');
  assert.equal(formatSignedLiters(10000), '+10,000 L');
});

test('withStockMetrics: ONE derivation of percentage + status for every page', () => {
  const t1 = withStockMetrics({ currentStock: 23850, capacity: 45000, active: true });
  assert.equal(t1.percentage, 53);
  assert.equal(t1.status, 'GOOD');
  assert.equal(withStockMetrics({ currentStock: 12825, capacity: 42750, active: true }).percentage, 30);
  assert.equal(withStockMetrics({ currentStock: 12825, capacity: 42750, active: true }).status, 'GOOD'); // 30% is the GOOD boundary
  const t3 = withStockMetrics({ currentStock: 855, capacity: 42750, active: true });
  assert.equal(t3.percentage, 2);
  assert.equal(t3.status, 'CRITICAL');
  assert.equal(t3.statusLabel, 'Critical');
  assert.equal(t3.statusTone, 'danger');
  assert.equal(withStockMetrics({ currentStock: 5, capacity: 10, active: false }).status, 'INACTIVE');
  assert.equal(withStockMetrics({ currentStock: 1, capacity: 100 }).currentStock, 1); // keeps original fields
});
