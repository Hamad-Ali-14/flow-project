// Payroll backend (Modules 7-9). Every call is a Supabase RPC; the database computes and
// validates, this file only calls it and normalises the JSON (numeric strings -> numbers).
// Uses the app's single Supabase client. Errors reuse the FLOW:<CODE> convention.
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js';
import { InventoryError, toInventoryError } from './inventoryErrors.js';
import { calculatePayroll } from '../utils/payrollCalculations.js';
import { karachiToday } from '../utils/payrollUiHelpers.js';

const n = value => (value === null || value === undefined ? null : Number(value));
const money = v => Number(v ?? 0);

const PAYROLL_MESSAGES = {
  PAYROLL_NOT_FOUND: 'This payroll record no longer exists. Refresh and try again.',
  PAYROLL_LOCKED: 'This payroll is finalized and locked. It cannot be changed here.',
  PAYROLL_DIRECT_WRITE: 'Payroll can only be changed through the payroll actions.',
  PAYROLL_LEDGER_IMMUTABLE: 'Payroll history and payments cannot be edited or deleted.',
  PAYROLL_NOT_FINALIZED: 'Salary can only be paid after the payroll is finalized.',
  INVALID_STATE: 'That action is not available for this payroll in its current status. Refresh and try again.',
  INVALID_PERIOD: 'Choose a valid month and year.',
  FUTURE_MONTH: 'Payroll cannot be generated for a month that has not started yet.',
  NOTHING_TO_FINALIZE: 'There are no approved payrolls to finalize for this month.',
  REASON_REQUIRED: 'A reason is required.',
  EMPLOYEE_NOT_FOUND: 'This employee no longer exists.',
  INVALID_METHOD: 'Choose a payment method.',
  REFERENCE_REQUIRED: 'A payment reference is required for non-cash payments.',
  INVALID_AMOUNT: 'Enter a valid amount greater than zero (up to 2 decimal places).',
  INVALID_PAYMENT_DATE: 'The payment date cannot be in the future or before the payroll month.',
  MONTH_NOT_ENDED: 'Payroll can only be finalized after the month has ended. Attendance stays open until then.',
  PAYROLL_FINALIZED_LOCKED: 'Payroll for this month has been finalized and locked. Attendance cannot be modified directly without an approved manager recalculation override.',
};

export function toPayrollError(error) {
  const message = String(error?.message || '');
  if (message.startsWith('FLOW:')) {
    const code = message.slice(5).trim();
    let details = {};
    try { details = JSON.parse(error.details || '{}'); } catch { /* none */ }
    if (code === 'OVERPAYMENT') {
      return new InventoryError(code, `This exceeds the unpaid balance (PKR ${Number(details.balance).toLocaleString('en-PK')}).`, details);
    }
    if (PAYROLL_MESSAGES[code]) return new InventoryError(code, PAYROLL_MESSAGES[code], details);
  }
  // 42883/PGRST202 = function missing: the payroll migration has not been run.
  if (['PGRST202', '42883'].includes(error?.code)) {
    return new InventoryError('SETUP_REQUIRED', 'The payroll functions were not found. Run database/migration_payroll_modules7_9.sql in the Supabase SQL editor and reload.');
  }
  if (error?.code === '42P01') {
    return new InventoryError('SETUP_REQUIRED', 'A payroll table is missing (the attendance table must exist before generating payroll). Run the attendance and payroll migrations.');
  }
  return toInventoryError(error);
}

