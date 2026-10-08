import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatPKR } from './formatters.js';
import { monthLabel } from './payrollCalculations.js';
import { fmtDate, METHOD_LABEL } from './payrollUiHelpers.js';

/**
 * Derives comprehensive metrics and aggregations for all 6 Module 12 reports.
 */
export function calculateReportMetrics(rows = [], payments = [], settings = {}) {
  const staffCount = rows.length;
  const daysBasis = settings?.daysBasis || 30;

  // 1. Monthly Attendance Aggregates
  let totalPresent = 0;
  let totalLeave = 0;
  let totalAbsent = 0;
  let totalUnmarked = 0;
  let totalDeductible = 0;

  // 2. Salary Aggregates
  let totalBaseSalary = 0;
  let totalBonus = 0;
  let totalDeduction = 0;
  let totalNetSalary = 0;
  let totalPaid = 0;
  let totalBalance = 0;

  // 3. Employee breakdown
  const employeeStats = rows.map((r) => {
    totalPresent += r.presentDays || 0;
    totalLeave += r.leaveDays || 0;
    totalAbsent += r.absentDays || 0;
    totalUnmarked += r.unmarkedDays || 0;
    totalDeductible += r.deductibleDays || 0;

    totalBaseSalary += r.monthlySalary || 0;
    totalBonus += r.bonus || 0;
    totalDeduction += r.deduction || 0;
    totalNetSalary += r.finalSalary || 0;
    totalPaid += r.paidTotal || 0;
    totalBalance += r.balance || 0;

    const recordedDays = (r.presentDays || 0) + (r.leaveDays || 0) + (r.absentDays || 0);
    const presentRate = recordedDays > 0 ? Math.round(((r.presentDays || 0) / recordedDays) * 100) : 0;
    const leaveRate = recordedDays > 0 ? Math.round(((r.leaveDays || 0) / recordedDays) * 100) : 0;
    const absentRate = recordedDays > 0 ? Math.round(((r.absentDays || 0) / recordedDays) * 100) : 0;

    return {
      ...r,
      recordedDays,
      presentRate,
      leaveRate,
      absentRate,
      isPerfect: (r.bonus || 0) > 0,
      hasPenalties: (r.deduction || 0) > 0,
    };
  });

  const allRecorded = totalPresent + totalLeave + totalAbsent;
  const overallDutyRate = allRecorded > 0 ? Math.round((totalPresent / allRecorded) * 100) : 0;

  // 4. Leave & Bonus Audit groups
  const bonusEarners = employeeStats.filter((e) => e.bonus > 0);
  const deductionPenalties = employeeStats.filter((e) => e.deduction > 0);
  const perfectRate = staffCount > 0 ? Math.round((bonusEarners.length / staffCount) * 100) : 0;

  // 5. Payment Methods Breakdown
  const paymentsByMethod = {};
  for (const p of payments) {
    const m = p.method || 'CASH';
    paymentsByMethod[m] = (paymentsByMethod[m] || 0) + (Number(p.paidAmount) || 0);
  }

  return {
    staffCount,
    daysBasis,
    totalPresent,
    totalLeave,
    totalAbsent,
    totalUnmarked,
    totalDeductible,
    overallDutyRate,
    totalBaseSalary,
    totalBonus,
    totalDeduction,
    totalNetSalary,
    totalPaid,
    totalBalance,
    employeeStats,
    bonusEarners,
    deductionPenalties,
    perfectRate,
    paymentsByMethod,
  };
}

/**
 * Multi-Sheet Excel Export (.xlsx) for Module 12:
 * Sheet 1: Payroll Summary
 * Sheet 2: Monthly Attendance
 * Sheet 3: Leave & Bonus Audit
 * Sheet 4: Payment Ledger
 */
