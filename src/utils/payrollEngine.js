// Payroll Calculation Engine & Salary Configuration (Modules 5 & 6)
//
// Actual Station Rules:
//   Daily Salary = Monthly Salary ÷ 30   (whole rupees)
//
//   0 days off  -> Salary = Monthly Salary + Daily Salary  (perfect-attendance bonus)
//   1 day off   -> Salary = Monthly Salary                 (one free day: no bonus, no deduction)
//   N days off (N >= 2) -> Salary = Monthly Salary − (N − 1) × Daily Salary
//
//   All money is rounded to whole rupees: 0.5 or more rounds up, below 0.5 rounds down.
//
// Example:
//   30,000 salary -> Daily = 1,000
//   0 leaves -> 31,000
//   1 leave  -> 30,000
//   2 leaves -> 29,000
//   3 leaves -> 28,000

export const DEFAULT_WORKING_DAYS_BASIS = 30;
export const FREE_DAYS_PER_MONTH = 1;

// round(n / d) for non-negative integers, halves rounded up
const roundDiv = (n, d) => Math.floor((2 * n + d) / (2 * d));

/**
 * Calculates daily salary given monthly salary and working-day basis.
 * Standard station basis is 30 days.
 *
 * @param {number} monthlySalary
 * @param {number} workingDaysBasis - default 30
 * @returns {number}
 */
export function calculateDailySalary(monthlySalary = 0, workingDaysBasis = DEFAULT_WORKING_DAYS_BASIS) {
  const salary = Math.round(Math.max(0, Number(monthlySalary) || 0));
  const basis = Number(workingDaysBasis) > 0 ? Math.round(Number(workingDaysBasis)) : 30;
  return roundDiv(salary, basis);
}

/**
 * Computes payroll for an employee based on attendance record according to Module 6 rules.
 *
 * @param {Object} params
 * @param {number} params.monthlySalary - Base monthly wage in PKR
 * @param {number} params.leaveDays - Total leave days taken in the period
 * @param {number} [params.absentDays=0] - Unapproved absence days
 * @param {number} [params.presentDays=0] - Days worked
 * @param {number} [params.workingDaysBasis=30] - Base days (default 30)
 * @param {number} [params.advance=0] - Salary advance taken
 * @param {number} [params.overtime=0] - Overtime earnings
 * @returns {Object} Complete payroll breakdown
 */
export function calculateEmployeeSalary({
  monthlySalary = 0,
  leaveDays = 0,
  absentDays = 0,
  presentDays = 0,
  workingDaysBasis = DEFAULT_WORKING_DAYS_BASIS,
  advance = 0,
  overtime = 0,
}) {
  const baseSalary = Math.round(Math.max(0, Number(monthlySalary) || 0));
  const leaves = Math.max(0, Math.round(Number(leaveDays) || 0));
  const absents = Math.max(0, Math.round(Number(absentDays) || 0));
  const presents = Math.max(0, Number(presentDays) || 0);
  const adv = Math.max(0, Number(advance) || 0);
  const ot = Math.max(0, Number(overtime) || 0);
  const basis = Number(workingDaysBasis) > 0 ? Math.round(Number(workingDaysBasis)) : 30;

  const dailySalary = roundDiv(baseSalary, basis);

  // Perfect attendance (no leave, no absent): bonus = +1 daily salary.
  const totalOff = leaves + absents;
  const isPerfectAttendance = totalOff === 0;
  const bonus = isPerfectAttendance ? dailySalary : 0;

  // One day off per month is free. The free day is used on a leave day first, then on an absent day.
  const freeFromLeave = Math.min(leaves, FREE_DAYS_PER_MONTH);
  const freeFromAbsent = Math.min(absents, FREE_DAYS_PER_MONTH - freeFromLeave);
  const deductibleLeaves = leaves - freeFromLeave;
  const deductibleAbsents = absents - freeFromAbsent;
  const deductibleDays = deductibleLeaves + deductibleAbsents;

  // Total is rounded once from the exact fraction (same as the database function).
  const totalAttendanceDeduction = Math.min(roundDiv(deductibleDays * baseSalary, basis), baseSalary);
  const leaveDeduction = Math.min(roundDiv(deductibleLeaves * baseSalary, basis), totalAttendanceDeduction);
  const absentDeduction = totalAttendanceDeduction - leaveDeduction;

  // Calculated gross salary: Monthly Salary + Bonus - Attendance Deductions
  const attendanceAdjustedSalary = baseSalary + bonus - totalAttendanceDeduction;

  // Final net salary accounting for advances and overtime:
  const netSalary = Math.max(0, attendanceAdjustedSalary + ot - adv);

  return {
    monthlySalary: baseSalary,
    dailySalary,
    workingDaysBasis,
    presentDays: presents,
    leaveDays: leaves,
    absentDays: absents,
    isPerfectAttendance,
    bonus,
    leaveDeduction,
    absentDeduction,
    totalAttendanceDeduction,
    advance: adv,
    overtime: ot,
    attendanceAdjustedSalary,
    netSalary,
    freeDayUsed: totalOff > 0,
    deductibleDays,
    ruleSummary: isPerfectAttendance
      ? `0 leaves -> Perfect Attendance Bonus (+PKR ${dailySalary.toLocaleString('en-PK')})`
      : deductibleDays === 0
        ? `${totalOff} day off -> Free day (no deduction)`
        : `${totalOff} days off -> 1 free day, ${deductibleDays} deducted (-PKR ${totalAttendanceDeduction.toLocaleString('en-PK')})`,
  };
}

/**
 * Calculates payroll for a station team given attendance monthly summary.
 *
 * @param {Array} monthlyAttendanceSummary - Array from calculateMonthlyAttendanceSummary
 * @param {number} [workingDaysBasis=30]
 * @returns {Array} List of employee payroll statements
 */
export function generateStationPayrollBatch(monthlyAttendanceSummary = [], workingDaysBasis = DEFAULT_WORKING_DAYS_BASIS) {
  return monthlyAttendanceSummary.map((emp) => {
    const calculation = calculateEmployeeSalary({
      monthlySalary: emp.salary || emp.monthlySalary || 0,
      leaveDays: emp.leaveDays || 0,
      absentDays: emp.absentDays || 0,
      presentDays: emp.presentDays || 0,
      workingDaysBasis,
      advance: emp.advance || 0,
      overtime: emp.overtime || 0,
    });

    return {
      employeeId: emp.employeeId,
      name: emp.name,
      designation: emp.designation,
      shift: emp.shift,
      attendanceRate: emp.attendanceRate,
      ...calculation,
    };
  });
}