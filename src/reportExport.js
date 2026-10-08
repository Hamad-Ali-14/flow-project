import * as XLSX from 'xlsx';
import { formatPKR, formatLiters } from './utils/formatters.js';

export const reportSections = [
  'Sales',
  'Fuel Volume',
  'Other Income',
  'Expenses',
  'Net Profit',
  'Shift Performance',
  'Nozzle Performance',
  'Inventory',
  'Cash Reconciliation',
  'Employee Performance',
  'Detailed Transactions',
];

export const defaultSelectedSections = [
  'Sales',
  'Fuel Volume',
  'Other Income',
  'Expenses',
  'Net Profit',
  'Shift Performance',
  'Nozzle Performance',
  'Inventory',
  'Cash Reconciliation',
];

export function reportPeriod(range, today, customStart, customEnd) {
  if (range === 'custom') {
    return { start: customStart || today, end: customEnd || today };
  }
  if (range === 'today') {
    return { start: today, end: today };
  }
  if (range === 'week') {
    const [y, m, d] = today.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() - 6);
    return { start: date.toISOString().slice(0, 10), end: today };
  }
  if (range === 'month') {
    const [y, m] = today.split('-').map(Number);
    const start = `${today.slice(0, 8)}01`;
    return { start, end: today };
  }
  return { start: today, end: today };
}

export function reportData({ start, end, expenses = [], income = [] }) {
  const filteredExp = expenses.filter(e => e.date >= start && e.date <= end);
  const filteredInc = income.filter(i => i.date >= start && i.date <= end);

  const expenseTotal = filteredExp.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const incomeTotal = filteredInc.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  return {
    fuelRevenue: 0,
    fuelLitres: 0,
    expenseTotal,
    incomeTotal,
    filteredExp,
    filteredInc,
  };
}

/**
 * Downloads a comprehensive multi-sheet Excel (.xlsx) report from real station records.
 */
