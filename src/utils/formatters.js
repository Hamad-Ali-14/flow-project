// Display helpers only. Locale matches the rest of the app (en-PK).
const number = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });
const fixed2 = new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safe = value => (Number.isFinite(value) ? value : 0);

export const formatLiters = (value, { fixed = false } = {}) => `${(fixed ? fixed2 : number).format(safe(value))} L`;

export const formatSignedLiters = value => `${value > 0 ? '+' : value < 0 ? '-' : ''}${number.format(Math.abs(safe(value)))} L`;

export const formatMm = value => `${number.format(safe(value))} mm`;

// "Nozzles 3-4", "Nozzles 1, 2, 5", "Nozzle 3"
export function formatNozzleRange(nozzleNumbers) {
  const nums = nozzleNumbers.map(Number);
  if (!nums.length) return 'No nozzles';
  if (nums.length === 1) return `Nozzle ${nozzleNumbers[0]}`;
  const sorted = [...nums].sort((a, b) => a - b);
  const consecutive = sorted.every((n, i) => Number.isInteger(n) && (i === 0 || n === sorted[i - 1] + 1));
  return consecutive ? `Nozzles ${sorted[0]}-${sorted[sorted.length - 1]}` : `Nozzles ${nozzleNumbers.join(', ')}`;
}

// Money. Whole rupees for totals, two decimals for per-litre prices.
const money0 = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
export const formatPKR = value => `PKR ${money0.format(Math.round(safe(value)))}`;
export const formatPrice = value => `PKR ${fixed2.format(safe(value))}`;
