import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDailySalary,
  calculateEmployeeSalary,
  generateStationPayrollBatch,
  DEFAULT_WORKING_DAYS_BASIS,
} from './payrollEngine.js';

test('Module 5: Daily salary calculation basis', () => {
  assert.equal(DEFAULT_WORKING_DAYS_BASIS, 30);
  assert.equal(calculateDailySalary(30000, 30), 1000);
  assert.equal(calculateDailySalary(45000, 30), 1500);
  assert.equal(calculateDailySalary(60000, 30), 2000);
  // Decimal precision check
  assert.equal(calculateDailySalary(38000, 30), 1266.67);
});

test('Module 6: Exact user specification examples for 30,000 salary', () => {
  // Base case: 30,000 salary -> Daily = 1,000

  // 0 leaves -> 31,000
  const zeroLeaves = calculateEmployeeSalary({
    monthlySalary: 30000,
    leaveDays: 0,
    absentDays: 0,
    presentDays: 30,
  });
  assert.equal(zeroLeaves.dailySalary, 1000);
  assert.equal(zeroLeaves.bonus, 1000);
  assert.equal(zeroLeaves.totalAttendanceDeduction, 0);
  assert.equal(zeroLeaves.netSalary, 31000);
  assert.equal(zeroLeaves.isPerfectAttendance, true);

  // 1 leave -> 29,000
  const oneLeave = calculateEmployeeSalary({
    monthlySalary: 30000,
    leaveDays: 1,
    absentDays: 0,
    presentDays: 29,
  });
  assert.equal(oneLeave.bonus, 0);
  assert.equal(oneLeave.leaveDeduction, 1000);
  assert.equal(oneLeave.netSalary, 29000);
  assert.equal(oneLeave.isPerfectAttendance, false);

  // 2 leaves -> 28,000
  const twoLeaves = calculateEmployeeSalary({
    monthlySalary: 30000,
    leaveDays: 2,
    absentDays: 0,
    presentDays: 28,
  });
  assert.equal(twoLeaves.bonus, 0);
  assert.equal(twoLeaves.leaveDeduction, 2000);
  assert.equal(twoLeaves.netSalary, 28000);
  assert.equal(twoLeaves.isPerfectAttendance, false);

  // 3 leaves -> 27,000
  const threeLeaves = calculateEmployeeSalary({
    monthlySalary: 30000,
    leaveDays: 3,
    absentDays: 0,
    presentDays: 27,
  });
  assert.equal(threeLeaves.bonus, 0);
  assert.equal(threeLeaves.leaveDeduction, 3000);
  assert.equal(threeLeaves.netSalary, 27000);
  assert.equal(threeLeaves.isPerfectAttendance, false);
});

test('Module 6: Worked example with another staff wage (42,000 salary)', () => {
  // Monthly = 42,000 -> Daily = 1,400
  // 0 leaves -> 42,000 + 1,400 = 43,400
  const zeroLeaves = calculateEmployeeSalary({
    monthlySalary: 42000,
    leaveDays: 0,
  });
  assert.equal(zeroLeaves.dailySalary, 1400);
  assert.equal(zeroLeaves.netSalary, 43400);

  // 2 leaves -> 42,000 - (2 * 1,400) = 39,200
  const twoLeaves = calculateEmployeeSalary({
    monthlySalary: 42000,
    leaveDays: 2,
  });
  assert.equal(twoLeaves.netSalary, 39200);
});

test('Module 6: Advances and overtime adjustments', () => {
  const result = calculateEmployeeSalary({
    monthlySalary: 30000,
    leaveDays: 1, // 29,000
    advance: 5000, // -5,000
    overtime: 2500, // +2,500
  });
  // 30,000 - 1,000 - 5,000 + 2,500 = 26,500
  assert.equal(result.attendanceAdjustedSalary, 29000);
  assert.equal(result.netSalary, 26500);
});

test('Module 6: Batch payroll generation from monthly attendance', () => {
  const monthlySummary = [
    { employeeId: '1', name: 'Imran Shah', designation: 'Pump attendant', shift: 'Shift 1 - Day', salary: 30000, leaveDays: 0, absentDays: 0, presentDays: 30, attendanceRate: 100 },
    { employeeId: '2', name: 'Hamza Raza', designation: 'Senior Cashier', shift: 'Shift 1 - Day', salary: 30000, leaveDays: 1, absentDays: 0, presentDays: 29, attendanceRate: 97 },
    { employeeId: '3', name: 'Fahad Iqbal', designation: 'Pump attendant', shift: 'Shift 2 - Night', salary: 30000, leaveDays: 2, absentDays: 0, presentDays: 28, attendanceRate: 93 },
  ];

  const batch = generateStationPayrollBatch(monthlySummary, 30);
  assert.equal(batch.length, 3);
  assert.equal(batch[0].netSalary, 31000); // 0 leaves -> +1,000 bonus
  assert.equal(batch[0].isPerfectAttendance, true);
  assert.equal(batch[1].netSalary, 29000); // 1 leave -> -1,000 deduction
  assert.equal(batch[1].isPerfectAttendance, false);
  assert.equal(batch[2].netSalary, 28000); // 2 leaves -> -2,000 deduction
  assert.equal(batch[2].isPerfectAttendance, false);
});
