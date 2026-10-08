// Payroll rule (Module 6). The database function public.calculate_payroll is authoritative;
// this is its JavaScript mirror, used for previews, labels and tests. Keep the two in step.
//
//   Daily = Monthly / basis (full precision; only the money outputs are rounded)
//   deductible days = 0  -> Salary = Monthly + Daily
//   deductible days > 0  -> Salary = Monthly - days x Daily   (never below zero)
//
// Money is computed in paisa (integers) so results never drift from floating point.

export const DEFAULT_DAYS_BASIS = 30;

const toPaisa = rupees => Math.round(Number(rupees) * 100);
const toRupees = paisa => paisa / 100;

export function calculatePayroll(monthlySalary, deductibleDays, { daysBasis = DEFAULT_DAYS_BASIS, bonusAllowed = true } = {}) {
  const salary = Number(monthlySalary);
  const days = Number(deductibleDays);
  if (!Number.isFinite(salary) || salary < 0 || !Number.isInteger(days) || days < 0 || !Number.isInteger(daysBasis) || daysBasis < 1) {
    throw new Error('INVALID_INPUT');
  }
  const salaryPaisa = toPaisa(salary);
  const dailyPaisa = Math.round(salaryPaisa / daysBasis);
  let bonus = 0;
  let deduction = 0;
  if (days === 0) {
    if (bonusAllowed) bonus = dailyPaisa;
  } else {
    deduction = Math.min(Math.round((days * salaryPaisa) / daysBasis), salaryPaisa); // exact fraction, rounded once
  }
  return {
    dailySalary: toRupees(dailyPaisa),
    deduction: toRupees(deduction),
    bonus: toRupees(bonus),
    finalSalary: toRupees(salaryPaisa + bonus - deduction),
  };
}

// Days that reduce pay: LEAVE always; ABSENT too unless the setting says otherwise.
export function deductibleDays({ leave = 0, absent = 0 }, absentCountsAsLeave = true) {
  return Number(leave) + (absentCountsAsLeave ? Number(absent) : 0);
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (month, year) => `${MONTH_NAMES[month - 1] || '?'} ${year}`;