const mapRow = r => ({
  id: r.id, employeeId: r.employee_id || r.employeeId, employeeName: r.employee_name || r.employeeName,
  designation: r.designation, shiftName: r.shift_name || r.shiftName,
  month: n(r.month), year: n(r.year),
  monthlySalary: money(r.monthly_salary ?? r.monthlySalary), dailySalary: money(r.daily_salary ?? r.dailySalary), daysBasis: n(r.days_basis ?? r.daysBasis) || 30,
  presentDays: n(r.present_days ?? r.presentDays) || 0, absentDays: n(r.absent_days ?? r.absentDays) || 0, leaveDays: n(r.leave_days ?? r.leaveDays) || 0,
  unmarkedDays: n(r.unmarked_days ?? r.unmarkedDays) || 0, deductibleDays: n(r.deductible_days ?? r.deductibleDays) || 0,
  deduction: money(r.deduction), bonus: money(r.bonus), bonusWithheldReason: r.bonus_withheld_reason || r.bonusWithheldReason || null,
  finalSalary: money(r.final_salary ?? r.finalSalary), status: r.status, locked: Boolean(r.locked),
  reviewNote: r.review_note || r.reviewNote || null, reviewedAt: r.reviewed_at || r.reviewedAt, reviewedByName: r.reviewed_by_name || r.reviewedByName,
  finalizedAt: r.finalized_at || r.finalizedAt, finalizedByName: r.finalized_by_name || r.finalizedByName, version: n(r.version) || 1,
  paidTotal: money(r.paid_total ?? r.paidTotal), balance: money(r.balance), paymentStatus: r.payment_status || r.paymentStatus || 'UNPAID',
});

const mapPayment = p => ({
  id: p.id, payrollId: p.payroll_id || p.payrollId, employeeId: p.employee_id || p.employeeId, employeeName: p.employee_name || p.employeeName,
  month: n(p.month), year: n(p.year), finalSalary: n(p.final_salary ?? p.finalSalary),
  paidAmount: money(p.paid_amount ?? p.paidAmount), paymentDate: p.payment_date || p.paymentDate, method: p.method,
  reference: p.reference, note: p.note, status: p.status || 'COMPLETED',
  createdByName: p.created_by_name || p.createdByName, createdAt: p.created_at || p.createdAt,
});

const mapDetail = d => ({
  ...mapRow(d),
  nonPresentDays: (d.non_present_days || d.nonPresentDays || []).map(x => ({ date: x.date, status: x.status })),
  payments: (d.payments || []).map(mapPayment),
  audit: (d.audit || []).map(a => ({
    id: a.id, action: a.action, actorName: a.actor_name || a.actorName, at: a.at, oldValues: a.old_values || a.oldValues, newValues: a.new_values || a.newValues, note: a.note,
  })),
});

// Seed demo employees for standalone / offline operations
const DEMO_STAFF = [
  { id: 'emp-1', name: 'Zahid Khan', designation: 'Senior Pump Attendant', shiftName: 'Shift 1 - Day', monthlySalary: 35000 },
  { id: 'emp-2', name: 'Muhammad Tariq', designation: 'Pump Attendant', shiftName: 'Shift 2 - Night', monthlySalary: 30000 },
  { id: 'emp-3', name: 'Bilal Ahmed', designation: 'Pump Attendant', shiftName: 'Shift 1 - Day', monthlySalary: 30000 },
  { id: 'emp-4', name: 'Usman Ali', designation: 'Station Supervisor', shiftName: 'General Shift', monthlySalary: 45000 },
  { id: 'emp-5', name: 'Rashid Mehmood', designation: 'Pump Attendant', shiftName: 'Shift 1 - Day', monthlySalary: 30000 },
  { id: 'emp-6', name: 'Hamza Farooq', designation: 'Maintenance Tech', shiftName: 'General Shift', monthlySalary: 40000 },
  { id: 'emp-7', name: 'Shahid Iqbal', designation: 'Security Guard', shiftName: 'Shift 2 - Night', monthlySalary: 28000 },
];

