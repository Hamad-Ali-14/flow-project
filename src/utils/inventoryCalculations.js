// Pure inventory maths and validation. No React, no Supabase.
//
// IMPORTANT: these functions power previews and inline validation in the UI.
// The database functions (supabase/migrations/20261001_tank_inventory.sql) are the
// authority and re-validate everything; the browser is never trusted for stock.

// Centralised so the thresholds can be tuned in ONE place.
export const STOCK_STATUS_THRESHOLDS = Object.freeze({ good: 30, low: 10 }); // % of capacity

export const TANK_STATUS_META = Object.freeze({
  GOOD: { label: 'Good', tone: 'success' },
  LOW: { label: 'Low', tone: 'warning' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
});

export class InventoryValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'InventoryValidationError';
    this.code = code;
    this.details = details;
  }
}

const isNumber = value => typeof value === 'number' && Number.isFinite(value);

// Round to 2 decimals (litres are stored as numeric(14,2)); symmetric for negatives.
export function roundLiters(value) {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(value) + Number.EPSILON) * 100)) / 100 || 0;
}

// Parses what a person types ("10,000", "850.5"). Returns {value, error}.
export function parseDecimalInput(text, { maxDecimals = 2, allowNegative = false } = {}) {
  const raw = String(text ?? '').replace(/[,\s]/g, '');
  if (raw === '') return { value: null, error: 'Enter a value.' };
  const pattern = allowNegative ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/;
  if (!pattern.test(raw)) return { value: null, error: 'Enter a valid number.' };
  const decimals = (raw.split('.')[1] || '').length;
  if (decimals > maxDecimals) {
    return { value: null, error: `Use at most ${maxDecimals} decimal place${maxDecimals === 1 ? '' : 's'}.` };
  }
  return { value: Number(raw), error: null };
}

// Dispensed = Closing Meter - Opening Meter. Throws on invalid input.
export function calculateDispensedLiters(openingMeter, closingMeter) {
  if (!isNumber(openingMeter) || !isNumber(closingMeter)) {
    throw new InventoryValidationError('INVALID_METER', 'Meter readings must be valid numbers.');
  }
  if (openingMeter < 0 || closingMeter < 0) {
    throw new InventoryValidationError('INVALID_METER', 'Meter readings cannot be negative.');
  }
  if (closingMeter < openingMeter) {
    throw new InventoryValidationError(
      'INVALID_METER',
      'Closing meter cannot be lower than the opening meter.',
      { openingMeter, closingMeter },
    );
  }
  return roundLiters(closingMeter - openingMeter);
}

// Revenue = Litres Sold x Active Unit Price, rounded to paisa (matches the database).
export function calculateSaleAmount(litres, unitPrice) {
  if (!isNumber(litres) || !isNumber(unitPrice) || litres < 0 || unitPrice < 0) return 0;
  return roundLiters(litres * unitPrice);
}

// (Current Stock / Capacity) * 100, clamped to 0-100 and rounded to 2 decimals.
export function calculateStockPercentage(currentStock, capacity) {
  if (!isNumber(currentStock) || !isNumber(capacity) || capacity <= 0) return 0;
  const pct = (currentStock / capacity) * 100;
  return roundLiters(Math.min(100, Math.max(0, pct)));
}

// Current = Previous + Received - Dispensed +/- Adjustments. May return a negative
// number: callers must run checkStockBounds() before treating it as a valid stock.
export function calculateCurrentStock(previousStock, fuelReceived = 0, totalDispensed = 0, adjustments = 0) {
  const parts = { previousStock, fuelReceived, totalDispensed, adjustments };
  for (const [name, value] of Object.entries(parts)) {
    if (!isNumber(value)) throw new InventoryValidationError('INVALID_QUANTITY', `${name} must be a valid number.`);
  }
  if (fuelReceived < 0 || totalDispensed < 0) {
    throw new InventoryValidationError('INVALID_QUANTITY', 'Received and dispensed quantities cannot be negative.');
  }
  return roundLiters(previousStock + fuelReceived - totalDispensed + adjustments);
}

// Stock must stay within 0..capacity.
export function checkStockBounds(stock, capacity) {
  if (stock < 0) return { ok: false, code: 'INSUFFICIENT_STOCK' };
  if (stock > capacity) return { ok: false, code: 'CAPACITY_EXCEEDED' };
  return { ok: true, code: null };
}

// GOOD >= 30%, LOW 10-29.99%, CRITICAL < 10% (see STOCK_STATUS_THRESHOLDS).
export function calculateTankStatus(stockPercentage) {
  const pct = isNumber(stockPercentage) ? stockPercentage : 0;
  if (pct >= STOCK_STATUS_THRESHOLDS.good) return 'GOOD';
  if (pct >= STOCK_STATUS_THRESHOLDS.low) return 'LOW';
  return 'CRITICAL';
}