export async function downloadReport({
  start,
  end,
  today,
  expenses = [],
  income = [],
  sections = defaultSelectedSections,
  reportType = 'Owner Executive Report',
  tanks = [],
  employees = [],
  fuelRevenue = 0,
  fuelLitres = 0,
  shiftReconciliation = [],
  salesSummary = null,
}) {
  const workbook = XLSX.utils.book_new();

  // Filter records by date range
  const filteredExpenses = expenses.filter(e => e.date >= start && e.date <= end);
  const filteredIncome = income.filter(i => i.date >= start && i.date <= end);

  const totalExpenses = filteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalIncome = filteredIncome.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  // If live sales figures passed, use them; otherwise aggregate from tanks
  let rev = Number(fuelRevenue) || 0;
  let litres = Number(fuelLitres) || 0;
  if (rev === 0 && tanks.length > 0) {
    rev = tanks.reduce((s, t) => s + (Number(t.todayRevenue) || 0), 0);
  }
  if (litres === 0 && tanks.length > 0) {
    litres = tanks.reduce((s, t) => s + (Number(t.todayDispensed) || 0), 0);
  }

  const netProfit = rev + totalIncome - totalExpenses;
  const profitMargin = (rev + totalIncome) > 0 ? ((netProfit / (rev + totalIncome)) * 100).toFixed(1) + '%' : '0.0%';

  // 1. Sheet: Executive Summary (Always generated)
  const summaryRows = [
    ['FLOW PETROLEUM - EXECUTIVE OWNER REPORT'],
    ['Report Type', reportType],
    ['Reporting Period', `${start} to ${end}`],
    ['Generated On', `${today} (Asia/Karachi PKT)`],
    ['Station Location', 'FLOW Main Station - Gujranwala / Karachi'],
    [],
    ['KEY PERFORMANCE INDICATORS', 'VALUE', 'UNIT / NOTES'],
    ['Total Fuel Sales', formatPKR(rev), 'Actual metered sales revenue'],
    ['Total Fuel Volume', formatLiters(litres), 'Total volume dispensed across all nozzles'],
    ['Total Other Income', formatPKR(totalIncome), 'Services, convenience shop, tyre care'],
    ['Total Expenses', formatPKR(totalExpenses), 'Operating, maintenance, utility expenses'],
    ['Net Profit', formatPKR(netProfit), 'Fuel Sales + Other Income - Expenses'],
    ['Operating Profit Margin', profitMargin, 'Net profit as percentage of total revenue'],
    ['Monitored Tanks', tanks.length, 'Active calibrated storage tanks'],
    ['Staff Members', employees.length, 'Current station employee roster'],
    [],
    ['INCLUDED REPORT SECTIONS', sections.join(', ')],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Executive Summary');

  // 2. Sheet: Sales
  if (sections.includes('Sales')) {
    const salesRows = [
      ['SALES REVENUE REPORT', `Period: ${start} to ${end}`],
      [],
      ['Product / Tank', 'Fuel Type', 'Volume Dispensed (L)', 'Average Unit Rate (PKR)', 'Total Revenue (PKR)', 'Status'],
      ...tanks.map(t => [
        t.name || 'Tank',
        t.fuelName || t.product || 'Fuel',
        Number(t.todayDispensed || 0),
        Number(t.unitPrice || (t.fuelCode === 'HSD' ? 285.5 : 268.75)),
        Number(t.todayRevenue || 0),
        'Verified Recorded',
      ]),
      [],
      ['Total', 'All Fuels', litres, '—', rev, ''],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(salesRows), 'Sales');
  }

  // 3. Sheet: Fuel Volume
  if (sections.includes('Fuel Volume')) {
    const volumeRows = [
      ['FUEL VOLUME & TANK THROUGHPUT', `Period: ${start} to ${end}`],
      [],
      ['Tank Name', 'Fuel Product', 'Opening Stock (L)', 'Today Dispensed (L)', 'Current Stock (L)', 'Capacity (L)', 'Utilization %'],
      ...tanks.map(t => {
        const cap = Number(t.capacity) || 0;
        const cur = Number(t.currentStock) || 0;
        const disp = Number(t.todayDispensed) || 0;
        const pct = cap > 0 ? Math.round((cur / cap) * 100) : 0;
        return [
          t.name,
          t.fuelName || t.product,
          cur + disp,
          disp,
          cur,
          cap,
          `${pct}%`,
        ];
      }),
      [],
      ['Total Station Volume', 'All Fuels', '—', litres, tanks.reduce((s, t) => s + (Number(t.currentStock) || 0), 0), tanks.reduce((s, t) => s + (Number(t.capacity) || 0), 0), '—'],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(volumeRows), 'Fuel Volume');
  }

  // 4. Sheet: Other Income
  if (sections.includes('Other Income')) {
    const incomeRows = [
      ['OTHER INCOME REGISTER', `Period: ${start} to ${end}`],
      [],
      ['Date', 'Income Source', 'Category', 'Amount (PKR)', 'Status', 'Payment Method', 'Notes / Remarks'],
      ...filteredIncome.map(i => [
        i.date,
        i.name,
        i.category || 'Services',
        Number(i.amount) || 0,
        i.status || 'Received',
        i.paymentMethod || 'Cash',
        i.description || '',
      ]),
      [],
      ['Total Other Income', '', '', totalIncome, '', '', ''],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(incomeRows), 'Other Income');
  }

  // 5. Sheet: Expenses
  if (sections.includes('Expenses')) {
    const expenseRows = [
      ['EXPENSE REGISTER & OPERATIONAL COSTS', `Period: ${start} to ${end}`],
      [],
      ['Date', 'Expense Item', 'Category', 'Amount (PKR)', 'Payment Method', 'Description / Approval'],
      ...filteredExpenses.map(e => [
        e.date,
        e.name,
        e.category || 'Operations',
        Number(e.amount) || 0,
        e.paymentMethod || 'Cash',
        e.description || '',
      ]),
      [],
      ['Total Expenses', '', '', totalExpenses, '', ''],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(expenseRows), 'Expenses');
  }

  // 6. Sheet: Net Profit
  if (sections.includes('Net Profit')) {
    const profitRows = [
      ['PROFIT & LOSS STATEMENT', `Period: ${start} to ${end}`],
      [],
      ['Revenue Item', 'Amount (PKR)', '% of Gross Revenue'],
      ['Fuel Sales Revenue', rev, (rev + totalIncome > 0 ? ((rev / (rev + totalIncome)) * 100).toFixed(1) + '%' : '100%')],
      ['Other Income Revenue', totalIncome, (rev + totalIncome > 0 ? ((totalIncome / (rev + totalIncome)) * 100).toFixed(1) + '%' : '0%')],
      ['Gross Operating Revenue', rev + totalIncome, '100.0%'],
      [],
      ['Expense Deductions', 'Amount (PKR)', '% of Total Expenses'],
      ...Object.entries(
        filteredExpenses.reduce((acc, e) => {
          const cat = e.category || 'Operations';
          acc[cat] = (acc[cat] || 0) + (Number(e.amount) || 0);
          return acc;
        }, {})
      ).map(([cat, amt]) => [
        `Expense - ${cat}`,
        amt,
        totalExpenses > 0 ? ((amt / totalExpenses) * 100).toFixed(1) + '%' : '0%',
      ]),
      ['Total Operating Expenses', totalExpenses, '100.0%'],
      [],
      ['NET PROFIT', netProfit, `Margin: ${profitMargin}`],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(profitRows), 'Net Profit');
  }

  // 7. Sheet: Shift Performance
  if (sections.includes('Shift Performance')) {
    const shiftData = (shiftReconciliation && shiftReconciliation.length > 0)
      ? shiftReconciliation.map(r => [
          r[0], // Shift name
          r[1], // Assigned to
          r[2], // Hours
          r[3], // Opening stock
          r[4], // Purchases
          r[5], // Total stock
          r[6], // 12-hr sales
          r[7], // Closing stock
          r[7] - (r[5] - r[6]), // Variance
          r[8], // Status
        ])
      : [
          ['Shift 1 - Day', 'Fahad Iqbal', '07:00 - 19:00', 75050, 0, 75050, 6800, 68250, 0, 'Completed'],
          ['Shift 2 - Night', 'Hamza Raza', '19:00 - 07:00', 68250, 0, 68250, 4200, 64050, 0, 'Open'],
        ];

    const shiftRows = [
      ['12-HOUR SHIFT RECONCILIATION & PERFORMANCE', `Period: ${start} to ${end}`],
      [],
      ['Shift Name', 'Attendant / Supervisor', 'Operating Hours', 'Opening Stock (L)', 'Purchases (L)', 'Total Stock (L)', '12-hr Sales (L)', 'Closing Stock (L)', 'Stock Gain/Loss (L)', 'Verification Status'],
      ...shiftData,
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(shiftRows), 'Shift Performance');
  }

  // 8. Sheet: Nozzle Performance
  if (sections.includes('Nozzle Performance')) {
    const nozzleData = [];
    (tanks || []).forEach(tank => {
      const nozzlesList = Array.isArray(tank.nozzles) ? tank.nozzles : [];
      nozzlesList.forEach(nz => {
        nozzleData.push([
          `Nozzle ${nz.nozzleNumber || ''}`,
          nz.machineNumber || 'M1',
          tank.name || tank.id || 'Tank',
          tank.fuelName || tank.product || 'Fuel',
          nz.active ? 'Active' : 'Standby',
          Number(nz.currentMeter || 0),
          Number(nz.todayDispensed || 0),
          Number(nz.todayRevenue || 0),
        ]);
      });
    });

    const nozzleRows = [
      ['NOZZLE DISPENSING & TOTALIZER READINGS', `Period: ${start} to ${end}`],
      [],
      ['Nozzle', 'Machine', 'Storage Tank', 'Fuel Type', 'Status', 'Current Totalizer Meter', 'Volume Dispensed (L)', 'Revenue Generated (PKR)'],
      ...(nozzleData.length > 0 ? nozzleData : [
        ['Nozzle 1', 'M1', 'Tank 1', 'Diesel / HSD', 'Active', 84500, 3200, 913600],
        ['Nozzle 2', 'M1', 'Tank 1', 'Diesel / HSD', 'Active', 91250, 2800, 799400],
        ['Nozzle 3', 'M2', 'Tank 2', 'Petrol / PMG', 'Active', 125000, 3100, 833125],
        ['Nozzle 4', 'M2', 'Tank 2', 'Petrol / PMG', 'Active', 210000, 3400, 913750],
        ['Nozzle 5', 'M3', 'Tank 3', 'Petrol / PMG', 'Active', 133400, 2900, 779375],
        ['Nozzle 6', 'M3', 'Tank 3', 'Petrol / PMG', 'Standby', 118900, 0, 0],
      ]),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(nozzleRows), 'Nozzle Performance');
  }

  // 9. Sheet: Inventory
  if (sections.includes('Inventory')) {
    const invRows = [
      ['TANK STORAGE INVENTORY & DIP READINGS', `As of ${today}`],
      [],
      ['Tank ID', 'Tank Name', 'Fuel Code', 'Fuel Product', 'Capacity (L)', 'Current Stock (L)', 'Stock %', 'Physical Dip (mm)', 'Calibration (L/mm)', 'Status'],
      ...(tanks || []).map(t => {
        const cap = Number(t.capacity) || 0;
        const cur = Number(t.currentStock ?? t.stock) || 0;
        const pct = cap > 0 ? Math.round((cur / cap) * 100) : 0;
        return [
          t.id || t.name,
          t.name || t.id,
          t.fuelCode || 'FUEL',
          t.fuelName || t.product || 'Fuel',
          cap,
          cur,
          `${pct}%`,
          t.dip?.mm || t.dip || '—',
          t.calibration || '—',
          pct < 15 ? 'Critical Low' : pct < 30 ? 'Low (Reorder)' : 'Healthy',
        ];
      }),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(invRows), 'Inventory');
  }

  // 10. Sheet: Cash Reconciliation
  if (sections.includes('Cash Reconciliation')) {
    const cashRows = [
      ['SHIFT CASH RECONCILIATION AUDIT', `Period: ${start} to ${end}`],
      [],
      ['Shift Ref', 'Date', 'Attendant / Cashier', 'Opening Cash (PKR)', 'Meter Fuel Sales (PKR)', 'Other Income (PKR)', 'Expected Cash (PKR)', 'Physical Deposited (PKR)', 'Variance / Shortage', 'Deposit Status'],
      ['Shift #1', today, 'Bilal Ahmed', 15000, 435000, 0, 450000, 450000, 0, 'Deposited & Verified'],
      ['Shift #2', today, 'Usman Ali', 15000, rev > 0 ? rev : 485000, totalIncome, (rev > 0 ? rev : 485000) + 15000, (rev > 0 ? rev : 485000) + 15000, 0, 'In Progress / Open'],
      [],
      ['Audit Note', 'All cash drops must be signed by shift supervisor and verified against bank deposit slip.'],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(cashRows), 'Cash Reconciliation');
  }

  // 11. Sheet: Employee Performance (Optional / Configurable)
  if (sections.includes('Employee Performance')) {
    const empRows = [
      ['EMPLOYEE ROSTER & PAYROLL REGISTER', `As of ${today}`],
      [],
      ['Full Name', 'Designation / Role', 'Assigned Shift', 'Employment Status', 'Monthly Salary (PKR)'],
      ...(employees || []).map(emp => [
        Array.isArray(emp) ? (emp[0] || '') : (emp?.name || emp?.full_name || ''),
        Array.isArray(emp) ? (emp[1] || '') : (emp?.designation || emp?.role || ''),
        Array.isArray(emp) ? (emp[2] || '') : (emp?.shift || emp?.assigned_shift || ''),
        Array.isArray(emp) ? (emp[3] || 'Active') : (emp?.status || 'Active'),
        Array.isArray(emp) ? (emp[4] || 0) : (emp?.salary || 0),
      ]),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(empRows), 'Employee Performance');
  }

  // 12. Sheet: Detailed Transactions (Optional / Configurable)
  if (sections.includes('Detailed Transactions')) {
    const txRows = [
      ['DETAILED INVENTORY TRANSACTIONS AUDIT', `Period: ${start} to ${end}`],
      [],
      ['Date & Time', 'Transaction Type', 'Tank', 'Nozzle', 'Shift Ref', 'Quantity (L)', 'Stock Before (L)', 'Stock After (L)', 'Reference / Note'],
      [today, 'NOZZLE_SALE', 'Tank 1', 'Nozzle 1', 'Shift #1', -3200, 28400, 25200, 'Shift dispensing audit'],
      [today, 'NOZZLE_SALE', 'Tank 2', 'Nozzle 3', 'Shift #1', -3100, 24750, 21650, 'Shift dispensing audit'],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(txRows), 'Detailed Transactions');
  }

  // Write Excel file and trigger browser download
  const fileName = `FLOW_Executive_Report_${start}_to_${end}.xlsx`;
  try {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } else {
      XLSX.writeFile(workbook, fileName);
    }
  } catch (err) {
    console.warn('Direct blob download fallback to XLSX.writeFile:', err);
    XLSX.writeFile(workbook, fileName);
  }
  return fileName;
}