export function createDemoPayrollApi() {
  const store = {
    settings: {
      daysBasis: 30,
      absentCountsAsLeave: true,
      bonusEnabled: true,
      bonusRequiresCompleteAttendance: true,
    },
    // Map key: "YYYY-M" -> array of payroll record objects
    recordsByPeriod: new Map(),
    // All payments array
    payments: [],
  };

  // Seed default month (e.g. October 2026)
  const defaultYear = 2026;
  const defaultMonth = 10;
  const key = `${defaultYear}-${defaultMonth}`;

  const defaultRecords = DEMO_STAFF.map((emp, i) => {
    // 0 leaves for first 2 attendants (Bonus test), 1 leave for 3rd, 2 leaves for 4th
    const leaveDays = i === 0 || i === 1 ? 0 : i === 2 ? 1 : i === 3 ? 2 : 0;
    const absentDays = 0;
    const daysOff = leaveDays + absentDays;
    const presentDays = 30 - daysOff;

    const calc = calculatePayroll(emp.monthlySalary, daysOff, { daysBasis: 30, bonusAllowed: true });
    return {
      id: `pr-${emp.id}-${defaultYear}-${defaultMonth}`,
      employeeId: emp.id,
      employeeName: emp.name,
      designation: emp.designation,
      shiftName: emp.shiftName,
      month: defaultMonth,
      year: defaultYear,
      monthlySalary: emp.monthlySalary,
      dailySalary: calc.dailySalary,
      daysBasis: 30,
      presentDays,
      absentDays,
      leaveDays,
      unmarkedDays: 0,
      deductibleDays: calc.deductibleDays, // days actually deducted (1st day off is free)
      deduction: calc.deduction,
      bonus: calc.bonus,
      bonusWithheldReason: null,
      finalSalary: calc.finalSalary,
      status: i === 0 ? 'FINALIZED' : i === 1 ? 'APPROVED' : 'DRAFT',
      locked: i === 0,
      reviewNote: i === 0 ? 'Approved and locked for payout' : null,
      reviewedAt: new Date().toISOString(),
      reviewedByName: 'Station Manager',
      finalizedAt: i === 0 ? new Date().toISOString() : null,
      finalizedByName: i === 0 ? 'Station Manager' : null,
      version: 1,
      paidTotal: i === 0 ? calc.finalSalary : 0,
      balance: i === 0 ? 0 : calc.finalSalary,
      paymentStatus: i === 0 ? 'PAID' : 'UNPAID',
      nonPresentDays: leaveDays > 0 ? [{ date: `${defaultYear}-10-12`, status: 'Leave' }] : [],
      audit: [
        { id: `aud-${i}`, action: 'GENERATED', actorName: 'System', at: new Date().toISOString(), note: 'Initial payroll generation' },
      ],
    };
  });

  store.recordsByPeriod.set(key, defaultRecords);

  // Seed sample payment for the finalized employee
  const emp0 = defaultRecords[0];
  store.payments.push({
    id: `pay-${Date.now()}-1`,
    payrollId: emp0.id,
    employeeId: emp0.employeeId,
    employeeName: emp0.employeeName,
    month: defaultMonth,
    year: defaultYear,
    finalSalary: emp0.finalSalary,
    paidAmount: emp0.finalSalary,
    paymentDate: karachiToday(),
    method: 'bank_transfer',
    reference: 'HBL-9921448',
    note: 'October salary transferred directly to staff account',
    status: 'COMPLETED',
    createdByName: 'Station Manager',
    createdAt: new Date().toISOString(),
  });

  return {
    available: true,
    mode: 'demo',

    async list(month, year) {
      const pKey = `${year}-${month}`;
      let rows = store.recordsByPeriod.get(pKey);
      if (!rows) {
        rows = [];
      }

      const count = rows.length;
      const draft = rows.filter(r => r.status === 'DRAFT').length;
      const approved = rows.filter(r => r.status === 'APPROVED').length;
      const rejected = rows.filter(r => r.status === 'REJECTED').length;
      const finalized = rows.filter(r => r.status === 'FINALIZED').length;
      const totalBase = rows.reduce((s, r) => s + r.monthlySalary, 0);
      const totalBonus = rows.reduce((s, r) => s + r.bonus, 0);
      const totalDeduction = rows.reduce((s, r) => s + r.deduction, 0);
      const totalPayable = rows.reduce((s, r) => s + r.finalSalary, 0);
      const totalPaid = rows.reduce((s, r) => s + r.paidTotal, 0);

      const existingEmpIds = new Set(rows.map(r => r.employeeId));
      const missingEmployees = DEMO_STAFF.filter(e => !existingEmpIds.has(e.id)).map(e => ({ id: e.id, name: e.name }));

      return {
        month,
        year,
        settings: store.settings,
        rows: rows.map(mapRow),
        summary: {
          count, draft, approved, rejected, finalized,
          totalBase, totalBonus, totalDeduction, totalPayable, totalPaid,
          missingEmployees,
        },
      };
    },

    async generate(month, year) {
      const pKey = `${year}-${month}`;
      let existingRows = store.recordsByPeriod.get(pKey) || [];
      const rowMap = new Map(existingRows.map(r => [r.employeeId, r]));

      let created = 0;
      let replaced = 0;
      const skipped = [];

      const newRows = [];

      for (const emp of DEMO_STAFF) {
        const existing = rowMap.get(emp.id);
        if (existing) {
          if (existing.locked || existing.status === 'FINALIZED') {
            skipped.push({ employee_id: emp.id, employee_name: emp.name, reason: 'already finalized' });
            newRows.push(existing);
            continue;
          }
          if (existing.status === 'APPROVED') {
            skipped.push({ employee_id: emp.id, employee_name: emp.name, reason: 'already approved' });
            newRows.push(existing);
            continue;
          }
        }

        const deductibleDays = 0; // Default or calculated
        const calc = calculatePayroll(emp.monthlySalary, deductibleDays, { daysBasis: store.settings.daysBasis });

        const record = {
          id: existing?.id || `pr-${emp.id}-${year}-${month}`,
          employeeId: emp.id,
          employeeName: emp.name,
          designation: emp.designation,
          shiftName: emp.shiftName,
          month,
          year,
          monthlySalary: emp.monthlySalary,
          dailySalary: calc.dailySalary,
          daysBasis: store.settings.daysBasis,
          presentDays: 30,
          absentDays: 0,
          leaveDays: 0,
          unmarkedDays: 0,
          deductibleDays: 0,
          deduction: calc.deduction,
          bonus: calc.bonus,
          bonusWithheldReason: null,
          finalSalary: calc.finalSalary,
          status: 'DRAFT',
          locked: false,
          reviewNote: null,
          reviewedAt: null,
          reviewedByName: null,
          finalizedAt: null,
          finalizedByName: null,
          version: (existing?.version || 0) + 1,
          paidTotal: existing?.paidTotal || 0,
          balance: calc.finalSalary - (existing?.paidTotal || 0),
          paymentStatus: existing?.paidTotal >= calc.finalSalary ? 'PAID' : (existing?.paidTotal > 0 ? 'PARTIAL' : 'UNPAID'),
          nonPresentDays: [],
          audit: [
            ...(existing?.audit || []),
            { id: `aud-${Date.now()}`, action: 'RE_GENERATED', actorName: 'Station Manager', at: new Date().toISOString(), note: 'Batch generated' },
          ],
        };

        if (existing) replaced++;
        else created++;

        newRows.push(record);
      }

      store.recordsByPeriod.set(pKey, newRows);
      return { created, replaced, skipped };
    },

    async get(payrollId) {
      for (const list of store.recordsByPeriod.values()) {
        const found = list.find(r => r.id === payrollId);
        if (found) {
          const payments = store.payments.filter(p => p.payrollId === payrollId);
          return mapDetail({ ...found, payments });
        }
      }
      throw new InventoryError('PAYROLL_NOT_FOUND', PAYROLL_MESSAGES.PAYROLL_NOT_FOUND);
    },

    async review(payrollId, decision, note) {
      if (!['APPROVED', 'REJECTED'].includes(decision)) {
        throw new InventoryError('INVALID_STATE', PAYROLL_MESSAGES.INVALID_STATE);
      }
      for (const list of store.recordsByPeriod.values()) {
        const idx = list.findIndex(r => r.id === payrollId);
        if (idx >= 0) {
          const rec = list[idx];
          if (rec.locked) throw new InventoryError('PAYROLL_LOCKED', PAYROLL_MESSAGES.PAYROLL_LOCKED);
          rec.status = decision;
          rec.reviewNote = note || null;
          rec.reviewedAt = new Date().toISOString();
          rec.reviewedByName = 'Station Manager';
          rec.audit.push({
            id: `aud-${Date.now()}`,
            action: `REVIEW_${decision}`,
            actorName: 'Station Manager',
            at: new Date().toISOString(),
            note,
          });
          return mapRow(rec);
        }
      }
      throw new InventoryError('PAYROLL_NOT_FOUND', PAYROLL_MESSAGES.PAYROLL_NOT_FOUND);
    },

    async finalize(month, year) {
      const pKey = `${year}-${month}`;
      const rows = store.recordsByPeriod.get(pKey) || [];
      let finalized = 0;
      let notFinalized = 0;

      for (const r of rows) {
        if (r.status === 'APPROVED') {
          r.status = 'FINALIZED';
          r.locked = true;
          r.finalizedAt = new Date().toISOString();
          r.finalizedByName = 'Station Manager';
          finalized++;
        } else if (r.status !== 'FINALIZED') {
          notFinalized++;
        }
      }
      return { finalized, notFinalized };
    },

    async recordPayment(payrollId, { amount, paymentDate, method, reference, note }) {
      const numAmount = Number(amount);
      if (!numAmount || numAmount <= 0) {
        throw new InventoryError('INVALID_AMOUNT', PAYROLL_MESSAGES.INVALID_AMOUNT);
      }

      for (const list of store.recordsByPeriod.values()) {
        const rec = list.find(r => r.id === payrollId);
        if (rec) {
          if (rec.status !== 'FINALIZED') {
            throw new InventoryError('PAYROLL_NOT_FINALIZED', PAYROLL_MESSAGES.PAYROLL_NOT_FINALIZED);
          }
          if (numAmount > rec.balance) {
            throw new InventoryError('OVERPAYMENT', `This exceeds the unpaid balance (PKR ${rec.balance.toLocaleString('en-PK')}).`, { balance: rec.balance });
          }

          const payment = {
            id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            payrollId,
            employeeId: rec.employeeId,
            employeeName: rec.employeeName,
            month: rec.month,
            year: rec.year,
            finalSalary: rec.finalSalary,
            paidAmount: numAmount,
            paymentDate: paymentDate || karachiToday(),
            method: method || 'cash',
            reference: reference || null,
            note: note || null,
            status: 'COMPLETED',
            createdByName: 'Station Manager',
            createdAt: new Date().toISOString(),
          };

          store.payments.unshift(payment);

          rec.paidTotal += numAmount;
          rec.balance -= numAmount;
          rec.paymentStatus = rec.balance <= 0 ? 'PAID' : 'PARTIAL';
          rec.audit.push({
            id: `aud-${Date.now()}`,
            action: 'RECORD_PAYMENT',
            actorName: 'Station Manager',
            at: new Date().toISOString(),
            note: `Payment of PKR ${numAmount.toLocaleString('en-PK')} recorded via ${method}`,
          });

          const payments = store.payments.filter(p => p.payrollId === payrollId);
          return mapDetail({ ...rec, payments });
        }
      }
      throw new InventoryError('PAYROLL_NOT_FOUND', PAYROLL_MESSAGES.PAYROLL_NOT_FOUND);
    },

    async paymentHistory({ month = null, year = null, employeeId = null } = {}) {
      let filtered = [...store.payments];
      if (month) filtered = filtered.filter(p => p.month === Number(month));
      if (year) filtered = filtered.filter(p => p.year === Number(year));
      if (employeeId) filtered = filtered.filter(p => p.employeeId === employeeId);
      return filtered.map(mapPayment);
    },

    isPeriodLocked(month, year, employeeId = null) {
      const pKey = `${year}-${month}`;
      const rows = store.recordsByPeriod.get(pKey) || [];
      if (employeeId) {
        const found = rows.find(r => r.employeeId === employeeId);
        return found ? found.locked : false;
      }
      return rows.some(r => r.locked);
    },

    async recalculate(employeeId, month, year, reason, actor = 'Station Manager') {
      const pKey = `${year}-${month}`;
      const rows = store.recordsByPeriod.get(pKey) || [];
      const idx = rows.findIndex(r => r.employeeId === employeeId);
      if (idx < 0) throw new InventoryError('PAYROLL_NOT_FOUND', PAYROLL_MESSAGES.PAYROLL_NOT_FOUND);

      const rec = rows[idx];
      const calc = calculatePayroll(rec.monthlySalary, (rec.leaveDays || 0) + (rec.absentDays || 0), { daysBasis: store.settings.daysBasis, bonusAllowed: store.settings.bonusEnabled });
      rec.deductibleDays = calc.deductibleDays;
      
      const oldVals = { finalSalary: rec.finalSalary, balance: rec.balance };
      rec.finalSalary = calc.finalSalary;
      rec.deduction = calc.deduction;
      rec.bonus = calc.bonus;
      rec.balance = Math.max(0, calc.finalSalary - rec.paidTotal);
      rec.paymentStatus = rec.balance <= 0 ? 'PAID' : (rec.paidTotal > 0 ? 'PARTIAL' : 'UNPAID');
      rec.version = (rec.version || 1) + 1;
      rec.audit.push({
        id: `aud-${Date.now()}`,
        action: 'RECALCULATE_ATTENDANCE_CORRECTION',
        actorName: actor,
        at: new Date().toISOString(),
        oldValues: oldVals,
        newValues: { finalSalary: rec.finalSalary, balance: rec.balance },
        note: reason,
      });

      const payments = store.payments.filter(p => p.payrollId === rec.id);
      return mapDetail({ ...rec, payments });
    },

    async getAuditSummary(limit = 50) {
      const logs = [];
      for (const list of store.recordsByPeriod.values()) {
        for (const r of list) {
          for (const a of r.audit || []) {
            logs.push({
              id: a.id,
              payrollId: r.id,
              employeeId: r.employeeId,
              employeeName: r.employeeName,
              month: r.month,
              year: r.year,
              action: a.action,
              actorName: a.actorName,
              at: a.at,
              oldValues: a.oldValues,
              newValues: a.newValues,
              note: a.note,
            });
          }
        }
      }
      logs.sort((a, b) => new Date(b.at) - new Date(a.at));
      return logs.slice(0, limit);
    },

    async getReportsData(month, year) {
      const listRes = await this.list(month, year);
      const payments = await this.paymentHistory({ month, year });
      return {
        month,
        year,
        rows: listRes.rows,
        summary: listRes.summary,
        payments,
        settings: listRes.settings,
      };
    },
  };
}

