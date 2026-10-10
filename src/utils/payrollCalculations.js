// Payroll rule (Module 6). The database function public.calculate_payroll is authoritative;
// this is its JavaScript mirror, used for previews, labels and tests. Keep the two in step.
//
// Input "days" = total leave (+ absent, when the setting counts it) days in the month.
//
//   Daily = Monthly / basis, shown in whole rupees
//   0 days  -> Salary = Monthly + 1 Daily (perfect-attendance bonus)
//   1 day   -> Salary = Monthly           (one day off is free: no bonus, no deduction)
//   N >= 2  -> Salary = Monthly - (N - 1) x Daily   (never below zero)
//
// Every money value is a whole rupee: a fraction of 0.5 or more rounds UP, below 0.5 rounds DOWN.
// Integer maths only, so results never drift from floating point.

export const DEFAULT_DAYS_BASIS = 30;
export const FREE_DAYS_PER_MONTH = 1;

// round(n / d) for non-negative integers, halves rounded up
const roundDiv = (n, d) => Math.floor((2 * n + d) / (2 * d));

export function calculatePayroll(monthlySalary, leaveAndAbsentDays, { daysBasis = DEFAULT_DAYS_BASIS, bonusAllowed = true } = {}) {
  const salaryRaw = Number(monthlySalary);
  const days = Number(leaveAndAbsentDays);
  if (!Number.isFinite(salaryRaw) || salaryRaw < 0 || !Number.isInteger(days) || days < 0 || !Number.isInteger(daysBasis) || daysBasis < 1) {
    throw new Error('INVALID_INPUT');
  }
  const salary = Math.round(salaryRaw);
  const dailySalary = roundDiv(salary, daysBasis);
  const deductDays = Math.max(0, days - FREE_DAYS_PER_MONTH);
  let bonus = 0;
  let deduction = 0;
  if (days === 0) {
    if (bonusAllowed) bonus = dailySalary;
  } else if (deductDays > 0) {
    deduction = Math.min(roundDiv(deductDays * salary, daysBasis), salary); // exact fraction, rounded once
  }
  return {
    dailySalary,
    deduction,
    bonus,
    finalSalary: Math.max(0, salary + bonus - deduction),
    deductibleDays: deductDays, // days actually deducted (after the free day)
  };
}

// Total days off before the free day: LEAVE always; ABSENT too unless the setting says otherwise.
export function deductibleDays({ leave = 0, absent = 0 }, absentCountsAsLeave = true) {
  return Number(leave) + (absentCountsAsLeave ? Number(absent) : 0);
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (month, year) => `${MONTH_NAMES[month - 1] || '?'} ${year}`;