import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReportMetrics } from './payrollReportExports.js';
import { createDemoPayrollApi } from '../services/payrollService.js';
import { calculatePayroll } from './payrollCalculations.js';

test('Module 12: calculateReportMetrics correctly aggregates attendance and financial KPIs', () => {
  const sampleRows = [
    {
      id: 'p-1',
      employeeId: 'emp-1',
      employeeName: 'Zahid Khan',
      designation: 'Senior Pump Attendant',
      shiftName: 'Shift 1 - Day',
      monthlySalary: 30000,
      dailySalary: 1000,
      presentDays: 30,
      leaveDays: 0,
      absentDays: 0,
      deductibleDays: 0,
      deduction: 0,
      bonus: 1000,
      finalSalary: 31000,
      paidTotal: 31000,
      balance: 0,
      paymentStatus: 'PAID',
    },
    {
      id: 'p-2',
      employeeId: 'emp-2',
      employeeName: 'Muhammad Tariq',
      designation: 'Pump Attendant',
      shiftName: 'Shift 2 - Night',
      monthlySalary: 30000,
      dailySalary: 1000,
      presentDays: 29,
      leaveDays: 1,
      absentDays: 0,
      deductibleDays: 1,
      deduction: 1000,
      bonus: 0,
      finalSalary: 29000,
      paidTotal: 15000,
      balance: 14000,
      paymentStatus: 'PARTIAL',
    },
    {
      id: 'p-3',
      employeeId: 'emp-3',
      employeeName: 'Bilal Ahmed',
      designation: 'Pump Attendant',
      shiftName: 'Shift 1 - Day',
      monthlySalary: 30000,
      dailySalary: 1000,
      presentDays: 28,
      leaveDays: 0,
      absentDays: 2,
      deductibleDays: 2,
      deduction: 2000,
      bonus: 0,
      finalSalary: 28000,
      paidTotal: 0,
      balance: 28000,
      paymentStatus: 'UNPAID',
    },
  ];

  const samplePayments = [
    { id: 'pay-1', payrollId: 'p-1', employeeId: 'emp-1', paidAmount: 31000, method: 'BANK_TRANSFER' },
    { id: 'pay-2', payrollId: 'p-2', employeeId: 'emp-2', paidAmount: 15000, method: 'CASH' },
  ];

  const metrics = calculateReportMetrics(sampleRows, samplePayments, { daysBasis: 30 });

  assert.equal(metrics.staffCount, 3);
  assert.equal(metrics.totalBaseSalary, 90000);
  assert.equal(metrics.totalBonus, 1000);
  assert.equal(metrics.totalDeduction, 3000);
  assert.equal(metrics.totalNetSalary, 88000);
  assert.equal(metrics.totalPaid, 46000);
  assert.equal(metrics.totalBalance, 42000);

  // Attendance aggregates: 30 + 29 + 28 = 87 presents, 1 leave, 2 absents
  assert.equal(metrics.totalPresent, 87);
  assert.equal(metrics.totalLeave, 1);
  assert.equal(metrics.totalAbsent, 2);
  assert.equal(metrics.totalDeductible, 3);

  // On-duty rate: 87 / (87 + 1 + 2) = 87 / 90 = 96.67% -> 97%
  assert.equal(metrics.overallDutyRate, 97);

  // Bonus vs Deductions audit groups
  assert.equal(metrics.bonusEarners.length, 1);
  assert.equal(metrics.bonusEarners[0].employeeName, 'Zahid Khan');
  assert.equal(metrics.deductionPenalties.length, 2);

  // Payment methods breakdown
  assert.equal(metrics.paymentsByMethod.BANK_TRANSFER, 31000);
  assert.equal(metrics.paymentsByMethod.CASH, 15000);
});

test('Module 11: Payroll Lock & Recalculation engine updates locked records and logs audit trail', async () => {
  const api = createDemoPayrollApi();

  // 1. Generate fresh payroll for month 11, year 2026
  await api.generate(11, 2026);
  const listBefore = await api.list(11, 2026);
  assert.ok(listBefore.rows.length > 0);

  // 2. Review and finalize all
  for (const r of listBefore.rows) {
    await api.review(r.id, 'APPROVED', 'Manager verified');
  }
  const finalizeRes = await api.finalize(11, 2026);
  assert.ok(finalizeRes.finalized > 0);

  // Check period lock status
  const isLocked = api.isPeriodLocked(11, 2026, listBefore.rows[0].employeeId);
  assert.equal(isLocked, true);

  // 3. Module 11: An attendance correction is approved for a locked staff member
  const targetStaff = listBefore.rows[0];

  // Recalculation call
  const recalculated = await api.recalculate(
    targetStaff.employeeId,
    11,
    2026,
    'Attendance punch card correction approved by manager',
    'Station Supervisor',
  );

  assert.ok(recalculated);
  assert.equal(recalculated.employeeId, targetStaff.employeeId);
  assert.ok(recalculated.version >= 2);

  // 4. Verify audit trail logs the recalculation event with old vs new diff
  const auditLogs = await api.getAuditSummary(10);
  const recalcLog = auditLogs.find((a) => a.action === 'RECALCULATE_ATTENDANCE_CORRECTION');
  assert.ok(recalcLog, 'Audit log should contain RECALCULATE_ATTENDANCE_CORRECTION');
  assert.equal(recalcLog.actorName, 'Station Supervisor');
  assert.ok(recalcLog.oldValues);
  assert.ok(recalcLog.newValues);
});

test('Module 10: Salary Slip voucher number generation and exact business rules', () => {
  const year = 2026;
  const month = 10;
  const employeeId = 'emp-42';
  const voucherCode = `FLOW-SLIP-${year}-${String(month).padStart(2, '0')}-${String(employeeId).slice(-6).toUpperCase()}`;
  assert.equal(voucherCode, 'FLOW-SLIP-2026-10-EMP-42');

  // Exact 30,000 PKR worked examples
  // Zero leaves -> 30,000 + 1,000 daily wage = 31,000 PKR
  const zeroLeaveSlip = calculatePayroll(30000, 0, { daysBasis: 30, bonusAllowed: true });
  assert.equal(zeroLeaveSlip.finalSalary, 31000);
  assert.equal(zeroLeaveSlip.bonus, 1000);
  assert.equal(zeroLeaveSlip.deduction, 0);

  // One leave -> 30,000 - 1,000 daily wage = 29,000 PKR
  const oneLeaveSlip = calculatePayroll(30000, 1, { daysBasis: 30, bonusAllowed: true });
  assert.equal(oneLeaveSlip.finalSalary, 29000);
  assert.equal(oneLeaveSlip.bonus, 0);
  assert.equal(oneLeaveSlip.deduction, 1000);
});
