// Attendance domain logic, stats aggregation, filtering and payroll-ready helpers.

export const ATTENDANCE_STATUSES = Object.freeze(['Present', 'Absent', 'Leave']);
export const ATTENDANCE_SOURCES = Object.freeze(['Manual', 'Biometric', 'System']);

/**
 * Checks if a designation corresponds to a fuel filler / pump attendant.
 * Fuel station pump operators are typically designated as 'Pump attendant', 'Filler',
 * 'Fuel attendant', 'Dispenser operator', etc.
 */
export function isFiller(designation = '') {
  if (!designation) return false;
  const d = designation.toLowerCase().trim();
  return (
    d.includes('attendant') ||
    d.includes('filler') ||
    d.includes('dispenser') ||
    d.includes('nozzle') ||
    d.includes('pump')
  );
}

/**
 * Validates a single attendance record before save/upsert.
 */
export function validateAttendanceRecord(record) {
  if (!record || typeof record !== 'object') {
    return { valid: false, error: 'Record must be a valid object' };
  }
  if (!record.employeeId && !record.employee_id) {
    return { valid: false, error: 'Employee ID is required' };
  }
  if (!record.date || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
    return { valid: false, error: 'Valid date (YYYY-MM-DD) is required' };
  }
  if (!record.status || !ATTENDANCE_STATUSES.includes(record.status)) {
    return { valid: false, error: `Status must be one of: ${ATTENDANCE_STATUSES.join(', ')}` };
  }
  return { valid: true, error: null };
}

/**
 * Calculates aggregate stats for a list of attendance records for a specific day or filtered set.
 */
export function calculateAttendanceStats(records = [], totalEmployees = 0) {
  let present = 0;
  let absent = 0;
  let leave = 0;

  for (const r of records) {
    if (r.status === 'Present') present++;
    else if (r.status === 'Absent') absent++;
    else if (r.status === 'Leave') leave++;
  }

  const markedCount = present + absent + leave;
  const total = Math.max(totalEmployees, markedCount);
  const unmarked = Math.max(0, total - markedCount);
  const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;

  return {
    total,
    present,
    absent,
    leave,
    unmarked,
    attendanceRate,
  };
}

/**
 * Calculates monthly attendance summary per employee.
 * Crucial foundation for Module 5 & 6 (Payroll calculation & perfect-attendance bonus).
 *
 * @param {Array} records - Attendance records for the target month
 * @param {Array} employees - All station employees
 * @param {number} totalWorkingDaysInMonth - e.g. 30 or days in month
 */
export function calculateMonthlyAttendanceSummary(records = [], employees = [], totalWorkingDaysInMonth = 30) {
  // Map records by employee ID
  const byEmp = new Map();

  for (const emp of employees) {
    const id = emp.id || emp[0]; // support both object and array format
    const name = emp.full_name || emp.name || emp[0] || 'Unknown';
    const designation = emp.designation || emp[1] || 'Staff';
    const shift = emp.shiftName || emp.shifts?.name || emp[2] || 'Shift 1 - Day';
    const salary = Number(emp.monthly_salary || emp.salary || (typeof emp[4] === 'string' ? emp[4].replace(/[^0-9]/g, '') : 0)) || 0;

    byEmp.set(String(id), {
      employeeId: String(id),
      name,
      designation,
      shift,
      salary,
      presentDays: 0,
      leaveDays: 0,
      absentDays: 0,
      markedDays: 0,
    });
  }

  for (const r of records) {
    const empId = String(r.employee_id || r.employeeId);
    let entry = byEmp.get(empId);
    if (!entry) {
      entry = {
        employeeId: empId,
        name: r.employee_name || r.employeeName || 'Staff Member',
        designation: r.designation || 'Staff',
        shift: r.shift_name || r.shiftName || 'Shift 1 - Day',
        salary: 0,
        presentDays: 0,
        leaveDays: 0,
        absentDays: 0,
        markedDays: 0,
      };
      byEmp.set(empId, entry);
    }

    if (r.status === 'Present') entry.presentDays++;
    else if (r.status === 'Leave') entry.leaveDays++;
    else if (r.status === 'Absent') entry.absentDays++;
    entry.markedDays++;
  }

  return Array.from(byEmp.values()).map((emp) => {
    const effectiveDays = totalWorkingDaysInMonth > 0 ? totalWorkingDaysInMonth : 30;
    const attendanceRate = effectiveDays > 0 ? Math.round((emp.presentDays / effectiveDays) * 100) : 0;
    // Perfect attendance rule: 0 leaves AND 0 absents AND worked at least some days
    const isPerfectAttendance = emp.leaveDays === 0 && emp.absentDays === 0 && emp.presentDays > 0;

    return {
      ...emp,
      totalWorkingDays: effectiveDays,
      attendanceRate,
      isPerfectAttendance,
    };
  });
}

