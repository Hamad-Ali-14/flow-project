// Shift-scoped views of payroll data (see rbac.js). Pure helpers so they can be unit-tested.
import { employeeInScope } from './rbac.js';

const num = v => Number(v) || 0;

// Summary block for a set of payroll rows (same shape payroll_list returns, camelCased).
export function summarizePayrollRows(rows = [], missingEmployees = []) {
  const count = status => rows.filter(r => r.status === status).length;
  const sum = pick => rows.reduce((a, r) => a + num(pick(r)), 0);
  return {
    count: rows.length,
    draft: count('DRAFT'),
    approved: count('APPROVED'),
    rejected: count('REJECTED'),
    finalized: count('FINALIZED'),
    totalBase: sum(r => r.monthlySalary),
    totalBonus: sum(r => r.bonus),
    totalDeduction: sum(r => r.deduction),
    totalPayable: sum(r => r.finalSalary),
    totalPaid: sum(r => r.paidTotal),
    missingEmployees,
  };
}

// Restricts a payroll list response ({ rows, summary, settings }) to what `scope` may see.
// Owner / admin: returned untouched. Shift manager: only their shift's rows, with the summary
// recomputed from those rows so no other shift's totals leak through the KPI cards.
export function scopePayrollData(scope, data) {
  if (!data || !scope || !scope.scoped) return data;
  const rows = (data.rows || []).filter(r => employeeInScope(scope, { shiftId: r.shiftId, shiftName: r.shiftName }));
  // Entries without a shift id (older database) are dropped: fail closed.
  const missing = (data.summary?.missingEmployees || []).filter(m => employeeInScope(scope, { shiftId: m.shiftId ?? m.shift_id }));
  return { ...data, rows, summary: summarizePayrollRows(rows, missing) };
}

// Payments / audit entries carry only an employee id: keep those of in-scope payroll rows.
export function scopeByPayrollRows(scope, items, rows, idOf = x => x.employeeId) {
  if (!scope || !scope.scoped) return items || [];
  const allowed = new Set((rows || []).map(r => String(r.employeeId)));
  return (items || []).filter(x => allowed.has(String(idOf(x))));
}

// Older payroll_list versions do not return the employee's shift id. Fill it in from the staff roster
// (employee id -> shift id) so shift scoping works without running any SQL. Rows whose employee is not on
// the roster stay without a shift id and are therefore hidden from managers (fail closed).
export function attachShiftFromRoster(data, roster = []) {
  if (!data) return data;
  const shiftOf = new Map((roster || []).map(e => [String(e.id), e.shiftId || null]));
  const fill = r => (r.shiftId || r.shift_id ? r : { ...r, shiftId: shiftOf.get(String(r.employeeId ?? r.id)) || null });
  return {
    ...data,
    rows: (data.rows || []).map(fill),
    summary: data.summary
      ? { ...data.summary, missingEmployees: (data.summary.missingEmployees || []).map(m => fill({ ...m, employeeId: m.id })) }
      : data.summary,
  };
}