export function createPayrollApi(client = supabase) {
  const demoApi = createDemoPayrollApi();

  async function rpc(name, args) {
    let result;
    try {
      result = await client.rpc(name, args);
    } catch (thrown) {
      throw toPayrollError(thrown);
    }
    if (result.error) throw toPayrollError(result.error);
    return result.data;
  }

  return {
    available: isSupabaseConfigured,

    async list(month, year) {
      if (!isSupabaseConfigured) return demoApi.list(month, year);
      try {
        const raw = await rpc('payroll_list', { p_month: month, p_year: year });
        const s = raw.summary || {};
        return {
          month: raw.month, year: raw.year,
          settings: raw.settings ? {
            daysBasis: n(raw.settings.days_basis), absentCountsAsLeave: raw.settings.absent_counts_as_leave,
            bonusEnabled: raw.settings.bonus_enabled, bonusRequiresCompleteAttendance: raw.settings.bonus_requires_complete_attendance,
          } : null,
          rows: (raw.rows || []).map(mapRow),
          summary: {
            count: n(s.count) || 0, draft: n(s.draft) || 0, approved: n(s.approved) || 0, rejected: n(s.rejected) || 0, finalized: n(s.finalized) || 0,
            totalBase: money(s.total_base), totalBonus: money(s.total_bonus), totalDeduction: money(s.total_deduction),
            totalPayable: money(s.total_payable), totalPaid: money(s.total_paid), missingEmployees: s.missing_employees || [],
          },
        };
      } catch (err) {
        if (err.code === 'SETUP_REQUIRED' || !isSupabaseConfigured) {
          return demoApi.list(month, year);
        }
        throw err;
      }
    },

    async generate(month, year) {
      if (!isSupabaseConfigured) return demoApi.generate(month, year);
      try {
        const raw = await rpc('payroll_generate', { p_month: month, p_year: year });
        return { created: n(raw.created) || 0, replaced: n(raw.replaced) || 0, skipped: raw.skipped || [] };
      } catch (err) {
        if (err.code === 'SETUP_REQUIRED') return demoApi.generate(month, year);
        throw err;
      }
    },

    async get(payrollId) {
      if (!isSupabaseConfigured) return demoApi.get(payrollId);
      try {
        return mapDetail(await rpc('payroll_get', { p_payroll_id: payrollId }));
      } catch (err) {
        if (err.code === 'SETUP_REQUIRED') return demoApi.get(payrollId);
        throw err;
      }
    },

    async review(payrollId, decision, note) {
      if (!isSupabaseConfigured) return demoApi.review(payrollId, decision, note);
      try {
        return mapRow(await rpc('payroll_review', { p_payroll_id: payrollId, p_decision: decision, p_note: note || null }));
      } catch (err) {
        if (err.code === 'SETUP_REQUIRED') return demoApi.review(payrollId, decision, note);
        throw err;
      }
    },

    async finalize(month, year) {
      if (!isSupabaseConfigured) return demoApi.finalize(month, year);
      try {
        const raw = await rpc('payroll_finalize', { p_month: month, p_year: year });
        return { finalized: n(raw.finalized) || 0, notFinalized: n(raw.not_finalized) || 0 };
      } catch (err) {
        if (err.code === 'SETUP_REQUIRED') return demoApi.finalize(month, year);
        throw err;
      }
    },

    async recordPayment(payrollId, { amount, paymentDate, method, reference, note }) {
      if (!isSupabaseConfigured) return demoApi.recordPayment(payrollId, { amount, paymentDate, method, reference, note });
      try {
        return mapDetail(await rpc('payroll_record_payment', {
          p_payroll_id: payrollId, p_amount: Number(amount), p_payment_date: paymentDate,
          p_method: method, p_reference: reference || null, p_note: note || null,
        }));
      } catch (err) {
        if (err.code === 'SETUP_REQUIRED') return demoApi.recordPayment(payrollId, { amount, paymentDate, method, reference, note });
        throw err;
      }
    },

    async paymentHistory({ month = null, year = null, employeeId = null } = {}) {
      if (!isSupabaseConfigured) return demoApi.paymentHistory({ month, year, employeeId });
      try {
        const raw = await rpc('payroll_payment_history', { p_month: month, p_year: year, p_employee_id: employeeId });
        return (raw || []).map(mapPayment);
      } catch (err) {
        if (err.code === 'SETUP_REQUIRED') return demoApi.paymentHistory({ month, year, employeeId });
        throw err;
      }
    },

    async isPeriodLocked(month, year, employeeId = null) {
      if (!isSupabaseConfigured) return demoApi.isPeriodLocked(month, year, employeeId);
      try {
        const listRes = await this.list(month, year);
        if (employeeId) {
          const found = listRes.rows.find(r => r.employeeId === employeeId);
          return found ? Boolean(found.locked) : false;
        }
        return listRes.rows.some(r => r.locked);
      } catch (err) {
        return demoApi.isPeriodLocked(month, year, employeeId);
      }
    },

    async recalculate(employeeId, month, year, reason, actor = 'Station Manager') {
      if (!isSupabaseConfigured) return demoApi.recalculate(employeeId, month, year, reason, actor);
      try {
        return mapDetail(await rpc('payroll_recalculate_for_correction', {
          p_employee_id: employeeId,
          p_month: Number(month),
          p_year: Number(year),
          p_reason: reason,
          p_actor: actor,
        }));
      } catch (err) {
        if (err.code === 'SETUP_REQUIRED') return demoApi.recalculate(employeeId, month, year, reason, actor);
        throw err;
      }
    },

    async getAuditSummary(limit = 50) {
      if (!isSupabaseConfigured) return demoApi.getAuditSummary(limit);
      try {
        const raw = await rpc('payroll_audit_summary', { p_limit: limit });
        return (raw || []).map(a => ({
          id: a.id,
          payrollId: a.payroll_id,
          employeeId: a.employee_id,
          employeeName: a.employee_name,
          month: n(a.month),
          year: n(a.year),
          action: a.action,
          actorName: a.actor_name,
          at: a.at,
          oldValues: a.old_values,
          newValues: a.new_values,
          note: a.note,
        }));
      } catch (err) {
        if (err.code === 'SETUP_REQUIRED') return demoApi.getAuditSummary(limit);
        throw err;
      }
    },

    async getReportsData(month, year) {
      const listRes = await this.list(month, year);
      const payments = await this.paymentHistory({ month, year });
      return {
        month,
        year,
        rows: listRes.rows,
        summary: listRes.summary,
        payments,
        settings: listRes.settings,
      };
    },
  };
}

export const payrollApi = createPayrollApi();