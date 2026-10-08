import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePayroll, deductibleDays, monthLabel } from './payrollCalculations.js';

test('the 30,000 example from the spec', () => {
  const expected = { 0: 31000, 1: 29000, 2: 28000, 3: 27000 };
  for (const [leaves, final] of Object.entries(expected)) {
    const r = calculatePayroll(30000, Number(leaves));
    assert.equal(r.finalSalary, final, `${leaves} leaves`);
    assert.equal(r.dailySalary, 1000);
  }
});

test('zero leave gives a bonus of one daily salary and no deduction', () => {
  const r = calculatePayroll(30000, 0);
  assert.deepEqual([r.bonus, r.deduction], [1000, 0]);
});

test('any leave gives a deduction and no bonus', () => {
  const r = calculatePayroll(30000, 2);
  assert.deepEqual([r.bonus, r.deduction], [0, 2000]);
});

test('bonus can be withheld by the caller', () => {
  const r = calculatePayroll(30000, 0, { bonusAllowed: false });
  assert.deepEqual([r.bonus, r.finalSalary], [0, 30000]);
});

test('non-round daily salary: deduction is rounded once, not per day', () => {
  const r = calculatePayroll(25000, 3); // 25000 / 30 = 833.333...
  assert.equal(r.dailySalary, 833.33);
  assert.equal(r.deduction, 2500); // 3 x 833.33 would give 2499.99
  assert.equal(r.finalSalary, 22500);
});

test('pay never goes below zero', () => {
  assert.equal(calculatePayroll(30000, 45).finalSalary, 0);
});

test('a different working-day basis is honoured', () => {
  assert.equal(calculatePayroll(31000, 1, { daysBasis: 31 }).finalSalary, 30000);
});

test('invalid input is rejected', () => {
  assert.throws(() => calculatePayroll(-1, 0), /INVALID_INPUT/);
  assert.throws(() => calculatePayroll(1000, -1), /INVALID_INPUT/);
  assert.throws(() => calculatePayroll(1000, 1.5), /INVALID_INPUT/);
  assert.throws(() => calculatePayroll(1000, 0, { daysBasis: 0 }), /INVALID_INPUT/);
});

test('absent counts as leave by default and can be switched off', () => {
  assert.equal(deductibleDays({ leave: 1, absent: 2 }), 3);
  assert.equal(deductibleDays({ leave: 1, absent: 2 }, false), 1);
});

test('month label', () => assert.equal(monthLabel(10, 2026), 'October 2026'));
