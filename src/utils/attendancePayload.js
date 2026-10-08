// ---- Attendance write helpers ------------------------------------------------------------
// The attendance table accepts exactly: employee_id (uuid), date (YYYY-MM-DD), status Present|Absent|Leave,
// shift_id (uuid or null) and HH:MM(:SS) times. Anything else is rejected HERE with a precise message
// instead of surfacing later as an opaque database error.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const ATTENDANCE_STATUSES = { present: 'Present', absent: 'Absent', leave: 'Leave' };

export class AttendanceError extends Error {
  constructor(message, { code, details, hint, payload } = {}) {
    super(message);
    this.name = 'AttendanceError';
    this.code = code || null;
    this.details = details || null;
    this.hint = hint || null;
    this.payload = payload || null;
  }
}

// Validates one attendance record and returns the exact row sent to the database.
export function buildAttendanceRow(r) {
  const employeeId = r.employeeId || r.employee_id;
  const status = ATTENDANCE_STATUSES[String(r.status || '').trim().toLowerCase()];
  const shiftId = r.shiftId || r.shift_id;
  const problems = [];
  if (!UUID_RE.test(String(employeeId || ''))) problems.push(`employee_id "${employeeId}" is not a valid id`);
  if (!ISO_DATE_RE.test(String(r.date || ''))) problems.push(`date "${r.date}" must be YYYY-MM-DD`);
  if (!status) problems.push(`status "${r.status}" must be Present, Absent or Leave`);
  const checkIn = r.checkInTime || r.check_in_time || null;
  const checkOut = r.checkOutTime || r.check_out_time || null;
  if (checkIn && !TIME_RE.test(checkIn)) problems.push(`check_in_time "${checkIn}" must be HH:MM`);
  if (checkOut && !TIME_RE.test(checkOut)) problems.push(`check_out_time "${checkOut}" must be HH:MM`);
  if (problems.length) {
    throw new AttendanceError(`Invalid attendance data: ${problems.join('; ')}`, { code: 'VALIDATION', payload: r });
  }
  return {
    employee_id: employeeId,
    date: r.date,
    status,
    // Placeholder ids from the demo roster ("shift-day") are not uuids: send null rather than failing the insert.
    shift_id: UUID_RE.test(String(shiftId || '')) ? shiftId : null,
    notes: r.notes || null,
    attendance_source: r.attendanceSource || r.attendance_source || 'Manual',
    check_in_time: checkIn,
    check_out_time: checkOut,
    updated_at: new Date().toISOString(),
  };
}
