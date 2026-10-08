// Used when Supabase is NOT configured and demo mode was NOT explicitly requested.
// It never returns tank data: the UI shows a clear "not connected" state instead of
// silently substituting sample stock that looks real but is lost on refresh.
import { inventoryError } from './inventoryErrors';
import { supabaseConfigStatus } from '../lib/supabaseClient';

const refuse = async () => {
  throw inventoryError('NOT_CONFIGURED', { problems: supabaseConfigStatus.problems, seen: supabaseConfigStatus.seenNames });
};

export function createUnconfiguredInventory() {
  return {
    mode: 'unconfigured',
    // A truthy "session" lets the page proceed to getOverview(), which reports the real problem.
    auth: { async getSession() { return { email: null }; }, onChange() { return () => {}; }, async signIn() {}, async signOut() {},
      async requestPasswordReset() {}, async updatePassword() {}, recovery: { active: false, error: null, mark() {}, clear() {} } },
    getOverview: refuse, receiveFuel: refuse, closeShift: refuse, openShift: refuse,
    recordDip: refuse, adjustStock: refuse, getFuelPrices: refuse, setFuelPrice: refuse,
    cancelScheduledPrice: refuse, applyDuePrices: refuse, getSalesSummary: refuse, listTransactions: refuse, listDips: refuse,
    getExpenses: refuse, saveExpense: refuse, getOtherIncome: refuse, saveOtherIncome: refuse,
    getEmployees: refuse, saveEmployee: refuse, getShiftReconciliation: refuse,
    getStaffRoster: refuse, getAttendance: refuse, markAttendance: refuse, bulkMarkAttendance: refuse,
    getAttendanceAuditLog: refuse, correctAttendanceRecord: refuse,
  };
}
