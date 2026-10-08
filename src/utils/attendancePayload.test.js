import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceRow } from './attendancePayload.js';

const emp = '3f2b8c1e-9a4d-4e6b-8f10-1234567890ab';
const shift = '11111111-2222-4333-8444-555555555555';

test('payload matches the attendance table columns', () => {
  const row = buildAttendanceRow({ employeeId: emp, date: '2026-10-09', status: 'PRESENT', shiftId: shift, checkInTime: '19:00' });
  assert.equal(row.employee_id, emp);
  assert.equal(row.date, '2026-10-09');
  assert.equal(row.status, 'Present'); // table CHECK allows Present | Absent | Leave
  assert.equal(row.shift_id, shift);
  assert.equal(row.attendance_source, 'Manual');
  assert.equal(row.check_in_time, '19:00');
});

test('placeholder shift ids become null instead of breaking the insert', () => {
  assert.equal(buildAttendanceRow({ employeeId: emp, date: '2026-10-09', status: 'Leave', shiftId: 'shift-night' }).shift_id, null);
});

test('bad input is rejected with a specific message', () => {
  assert.throws(() => buildAttendanceRow({ employeeId: 'abc', date: '2026-10-09', status: 'Present' }), /employee_id "abc"/);
  assert.throws(() => buildAttendanceRow({ employeeId: emp, date: '9/10/2026', status: 'Present' }), /YYYY-MM-DD/);
  assert.throws(() => buildAttendanceRow({ employeeId: emp, date: '2026-10-09', status: 'Half-Day' }), /Present, Absent or Leave/);
});
