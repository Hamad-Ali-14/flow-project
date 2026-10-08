import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatPKR } from './formatters';
import { monthLabel } from './payrollCalculations';
import { fmtDate } from './payrollUiHelpers';

export function exportPayslipPdf(record, detail = {}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  const navy = [7, 27, 54];
  const blue = [29, 101, 219];
  const green = [22, 133, 91];
  const red = [198, 80, 69];
  const muted = [111, 125, 144];
  const lightBg = [248, 250, 252];
  const borderLine = [226, 232, 240];

  // Header banner
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('FLOW PETROLEUM', margin, 12);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('FLOW OPS STATION MANAGEMENT • OFFICIAL SALARY SLIP', margin, 18);

  const voucherCode = `FLOW-SLIP-${record.year}-${String(record.month).padStart(2, '0')}-${String(record.employeeId || 'STAFF').slice(-6).toUpperCase()}`;
  doc.setFontSize(8);
  doc.text(`Voucher ID: ${voucherCode}`, margin, 24);

  const monthStr = monthLabel(record.month, record.year);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(monthStr.toUpperCase(), pageWidth - margin, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Status: ${record.status} • Payment: ${record.paymentStatus}`, pageWidth - margin, 18, { align: 'right' });

  let y = 36;

  // Employee Information Box
  doc.setDrawColor(...borderLine);
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 26, 2, 2, 'FD');

  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(record.employeeName || 'Staff Member', margin + 6, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(`Role: ${record.designation || 'Staff'}`, margin + 6, y + 14);
  doc.text(`Shift: ${record.shiftName || 'Day Shift'}`, margin + 6, y + 20);

  doc.text(`Working-Day Basis: ${record.daysBasis || 30} Days`, pageWidth / 2 + 10, y + 8);
  doc.text(`Attendance: ${record.presentDays} Present, ${record.leaveDays} Leaves, ${record.absentDays} Absents`, pageWidth / 2 + 10, y + 14);
  doc.text(`Daily Wage Rate: PKR ${record.dailySalary?.toLocaleString('en-PK') || 0} / day`, pageWidth / 2 + 10, y + 20);

  y += 34;

  // Earnings & Deductions Table
  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Salary & Wage Calculation Breakdown', margin, y);
  y += 4;

  const earningsRows = [
    ['Base Monthly Salary', 'Fixed contract salary', `PKR ${record.monthlySalary?.toLocaleString('en-PK') || 0}`],
  ];

  if (record.bonus > 0) {
    earningsRows.push([
      'Perfect Attendance Bonus',
      '0 Leaves in month (+1 Daily Salary)',
      `+PKR ${record.bonus?.toLocaleString('en-PK') || 0}`,
    ]);
  }

  if (record.deduction > 0) {
    earningsRows.push([
      'Leave / Absent Deductions',
      `${record.deductibleDays} deductible days × PKR ${record.dailySalary?.toLocaleString('en-PK')}`,
      `-PKR ${record.deduction?.toLocaleString('en-PK') || 0}`,
    ]);
  }

  earningsRows.push([
    'FINAL NET PAYABLE SALARY',
    'Total take-home wage for month',
    `PKR ${record.finalSalary?.toLocaleString('en-PK') || 0}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Item Description', 'Formula / Rule Basis', 'Amount (PKR)']],
    body: earningsRows,
    theme: 'grid',
    headStyles: {
      fillColor: navy,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold' },
      1: { cellWidth: 75 },
      2: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 10;

  // Payment Settlement Summary Card
  doc.setDrawColor(...borderLine);
  doc.setFillColor(...lightBg);
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...navy);
  doc.text('PAYMENT SETTLEMENT STATUS', margin + 6, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(`Total Payable: PKR ${record.finalSalary?.toLocaleString('en-PK') || 0}`, margin + 6, y + 14);
  doc.text(`Total Disbursed: PKR ${record.paidTotal?.toLocaleString('en-PK') || 0}`, margin + 6, y + 19);

  doc.setFont('helvetica', 'bold');
  if (record.balance <= 0) {
    doc.setTextColor(...green);
    doc.text('STATUS: FULLY PAID (BALANCE: PKR 0)', pageWidth - margin - 6, y + 12, { align: 'right' });
  } else {
    doc.setTextColor(...red);
    doc.text(`UNPAID BALANCE: PKR ${record.balance?.toLocaleString('en-PK') || 0}`, pageWidth - margin - 6, y + 12, { align: 'right' });
  }

  y += 32;

  // Payments History (if any)
  const paymentsList = detail.payments || record.payments || [];
  if (paymentsList.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...navy);
    doc.text('Disbursement Payments Recorded', margin, y);
    y += 4;

    const paymentRows = paymentsList.map((p) => [
      fmtDate(p.paymentDate),
      `PKR ${Number(p.paidAmount).toLocaleString('en-PK')}`,
      String(p.method || 'Cash').toUpperCase(),
      p.reference || '—',
      p.createdByName || 'Manager',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Paid Amount', 'Method', 'Reference #', 'Recorded By']],
      body: paymentRows,
      theme: 'plain',
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: navy,
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59],
      },
      margin: { left: margin, right: margin },
    });

    y = doc.lastAutoTable.finalY + 12;
  }

  // Signature Blocks
  if (y > 240) {
    doc.addPage();
    y = 30;
  } else {
    y = Math.max(y, 225);
  }

  doc.setDrawColor(...muted);
  doc.line(margin + 5, y, margin + 65, y);
  doc.line(pageWidth - margin - 65, y, pageWidth - margin - 5, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...muted);
  doc.text('Prepared & Approved By (Manager / Owner)', margin + 35, y + 5, { align: 'center' });
  doc.text('Received By (Staff Signature / Thumbprint)', pageWidth - margin - 35, y + 5, { align: 'center' });

  // Footer stamp
  doc.setFontSize(7.5);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' })} via FLOW Petroleum Management System`, pageWidth / 2, 285, { align: 'center' });

  doc.save(`FLOW_Payslip_${record.employeeName?.replace(/\s+/g, '_')}_${record.year}_${record.month}.pdf`);
}
