import test from 'node:test';
import assert from 'node:assert/strict';
import { scopePayrollData, scopeByPayrollRows, summarizePayrollRows } from './payrollScope.js';
import { buildShiftScope } from './rbac.js';

const DAY = 'day-id';
const NIGHT = 'night-id';
const rows = [
  { id: 'p1', employeeId: 'e1', shiftId: DAY, shiftName: 'Shift 1 - Day', status: 'DRAFT', monthlySalary: 55000, bonus: 1833, deduction: 0, finalSalary: 56833, paidTotal: 56833 },
  { id: 'p2', employeeId: 'e2', shiftId: NIGHT, shiftName: 'Shift 2 - Night', status: 'APPROVED', monthlySalary: 40000, bonus: 0, deduction: 0, finalSalary: 40000, paidTotal: 38667 },
  { id: 'p3', employeeId: 'e3', shiftId: DAY, shiftName: 'Shift 1 - Day', status: 'DRAFT', monthlySalary: 42000, bonus: 0, deduction: 0, finalSalary: 42000, paidTotal: 40600 },
  { id: 'p4', employeeId: 'e4', shiftId: null, shiftName: 'Shift 1 - Day', status: 'DRAFT', monthlySalary: 30000, bonus: 0, deduction: 0, finalSalary: 30000, paidTotal: 0 },
];
const data = { rows, settings: { daysBasis: 30 }, summary: { ...summarizePayrollRows(rows), missingEmployees: [{ id: 'm1', name: 'A', shiftId: DAY }, { id: 'm2', name: 'B', shiftId: NIGHT }, { id: 'm3', name: 'C' }] } };

test('owner / admin get the payroll data untouched', () => {
  assert.equal(scopePayrollData(buildShiftScope({ role: 'owner' }), data), data);
  assert.equal(scopePayrollData(buildShiftScope({ role: 'admin' }), data), data);
});

test('a Day manager only gets Day payroll rows and Day-only totals', () => {
  const scope = buildShiftScope({ role: 'manager', shiftId: DAY, shiftName: 'Shift 1 - Day' });
  const out = scopePayrollData(scope, data);
  assert.deepEqual(out.rows.map(r => r.id), ['p1', 'p3']);
  assert.equal(out.summary.count, 2);
  assert.equal(out.summary.totalPayable, 56833 + 42000);
  assert.equal(out.summary.totalPaid, 56833 + 40600);
  assert.equal(out.summary.approved, 0); // the Night approval must not leak into the counters
  assert.deepEqual(out.summary.missingEmployees.map(m => m.id), ['m1']);
  assert.deepEqual(out.settings, { daysBasis: 30 });
});

test('payments and audit entries follow the in-scope payroll rows', () => {
  const scope = buildShiftScope({ role: 'manager', shiftId: NIGHT, shiftName: 'Shift 2 - Night' });
  const visible = scopePayrollData(scope, data).rows;
  const payments = [{ id: 'a', employeeId: 'e1' }, { id: 'b', employeeId: 'e2' }];
  assert.deepEqual(scopeByPayrollRows(scope, payments, visible).map(p => p.id), ['b']);
  assert.equal(scopeByPayrollRows(buildShiftScope({ role: 'owner' }), payments, visible).length, 2);
});

test('no shift assigned -> nothing', () => {
  const out = scopePayrollData(buildShiftScope({ role: 'manager' }), data);
  assert.equal(out.rows.length, 0);
  assert.equal(out.summary.totalPayable, 0);
});

test('rows without a shift id get it from the roster, so a Day manager still sees Day staff', async () => {
  const { attachShiftFromRoster } = await import('./payrollScope.js');
  const raw = { rows: [{ id: 'p1', employeeId: 'e1', status: 'DRAFT', finalSalary: 100 }, { id: 'p2', employeeId: 'e2', status: 'DRAFT', finalSalary: 200 }], summary: { missingEmployees: [] } };
  const roster = [{ id: 'e1', shiftId: DAY }, { id: 'e2', shiftId: NIGHT }];
  const out = scopePayrollData(buildShiftScope({ role: 'manager', shiftId: DAY }), attachShiftFromRoster(raw, roster));
  assert.deepEqual(out.rows.map(r => r.id), ['p1']);
  assert.equal(out.summary.totalPayable, 100);
});