/**
 * Filters attendance records by search term, shift, status, and date range.
 */
export function filterAttendanceRecords(records = [], filters = {}) {
  const { search = '', shift = 'all', status = 'all', date, startDate, endDate } = filters;
  const q = search.trim().toLowerCase();

  return records.filter((r) => {
    if (date && r.date !== date) return false;
    if (startDate && r.date < startDate) return false;
    if (endDate && r.date > endDate) return false;

    if (status && status !== 'all' && r.status !== status) return false;

    if (shift && shift !== 'all') {
      const shiftName = (r.shift_name || r.shiftName || '').toLowerCase();
      const target = shift.toLowerCase();
      if (!shiftName.includes(target) && shift !== r.shift_id && shift !== r.shiftId) {
        return false;
      }
    }

    if (q) {
      const name = (r.employee_name || r.employeeName || r.name || '').toLowerCase();
      const designation = (r.designation || '').toLowerCase();
      const notes = (r.notes || '').toLowerCase();
      if (!name.includes(q) && !designation.includes(q) && !notes.includes(q)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Prepares bulk attendance entries for fillers/attendants for a given date and shift.
 */
export function prepareBulkFillerAttendance({
  employees = [],
  date,
  shiftId,
  shiftName = 'Shift 1 - Day',
  status = 'Present',
  source = 'Manual',
  existingRecords = [],
}) {
  const existingMap = new Map();
  for (const r of existingRecords) {
    if (r.date === date) {
      existingMap.set(String(r.employee_id || r.employeeId), r);
    }
  }

  const fillerRecords = [];

  for (const emp of employees) {
    const id = String(emp.id || emp[0]);
    const name = emp.full_name || emp.name || emp[0];
    const designation = emp.designation || emp[1] || '';
    const empShift = emp.shiftName || emp.shift_name || emp.shift_id || emp.shiftId || emp[2] || '';

    // Check if employee is a pump attendant / filler
    if (isFiller(designation)) {
      // If a specific shift is targeted, only include employees assigned to that shift or general
      if (shiftName && shiftName !== 'all') {
        const empShiftStr = String(empShift).toLowerCase();
        const targetShiftStr = shiftName.toLowerCase();
        if (empShiftStr && !empShiftStr.includes('general') && !empShiftStr.includes(targetShiftStr)) {
          continue;
        }
      }

      fillerRecords.push({
        employee_id: id,
        employee_name: name,
        designation,
        date,
        shift_id: shiftId || null,
        shift_name: shiftName,
        status,
        attendance_source: source,
        notes: 'Bulk filler attendance marked',
      });
    }
  }

  return fillerRecords;
}

/**
 * Formats attendance summary records as CSV string for download/export.
 */
export function exportAttendanceToCsv(summary = [], monthLabel = '') {
  const headers = [
    'Employee Name',
    'Designation',
    'Shift',
    'Total Working Days',
    'Present Days',
    'Leave Days',
    'Absent Days',
    'Attendance Rate (%)',
    'Perfect Attendance',
  ];

  const rows = summary.map((s) => [
    `"${(s.name || '').replace(/"/g, '""')}"`,
    `"${(s.designation || '').replace(/"/g, '""')}"`,
    `"${(s.shift || '').replace(/"/g, '""')}"`,
    s.totalWorkingDays,
    s.presentDays,
    s.leaveDays,
    s.absentDays,
    `${s.attendanceRate}%`,
    s.isPerfectAttendance ? 'YES' : 'NO',
  ]);

  return [
    `# FLOW OPS - Monthly Attendance Register (${monthLabel || 'Summary'})`,
    headers.join(','),
    ...rows.map((r) => r.join(',')),
  ].join('\r\n');
}
