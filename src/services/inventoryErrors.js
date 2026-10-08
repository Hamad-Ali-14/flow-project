// Turns database / network failures into short, human messages.
// Raw Postgres or PostgREST errors are logged to the console for developers but are
// never shown to the user.

export class InventoryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'InventoryError';
    this.code = code;
    this.details = details;
  }
}

const n = value => Number(value).toLocaleString('en-PK', { maximumFractionDigits: 2 });

// A failed save must never look like a success, and must say the inventory is untouched.
const SAVE_FAILURES = {
  receive: 'Fuel receipt could not be saved. Your inventory was not changed. ',
  adjust: 'Stock adjustment could not be saved. Your inventory was not changed. ',
  shift: 'Shift closing could not be saved. Your inventory was not changed. ',
  dip: 'Dip reading could not be saved. ',
  load: 'Failed to load tanks: ',
  price: 'The price change could not be saved. Prices were not changed. ',
};
const saveFailure = context => SAVE_FAILURES[context] || '';

// context: 'shift' | 'receive' | 'adjust' | 'dip' | 'general'
export function friendlyMessage(code, d = {}, context = 'general') {
  switch (code) {
    case 'NOT_SIGNED_IN': return 'Your session has expired. Please sign in again.';
    case 'NOT_AUTHORIZED':
      return d.action === 'view_tanks'
        ? 'You are signed in, but your account has no active staff profile with a role, so the database refuses tank access. Add a row for your user in the profiles table (roles: owner, admin, manager, supervisor, attendant).'
        : 'You do not have permission to perform this action.';
    case 'DB_PERMISSION': return 'The database denied access (permission denied). Re-run database/schema.sql so the inventory functions are granted to signed-in users, and check any Row Level Security policies.';
    case 'TANK_NOT_FOUND': return 'This tank no longer exists. Refresh the page and try again.';
    case 'TANK_INACTIVE': return `${d.tank_name || 'This tank'} is inactive and cannot be used.`;
    case 'INVALID_QUANTITY': return 'Enter a valid quantity greater than zero (up to 2 decimal places).';
    case 'CAPACITY_EXCEEDED':
      return `This would exceed the capacity of ${d.tank_name || 'the tank'} (${n(d.capacity)} L). Only ${n(d.space_available)} L of space is available.`;
    case 'INSUFFICIENT_STOCK':
      return context === 'shift'
        ? `Insufficient tank stock. Shift closing cannot be completed. ${d.tank_name || 'The tank'} holds ${n(d.available)} L but ${n(d.requested)} L was dispensed.`
        : `Insufficient tank stock. ${d.tank_name || 'The tank'} holds ${n(d.available)} L but ${n(d.requested)} L was requested.`;
    case 'INVALID_METER':
      return `Nozzle ${d.nozzle_number}: the closing meter (${n(d.closing)}) cannot be lower than the opening meter (${n(d.opening)}).`;
    case 'MISSING_READING': return `Enter a closing meter reading for nozzle ${d.nozzle_number}.`;
    case 'INVALID_NOZZLE': return 'One of the nozzles is inactive or no longer exists. Refresh the page and try again.';
    case 'INVALID_READINGS': return 'The closing readings could not be processed. Refresh the page and try again.';
    case 'SHIFT_CLOSED':
      return `${d.shift_number ? `Shift #${d.shift_number} has` : 'This shift has'} already been closed. Refresh the page to see the latest data.`;
    case 'SHIFT_NOT_FOUND': return 'This shift could not be found. Refresh the page and try again.';
    case 'STALE_DATA': return `The opening meter for nozzle ${d.nozzle_number} changed while this form was open. Close the form, refresh and re-enter the readings.`;
    case 'REASON_REQUIRED': return 'A reason is required for a stock adjustment.';
    case 'INVALID_INPUT': return `That text is too long (maximum ${d.max_length || 500} characters).`;
    case 'INVALID_DIP': return 'Enter a valid dip reading in millimetres (at most one decimal place).';
    case 'INVALID_PRICE': return 'Enter a valid price per litre greater than zero (up to 2 decimal places).';
    case 'PRICE_NOT_SET': return `No price is set for ${d.fuel_name || 'this fuel'}. Ask the owner to set the fuel price before closing the shift.`;
    case 'FUEL_NOT_FOUND': return 'This fuel product no longer exists. Refresh the page and try again.';
    case 'SCHEDULE_IN_PAST': return 'The scheduled time must be in the future (and within one year).';
    case 'SCHEDULE_NOT_FOUND': return 'That scheduled price change was already applied or cancelled. Refresh the page.';
    case 'LEDGER_IMMUTABLE': return 'Inventory history cannot be edited or deleted. Post a correcting adjustment instead.';
    case 'STOCK_DIRECT_UPDATE': return 'Tank stock can only change through a recorded inventory transaction.';
    case 'CONNECTION': return `${saveFailure(context)}Unable to reach the server. Check your connection and try again.`;
    case 'NOT_CONFIGURED': {
      const seen = d.seen && d.seen.length ? d.seen.join(', ') : 'none';
      return `Supabase configuration missing: ${(d.problems || ['no connection settings found']).join('; ')}. Supabase-related variables Vite can see: ${seen}. Define them in .env.local in the project root (next to package.json) and restart the dev server. Note: Vite does not read .env.example.`;
    }
    case 'INVALID_KEY': return 'Supabase rejected the API key. Use the anon/publishable key from the same project as the URL.';
    case 'SETUP_REQUIRED': return 'The tank inventory functions were not found in Supabase. Run database/schema.sql in the SQL editor and reload.';
    default: return context === 'load' ? 'Failed to load tanks.' : `${saveFailure(context)}Something went wrong. Please try again.`;
  }
}

export function inventoryError(code, details = {}, context = 'general') {
  return new InventoryError(code, friendlyMessage(code, details, context), details);
}

function parseDetails(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

// Converts whatever Supabase / fetch threw (or returned as `error`) into an InventoryError.
export function toInventoryError(error, context = 'general') {
  if (error instanceof InventoryError) return error;
  const message = String(error?.message || '');

  if (message.startsWith('FLOW:')) {
    const code = message.slice(5).trim();
    return inventoryError(code, parseDetails(error.details), context);
  }
  if (/invalid api key|no api key/i.test(message)) return inventoryError('INVALID_KEY');
  if (['PGRST202', 'PGRST205', '42883', '42P01'].includes(error?.code)) return inventoryError('SETUP_REQUIRED');
  if (error?.code === 'PGRST301' || error?.status === 401) return inventoryError('NOT_SIGNED_IN');
  if (error?.code === '42501') return inventoryError('DB_PERMISSION');
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message) || error?.name === 'TypeError') {
    console.error('[inventory] connection error', error);
    return inventoryError('CONNECTION', {}, context);
  }
  console.error('[inventory] unexpected error', { code: error?.code, message: error?.message, details: error?.details, hint: error?.hint }); // developers only
  const technical = [error?.code, error?.message, error?.details].filter(Boolean).join(' - ');
  const result = inventoryError('UNKNOWN', {}, context);
  result.technical = technical;
  // In development show the actual database error instead of hiding it behind a generic message.
  if (import.meta.env.DEV && technical) result.message += ` [${technical}]`;
  return result;
}
