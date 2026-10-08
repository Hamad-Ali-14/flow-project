import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_SOURCES,
  isFiller,
  validateAttendanceRecord,
  calculateAttendanceStats,
  calculateMonthlyAttendanceSummary,
  filterAttendanceRecords,
  prepareBulkFillerAttendance,
  exportAttendanceToCsv,
} from './attendance.js';

test('Module 1: Attendance validation & rules', () => {
  // Valid record
  const valid = validateAttendanceRecord({
    employeeId: 'emp-1',
    date: '2026-10-08',
    status: 'Present',
    attendanceSource: 'Manual',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.error, null);

  // Status must be Present, Absent, or Leave
  assert.deepEqual(ATTENDANCE_STATUSES, ['Present', 'Absent', 'Leave']);
  assert.deepEqual(ATTENDANCE_SOURCES, ['Manual', 'Biometric', 'System']);

  const badStatus = validateAttendanceRecord({
    employeeId: 'emp-1',
    date: '2026-10-08',
    status: 'Half-Day', // Not allowed in Module 1 rules
  });
  assert.equal(badStatus.valid, false);
  assert.match(badStatus.error, /Status must be one of/);

  // Missing employee
  const missingEmp = validateAttendanceRecord({
    date: '2026-10-08',
    status: 'Present',
  });
  assert.equal(missingEmp.valid, false);

  // Invalid date format
  const badDate = validateAttendanceRecord({
    employeeId: 'emp-1',
    date: '08-10-2026',
    status: 'Present',
  });
  assert.equal(badDate.valid, false);
});

test('Module 2: Bulk attendance for all fillers & Shift 1', () => {
  assert.equal(isFiller('Pump attendant'), true);
  assert.equal(isFiller('Fuel Filler'), true);
  assert.equal(isFiller('Dispenser Attendant'), true);
  assert.equal(isFiller('Station Manager'), false);
  assert.equal(isFiller('Senior Cashier'), false);

  const sampleStaff = [
    { id: '1', name: 'Imran Shah', designation: 'Pump attendant', shiftName: 'Shift 1 - Day' },
    { id: '2', name: 'Hamza Raza', designation: 'Senior Cashier', shiftName: 'Shift 1 - Day' },
    { id: '3', name: 'Fahad Iqbal', designation: 'Pump attendant', shiftName: 'Shift 1 - Day' },
    { id: '4', name: 'Noman Tariq', designation: 'Pump attendant', shiftName: 'Shift 2 - Night' },
    { id: '5', name: 'Bilal Ahmed', designation: 'Shift Supervisor', shiftName: 'Shift 1 - Day' },
  ];

  // Bulk mark for all fillers on Shift 1 - Day
  const bulkEntries = prepareBulkFillerAttendance({
    employees: sampleStaff,
    date: '2026-10-08',
    shiftName: 'Shift 1 - Day',
    status: 'Present',
  });

  // Should only pick the 2 pump attendants belonging to Shift 1 - Day (Imran Shah & Fahad Iqbal)
  assert.equal(bulkEntries.length, 2);
  assert.equal(bulkEntries[0].employee_name, 'Imran Shah');
  assert.equal(bulkEntries[0].status, 'Present');
  assert.equal(bulkEntries[0].attendance_source, 'Manual');
  assert.equal(bulkEntries[1].employee_name, 'Fahad Iqbal');
});

test('Module 3: Daily attendance statistics', () => {
  const records = [
    { employee_id: '1', status: 'Present', date: '2026-10-08' },
    { employee_id: '2', status: 'Present', date: '2026-10-08' },
    { employee_id: '3', status: 'Leave', date: '2026-10-08' },
    { employee_id: '4', status: 'Absent', date: '2026-10-08' },
  ];

  const stats = calculateAttendanceStats(records, 6);
  assert.equal(stats.total, 6);
  assert.equal(stats.present, 2);
  assert.equal(stats.leave, 1);
  assert.equal(stats.absent, 1);
  assert.equal(stats.unmarked, 2);
  assert.equal(stats.attendanceRate, 33); // 2/6 = 33%
});

test('Module 3 & Module 5/6: Monthly attendance summary & perfect attendance rule', () => {
  const employees = [
    { id: 'emp-1', name: 'Ali Star', designation: 'Pump attendant', shiftName: 'Shift 1 - Day', salary: 30000 },
    { id: 'emp-2', name: 'Babar OneLeave', designation: 'Senior Cashier', shiftName: 'Shift 1 - Day', salary: 42000 },
    { id: 'emp-3', name: 'Chaudhry TwoLeaves', designation: 'Pump attendant', shiftName: 'Shift 2 - Night', salary: 38000 },
  ];

  // 30 day records
  const records = [];
  // Ali Star: 30 days present, 0 leaves, 0 absents
  for (let d = 1; d <= 30; d++) {
    const day = String(d).padStart(2, '0');
    records.push({ employee_id: 'emp-1', date: `2026-10-${day}`, status: 'Present' });
  }

  // Babar OneLeave: 29 days present, 1 leave, 0 absents
  for (let d = 1; d <= 29; d++) {
    const day = String(d).padStart(2, '0');
    records.push({ employee_id: 'emp-2', date: `2026-10-${day}`, status: 'Present' });
  }
  records.push({ employee_id: 'emp-2', date: '2026-10-30', status: 'Leave' });

  // Chaudhry TwoLeaves: 28 days present, 2 leaves, 0 absents
  for (let d = 1; d <= 28; d++) {
    const day = String(d).padStart(2, '0');
    records.push({ employee_id: 'emp-3', date: `2026-10-${day}`, status: 'Present' });
  }
  records.push({ employee_id: 'emp-3', date: '2026-10-29', status: 'Leave' });
  records.push({ employee_id: 'emp-3', date: '2026-10-30', status: 'Leave' });

  const summary = calculateMonthlyAttendanceSummary(records, employees, 30);
  assert.equal(summary.length, 3);

  const ali = summary.find(s => s.employeeId === 'emp-1');
  assert.equal(ali.presentDays, 30);
  assert.equal(ali.leaveDays, 0);
  assert.equal(ali.absentDays, 0);
  assert.equal(ali.isPerfectAttendance, true); // Qualifies for perfect-attendance bonus!

  const babar = summary.find(s => s.employeeId === 'emp-2');
  assert.equal(babar.presentDays, 29);
  assert.equal(babar.leaveDays, 1);
  assert.equal(babar.isPerfectAttendance, false);

  const chaudhry = summary.find(s => s.employeeId === 'emp-3');
  assert.equal(chaudhry.presentDays, 28);
  assert.equal(chaudhry.leaveDays, 2);
  assert.equal(chaudhry.isPerfectAttendance, false);
});

test('Module 3: Filters, search and CSV export', () => {
  const records = [
    { employee_id: '1', employee_name: 'Imran Shah', designation: 'Pump attendant', shift_name: 'Shift 1 - Day', status: 'Present', date: '2026-10-08', notes: 'On time' },
    { employee_id: '2', employee_name: 'Hamza Raza', designation: 'Senior Cashier', shift_name: 'Shift 1 - Day', status: 'Leave', date: '2026-10-08', notes: 'Approved medical' },
    { employee_id: '3', employee_name: 'Fahad Iqbal', designation: 'Pump attendant', shift_name: 'Shift 2 - Night', status: 'Absent', date: '2026-10-08', notes: 'Unnotified' },
  ];

  // Search by name
  const filteredName = filterAttendanceRecords(records, { search: 'Imran' });
  assert.equal(filteredName.length, 1);
  assert.equal(filteredName[0].employee_name, 'Imran Shah');

  // Filter by status
  const filteredStatus = filterAttendanceRecords(records, { status: 'Leave' });
  assert.equal(filteredStatus.length, 1);
  assert.equal(filteredStatus[0].employee_name, 'Hamza Raza');

  // Filter by shift
  const filteredShift = filterAttendanceRecords(records, { shift: 'Night' });
  assert.equal(filteredShift.length, 1);
  assert.equal(filteredShift[0].employee_name, 'Fahad Iqbal');

  // CSV export
  const summary = [
    { name: 'Imran Shah', designation: 'Pump attendant', shift: 'Shift 1 - Day', totalWorkingDays: 30, presentDays: 30, leaveDays: 0, absentDays: 0, attendanceRate: 100, isPerfectAttendance: true },
  ];
  const csv = exportAttendanceToCsv(summary, 'October 2026');
  assert.match(csv, /FLOW OPS - Monthly Attendance Register/);
  assert.match(csv, /Imran Shah/);
  assert.match(csv, /YES/);
});