export function validateReceiveQuantity({ quantity, currentStock, capacity }) {
  if (!isNumber(quantity) || quantity <= 0) {
    return { valid: false, code: 'INVALID_QUANTITY', message: 'Quantity must be greater than zero.' };
  }
  const spaceAvailable = roundLiters(capacity - currentStock);
  const projectedStock = calculateCurrentStock(currentStock, quantity, 0, 0);
  if (projectedStock > capacity) {
    return {
      valid: false, code: 'CAPACITY_EXCEEDED', spaceAvailable, projectedStock,
      message: `This delivery would exceed the tank capacity. Only ${spaceAvailable.toLocaleString('en-PK')} L of space is available.`,
    };
  }
  return { valid: true, code: null, message: null, spaceAvailable, projectedStock };
}

// direction: 'increase' | 'decrease'; amountText is what the person typed (always positive).
export function validateAdjustment({ direction, amountText, currentStock, capacity }) {
  const { value, error } = parseDecimalInput(amountText);
  if (error) return { valid: false, code: 'INVALID_QUANTITY', message: error, signedAmount: null, projectedStock: null };
  if (value <= 0) return { valid: false, code: 'INVALID_QUANTITY', message: 'Adjustment must be greater than zero.', signedAmount: null, projectedStock: null };
  const signedAmount = direction === 'decrease' ? -value : value;
  const projectedStock = calculateCurrentStock(currentStock, 0, 0, signedAmount);
  const bounds = checkStockBounds(projectedStock, capacity);
  if (!bounds.ok) {
    const message = bounds.code === 'INSUFFICIENT_STOCK'
      ? 'This adjustment would make the tank stock negative.'
      : 'This adjustment would exceed the tank capacity.';
    return { valid: false, code: bounds.code, message, signedAmount, projectedStock };
  }
  return { valid: true, code: null, message: null, signedAmount, projectedStock };
}

// Validates one nozzle's closing meter as typed. Returns per-row state for the UI.
export function validateMeterReading(openingMeter, closingText) {
  const { value, error } = parseDecimalInput(closingText);
  if (error) return { valid: false, entered: String(closingText ?? '').trim() !== '', error, closing: null, dispensed: null };
  if (value < openingMeter) {
    return {
      valid: false, entered: true, closing: value, dispensed: null,
      error: 'Closing meter cannot be lower than the opening meter.',
    };
  }
  return { valid: true, entered: true, error: null, closing: value, dispensed: calculateDispensedLiters(openingMeter, value) };
}

// Preview of a whole-station shift closing from the closing meters typed so far.
// tanks: [{id, name, currentStock, nozzles:[{id, nozzleNumber, currentMeter, active}]}]
// inputs: { [nozzleId]: '125850' }
export function projectShiftClosing(tanks, inputs) {
  let totalDispensed = 0;
  let totalRevenue = 0;
  let allValid = true;
  const tankRows = tanks
    .map(tank => {
      const nozzles = tank.nozzles.filter(n => n.active).map(n => {
        const state = validateMeterReading(n.currentMeter, inputs[n.id]);
        return { ...n, ...state };
      });
      if (!nozzles.length) return null;
      const unitPrice = isNumber(tank.unitPrice) ? tank.unitPrice : null; // null = prices not visible to this user
      nozzles.forEach(n => { n.amount = unitPrice === null ? null : calculateSaleAmount(n.dispensed || 0, unitPrice); });
      const dispensed = roundLiters(nozzles.reduce((sum, n) => sum + (n.dispensed || 0), 0));
      const revenue = unitPrice === null ? null : roundLiters(nozzles.reduce((sum, n) => sum + n.amount, 0));
      const projectedStock = roundLiters(tank.currentStock - dispensed);
      const insufficient = projectedStock < 0;
      const hasErrors = nozzles.some(n => !n.valid);
      if (hasErrors || insufficient) allValid = false;
      totalDispensed += dispensed;
      if (revenue !== null) totalRevenue += revenue;
      return { id: tank.id, name: tank.name, fuelName: tank.fuelName, currentStock: tank.currentStock, unitPrice, revenue, nozzles, dispensed, projectedStock, insufficient, hasErrors };
    })
    .filter(Boolean);
  const pricesVisible = tankRows.length > 0 && tankRows.every(t => t.unitPrice !== null);
  // Litres to sell on a fuel whose price is still 0 means the owner has not set a price yet.
  const missing = tankRows.find(t => t.unitPrice !== null && t.unitPrice <= 0 && t.dispensed > 0);
  return {
    tanks: tankRows, totalDispensed: roundLiters(totalDispensed),
    totalRevenue: pricesVisible ? roundLiters(totalRevenue) : null,
    missingPriceFuel: missing ? missing.fuelName : null,
    valid: allValid && tankRows.length > 0,
  };
}

// THE one place a tank gets its percentage and status. Every view (Tanks & nozzles,
// Overview snapshot, reports) must go through this, so two pages can never disagree.
export function withStockMetrics(tank) {
  const percentage = calculateStockPercentage(tank.currentStock, tank.capacity);
  const status = tank.active === false ? 'INACTIVE' : calculateTankStatus(percentage);
  const meta = TANK_STATUS_META[status] || { label: 'Inactive', tone: '' };
  return { ...tank, percentage, status, statusLabel: meta.label, statusTone: meta.tone };
}
