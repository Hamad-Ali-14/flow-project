import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessPage, filterNavForRole, buildShiftScope, employeeInScope, filterByShiftScope } from './rbac.js';

const nav = ['overview', 'shifts', 'station', 'expenses', 'people', 'income', 'reports'].map((id) => ({ id }));

test('owner and admin can open every page', () => {
  for (const role of ['owner', 'admin']) {
    for (const n of nav) assert.equal(canAccessPage(role, n.id), true);
  }
});

test('manager can open expenses, people and income but not reports', () => {
  for (const id of ['expenses', 'people', 'income', 'overview', 'shifts', 'station', 'settings']) {
    assert.equal(canAccessPage('manager', id), true, id);
  }
  assert.equal(canAccessPage('manager', 'reports'), false);
});

test('supervisor and attendant stay locked out of ledgers', () => {
  for (const role of ['supervisor', 'attendant']) {
    for (const id of ['expenses', 'people', 'income', 'reports']) assert.equal(canAccessPage(role, id), false);
  }
});

test('manager nav keeps the owner order', () => {
  assert.deepEqual(
    filterNavForRole('manager', nav).map((n) => n.id),
    ['overview', 'shifts', 'station', 'expenses', 'people', 'income'],
  );
});

// ---- Shift scope (Attendance + Employees & salaries) ----
const DAY = 'day-id';
const NIGHT = 'night-id';
const staff = [
  { name: 'Bilal', shiftId: DAY },
  { name: 'Fahad', shiftId: NIGHT },
  { name: 'Hamza', shiftId: DAY },
  { name: 'Rizwan', shiftId: null }, // General / unassigned
];

test('owner and admin are unscoped and keep the very same list', () => {
  for (const role of ['owner', 'admin']) {
    const scope = buildShiftScope({ role });
    assert.equal(scope.scoped, false);
    assert.equal(filterByShiftScope(scope, staff), staff);
    assert.equal(employeeInScope(scope, { shiftId: null }), true);
  }
});

test('a manager only sees employees of their own shift', () => {
  const day = buildShiftScope({ role: 'manager', shiftId: DAY, shiftName: 'Shift 1 - Day' });
  assert.deepEqual(filterByShiftScope(day, staff).map((s) => s.name), ['Bilal', 'Hamza']);
  const night = buildShiftScope({ role: 'manager', shiftId: NIGHT, shiftName: 'Shift 2 - Night' });
  assert.deepEqual(filterByShiftScope(night, staff).map((s) => s.name), ['Fahad']);
});

test('scope fails closed: no shift assigned, unassigned employees and other roles see nothing', () => {
  assert.deepEqual(filterByShiftScope(buildShiftScope({ role: 'manager' }), staff), []);
  assert.deepEqual(filterByShiftScope(buildShiftScope({ role: 'supervisor', shiftId: DAY }), staff).map((s) => s.name), ['Bilal', 'Hamza']);
  assert.equal(employeeInScope(buildShiftScope({ role: 'manager', shiftId: DAY }), { shiftId: null }), false);
  assert.equal(employeeInScope(buildShiftScope({ role: null }), { shiftId: DAY }), false);
  // snake_case rows straight from the API are understood too
  assert.equal(employeeInScope(buildShiftScope({ role: 'manager', shiftId: DAY }), { shift_id: DAY }), true);
});

test('page access: attendance and payroll stay open to managers, owner-only pages stay closed', () => {
  assert.equal(canAccessPage('manager', 'attendance'), true);
  assert.equal(canAccessPage('manager', 'payroll'), true);
  assert.equal(canAccessPage('manager', 'reports'), false);
});