export function exportPayrollExcelReport({ month, year, rows = [], payments = [], settings = {} }) {
  const metrics = calculateReportMetrics(rows, payments, settings);
  const periodTitle = monthLabel(month, year);
  const workbook = XLSX.utils.book_new();

  // -------------------------------------------------------------------------
  // SHEET 1: Payroll Summary
  // -------------------------------------------------------------------------
  const summaryAoa = [
    ['FLOW PETROLEUM - PAYROLL & SALARY SUMMARY'],
    [`Period: ${periodTitle}`, `Generated: ${new Date().toISOString().slice(0, 10)}`],
    [],
    ['Key Performance Indicators', 'Value'],
    ['Total Staff Count', metrics.staffCount],
    ['Gross Base Payroll (PKR)', metrics.totalBaseSalary],
    ['Perfect Attendance Bonus Total (PKR)', metrics.totalBonus],
    ['Leave/Absent Deductions Total (PKR)', metrics.totalDeduction],
    ['Net Take-Home Payable (PKR)', metrics.totalNetSalary],
    ['Total Disbursed (PKR)', metrics.totalPaid],
    ['Outstanding Balance (PKR)', metrics.totalBalance],
    [],
    [
      'Employee ID',
      'Name',
      'Designation',
      'Shift',
      'Base Monthly (PKR)',
      'Daily Rate (PKR)',
      'Presents',
      'Leaves',
      'Absents',
      'Deductions (PKR)',
      'Bonus (PKR)',
      'Net Salary (PKR)',
      'Paid (PKR)',
      'Balance (PKR)',
      'Approval Status',
      'Payment Status',
    ],
    ...rows.map((r) => [
      r.employeeId,
      r.employeeName,
      r.designation,
      r.shiftName,
      r.monthlySalary,
      r.dailySalary,
      r.presentDays,
      r.leaveDays,
      r.absentDays,
      r.deduction,
      r.bonus,
      r.finalSalary,
      r.paidTotal,
      r.balance,
      r.status,
      r.paymentStatus,
    ]),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Payroll Summary');

  // -------------------------------------------------------------------------
  // SHEET 2: Monthly Attendance
  // -------------------------------------------------------------------------
  const attAoa = [
    ['FLOW PETROLEUM - MONTHLY ATTENDANCE REGISTER'],
    [`Period: ${periodTitle}`, `Station On-Duty Rate: ${metrics.overallDutyRate}%`],
    [],
    ['Total Present Days', metrics.totalPresent],
    ['Total Leave Days', metrics.totalLeave],
    ['Total Absent Days', metrics.totalAbsent],
    [],
    ['Employee ID', 'Name', 'Designation', 'Shift', 'Present Days', 'Leave Days', 'Absent Days', 'Duty Rate (%)', 'Audit Basis'],
    ...metrics.employeeStats.map((e) => [
      e.employeeId,
      e.employeeName,
      e.designation,
      e.shiftName,
      e.presentDays,
      e.leaveDays,
      e.absentDays,
      `${e.presentRate}%`,
      `${metrics.daysBasis} Days/Month`,
    ]),
  ];
  const attSheet = XLSX.utils.aoa_to_sheet(attAoa);
  XLSX.utils.book_append_sheet(workbook, attSheet, 'Monthly Attendance');

  // -------------------------------------------------------------------------
  // SHEET 3: Leave & Bonus Audit
  // -------------------------------------------------------------------------
  const auditAoa = [
    ['FLOW PETROLEUM - LEAVE & BONUS AUDIT REPORT'],
    [`Period: ${periodTitle}`, `Perfect Attendance Ratio: ${metrics.perfectRate}% (${metrics.bonusEarners.length}/${metrics.staffCount})`],
    [],
    ['SECTION A: PERFECT ATTENDANCE BONUS EARNERS (+1 Daily Wage for 0 Leaves)'],
    ['Employee ID', 'Name', 'Designation', 'Shift', 'Present Days', 'Leaves', 'Absents', 'Bonus Awarded (PKR)'],
    ...metrics.bonusEarners.map((b) => [
      b.employeeId,
      b.employeeName,
      b.designation,
      b.shiftName,
      b.presentDays,
      b.leaveDays,
      b.absentDays,
      b.bonus,
    ]),
    [],
    ['SECTION B: LEAVE & ABSENT DEDUCTION PENALTIES'],
    ['Employee ID', 'Name', 'Designation', 'Shift', 'Leave Days', 'Absent Days', 'Deductible Days', 'Deduction Amount (PKR)'],
    ...metrics.deductionPenalties.map((d) => [
      d.employeeId,
      d.employeeName,
      d.designation,
      d.shiftName,
      d.leaveDays,
      d.absentDays,
      d.deductibleDays,
      d.deduction,
    ]),
  ];
  const auditSheet = XLSX.utils.aoa_to_sheet(auditAoa);
  XLSX.utils.book_append_sheet(workbook, auditSheet, 'Leave & Bonus Audit');

  // -------------------------------------------------------------------------
  // SHEET 4: Payment Ledger
  // -------------------------------------------------------------------------
  const ledgerAoa = [
    ['FLOW PETROLEUM - SALARY PAYMENT DISBURSEMENT LEDGER'],
    [`Period: ${periodTitle}`, `Total Disbursed: PKR ${metrics.totalPaid.toLocaleString('en-PK')}`],
    [],
    ['Payment ID', 'Payment Date', 'Employee ID', 'Employee Name', 'Amount (PKR)', 'Method', 'Reference #', 'Recorded By', 'Status'],
    ...payments.map((p) => [
      p.id,
      p.paymentDate ? fmtDate(p.paymentDate) : '',
      p.employeeId,
      p.employeeName,
      p.paidAmount,
      METHOD_LABEL[p.method] || p.method,
      p.reference || '—',
      p.createdByName || 'Manager',
      p.status || 'COMPLETED',
    ]),
  ];
  const ledgerSheet = XLSX.utils.aoa_to_sheet(ledgerAoa);
  XLSX.utils.book_append_sheet(workbook, ledgerSheet, 'Payment Ledger');

  // Trigger download
  const fileName = `FLOW_Payroll_Report_${month}_${year}.xlsx`;
  try {
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    XLSX.writeFile(workbook, fileName);
  }
}

/**
 * Executive PDF Report for Module 12 via jsPDF & autoTable
 */
export function exportPayrollPdfReport({ month, year, rows = [], payments = [], settings = {} }) {
  const metrics = calculateReportMetrics(rows, payments, settings);
  const periodTitle = monthLabel(month, year);

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  const navy = [7, 27, 54];
  const lightBg = [248, 250, 252];
  const borderLine = [226, 232, 240];
  const muted = [111, 125, 144];

  // Header Banner
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('FLOW PETROLEUM — EXECUTIVE ATTENDANCE & PAYROLL REPORT', margin, 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('STATION #42 • GUJRANWALA CANTT BYPASS • AUDITED DISBURSEMENT LEDGER', margin, 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(periodTitle.toUpperCase(), pageWidth - margin, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`On-Duty Rate: ${metrics.overallDutyRate}% • Staff: ${metrics.staffCount}`, pageWidth - margin, 17, { align: 'right' });

  let y = 30;

  // KPI Metrics Summary Strip
  const colWidth = (pageWidth - 2 * margin) / 5;
  const kpis = [
    { label: 'GROSS BASE PAYROLL', value: `PKR ${metrics.totalBaseSalary.toLocaleString('en-PK')}` },
    { label: 'BONUSES AWARDED', value: `+PKR ${metrics.totalBonus.toLocaleString('en-PK')}`, color: [22, 133, 91] },
    { label: 'LEAVE DEDUCTIONS', value: `-PKR ${metrics.totalDeduction.toLocaleString('en-PK')}`, color: [198, 80, 69] },
    { label: 'NET PAYABLE SALARY', value: `PKR ${metrics.totalNetSalary.toLocaleString('en-PK')}`, bold: true },
    { label: 'OUTSTANDING BALANCE', value: `PKR ${metrics.totalBalance.toLocaleString('en-PK')}`, color: metrics.totalBalance > 0 ? [198, 80, 69] : [22, 133, 91] },
  ];

  kpis.forEach((k, idx) => {
    const x = margin + idx * colWidth;
    doc.setFillColor(...lightBg);
    doc.setDrawColor(...borderLine);
    doc.roundedRect(x, y, colWidth - 4, 16, 2, 2, 'FD');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...muted);
    doc.text(k.label, x + 4, y + 5);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(k.color || navy));
    doc.text(k.value, x + 4, y + 12);
  });

  y += 22;

  // Section 1: Comprehensive Payroll Summary Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...navy);
  doc.text('1. Staff Salary & Attendance Roster', margin, y);
  y += 3;

  const tableRows = rows.map((r) => [
    r.employeeName || 'Staff',
    r.designation || 'Attendant',
    r.shiftName || 'Day',
    `PKR ${r.monthlySalary?.toLocaleString('en-PK')}`,
    `PKR ${r.dailySalary?.toLocaleString('en-PK')}`,
    `${r.presentDays}P / ${r.leaveDays}L / ${r.absentDays}A`,
    r.bonus > 0 ? `+${r.bonus?.toLocaleString('en-PK')}` : '—',
    r.deduction > 0 ? `-${r.deduction?.toLocaleString('en-PK')}` : '—',
    `PKR ${r.finalSalary?.toLocaleString('en-PK')}`,
    `PKR ${r.paidTotal?.toLocaleString('en-PK')}`,
    `PKR ${r.balance?.toLocaleString('en-PK')}`,
    r.paymentStatus || 'UNPAID',
  ]);

  autoTable(doc, {
    startY: y,
    head: [
      [
        'Employee',
        'Role',
        'Shift',
        'Base Salary',
        'Daily Rate',
        'Attendance',
        'Bonus',
        'Deduction',
        'Net Salary',
        'Disbursed',
        'Balance',
        'Status',
      ],
    ],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: navy,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 32 },
      2: { cellWidth: 26 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'center' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right', fontStyle: 'bold' },
      9: { halign: 'right' },
      10: { halign: 'right', fontStyle: 'bold' },
      11: { halign: 'center' },
    },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 12;

  // Add Page for Payments & Audit if space is tight
  if (y > 150) {
    doc.addPage();
    y = 20;
  }

  // Section 2: Disbursements Ledger
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...navy);
  doc.text(`2. Recorded Disbursements Ledger (${payments.length} Payments)`, margin, y);
  y += 3;

  if (payments.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text('No disbursements recorded yet for this period.', margin, y + 6);
    y += 14;
  } else {
    const paymentRows = payments.map((p) => [
      p.paymentDate ? fmtDate(p.paymentDate) : '—',
      p.employeeName || 'Staff',
      `PKR ${Number(p.paidAmount || 0).toLocaleString('en-PK')}`,
      METHOD_LABEL[p.method] || p.method,
      p.reference || '—',
      p.createdByName || 'Manager',
      p.status || 'COMPLETED',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Payment Date', 'Staff Member', 'Amount (PKR)', 'Payment Method', 'Reference #', 'Authorized By', 'Status']],
      body: paymentRows,
      theme: 'plain',
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: navy,
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
      },
      margin: { left: margin, right: margin },
    });

    y = doc.lastAutoTable.finalY + 14;
  }

  // Signatures block
  if (y > 165) {
    doc.addPage();
    y = 30;
  } else {
    y = Math.max(y, 160);
  }

  doc.setDrawColor(...muted);
  doc.line(margin + 10, y, margin + 90, y);
  doc.line(pageWidth - margin - 90, y, pageWidth - margin - 10, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...muted);
  doc.text('Prepared & Certified By (Station Accountant / Manager)', margin + 50, y + 5, { align: 'center' });
  doc.text('Audited & Approved By (Station Owner / Managing Director)', pageWidth - margin - 50, y + 5, { align: 'center' });

  // Footer stamp
  doc.setFontSize(7.5);
  doc.text(
    `FLOW Petroleum Management System • Generated on ${new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' })}`,
    pageWidth / 2,
    195,
    { align: 'center' },
  );

  doc.save(`FLOW_Executive_Payroll_Report_${month}_${year}.pdf`);
}
