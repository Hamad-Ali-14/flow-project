// Payroll Calculation Engine & Salary Configuration (Modules 5 & 6)
//
// Actual Station Rules:
//   Daily Salary = Monthly Salary ÷ 30
//
//   If Leave Days = 0:
//       Salary = Monthly Salary + Daily Salary  (Perfect-attendance bonus)
//
//   If Leave Days > 0:
//       Salary = Monthly Salary − (Leave Days × Daily Salary)
//
// Example:
//   30,000 salary -> Daily = 1,000
//   0 leaves -> 31,000
//   1 leave  -> 29,000
//   2 leaves -> 28,000
//   3 leaves -> 27,000

export const DEFAULT_WORKING_DAYS_BASIS = 30;

/**
 * Calculates daily salary given monthly salary and working-day basis.
 * Standard station basis is 30 days.
 *
 * @param {number} monthlySalary
 * @param {number} workingDaysBasis - default 30
 * @returns {number}
 */
export function calculateDailySalary(monthlySalary = 0, workingDaysBasis = DEFAULT_WORKING_DAYS_BASIS) {
  const salary = Number(monthlySalary) || 0;
  const basis = Number(workingDaysBasis) > 0 ? Number(workingDaysBasis) : 30;
  return Math.round((salary / basis) * 100) / 100;
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
  const baseSalary = Math.max(0, Number(monthlySalary) || 0);
  const leaves = Math.max(0, Number(leaveDays) || 0);
  const absents = Math.max(0, Number(absentDays) || 0);
  const presents = Math.max(0, Number(presentDays) || 0);
  const adv = Math.max(0, Number(advance) || 0);
  const ot = Math.max(0, Number(overtime) || 0);

  const dailySalary = calculateDailySalary(baseSalary, workingDaysBasis);

  // Perfect-attendance bonus rule:
  // If Leave Days = 0 (and no unapproved absents):
  //   Bonus = +1 Daily Salary
  const isPerfectAttendance = leaves === 0 && absents === 0;
  const bonus = isPerfectAttendance ? dailySalary : 0;

  // Deduction rule:
  // If Leave Days > 0 (or absents):
  //   Deduction = Leave Days × Daily Salary (+ Absent Days × Daily Salary)
  const leaveDeduction = leaves * dailySalary;
  const absentDeduction = absents * dailySalary;
  const totalAttendanceDeduction = leaveDeduction + absentDeduction;

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
    ruleSummary: isPerfectAttendance
      ? `0 leaves -> Perfect Attendance Bonus (+PKR ${dailySalary.toLocaleString('en-PK')})`
      : `${leaves} leave(s) -> Deduction (-PKR ${leaveDeduction.toLocaleString('en-PK')})`,
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
