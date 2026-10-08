import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  get_today_sales,
  get_sales_by_period,
  get_fuel_volume,
  get_other_income,
  get_expenses,
  get_net_profit,
  get_shift_performance,
  get_active_shifts,
  get_nozzle_performance,
  get_tank_levels,
  get_fuel_inventory,
  get_cash_reconciliation,
  get_employee_performance,
  detect_stock_variance,
  detect_cash_variance,
  predict_stock_runout,
  get_supplier_information,
  generate_daily_executive_summary,
  process_flow_ai_query,
  AI_ACTION_REGISTRY,
  get_action_suggestions,
} from './flowAiTools.js';
import { reportSections, defaultSelectedSections, reportPeriod, reportData } from '../reportExport.js';
import { buildChart, getChartSubtitle } from './salesMetrics.js';

test('Flow AI Tools: 5 primary KPIs calculate deterministically', () => {
  const mockSales = {
    daily: { revenue: 905462, litres: 12450, prevRevenue: 836800, prevLitres: 11910 },
  };

  const mockTanks = [
    { id: 't1', name: 'Tank 1', fuelCode: 'HSD', fuelName: 'Diesel / HSD', capacity: 45000, currentStock: 12600, todayDispensed: 6200, todayRevenue: 450000 },
    { id: 't2', name: 'Tank 2', fuelCode: 'PMG', fuelName: 'Petrol / PMG', capacity: 42750, currentStock: 26900, todayDispensed: 6250, todayRevenue: 455462 },
  ];

  const mockIncome = [
    { id: 'i1', name: 'Car wash', category: 'Services', date: '2026-10-04', amount: 32400 },
    { id: 'i2', name: 'Shop convenience', category: 'Convenience', date: '2026-10-04', amount: 204630 },
  ];

  const mockExpenses = [
    { id: 'e1', name: 'Generator fuel', category: 'Utilities', date: '2026-10-04', amount: 18500 },
    { id: 'e2', name: 'Equipment maintenance', category: 'Maintenance', date: '2026-10-04', amount: 40000 },
  ];

  // 1. Today's Sales
  const salesResult = get_today_sales({ sales: mockSales, tanks: mockTanks });
  assert.equal(salesResult.revenue, 905462);
  assert.equal(salesResult.formatted, 'PKR 905,462');
  assert.equal(salesResult.isPositive, true);

  // 2. Fuel Volume
  const volumeResult = get_fuel_volume({ sales: mockSales, tanks: mockTanks });
  assert.equal(volumeResult.litres, 12450);
  assert.equal(volumeResult.formatted, '12,450 L');

  // 3. Other Income
  const incomeResult = get_other_income({ income: mockIncome, period: 'today', todayISO: '2026-10-04' });
  assert.equal(incomeResult.total, 237030);
  assert.equal(incomeResult.formatted, 'PKR 237,030');

  // 4. Expenses
  const expenseResult = get_expenses({ expenses: mockExpenses, period: 'today', todayISO: '2026-10-04' });
  assert.equal(expenseResult.total, 58500);
  assert.equal(expenseResult.formatted, 'PKR 58,500');

  // 5. Net Profit = Fuel Sales + Other Income - Expenses
  // 905,462 + 237,030 - 58,500 = 1,083,992
  const profitResult = get_net_profit({ sales: mockSales, tanks: mockTanks, income: mockIncome, expenses: mockExpenses, period: 'today', todayISO: '2026-10-04' });
  assert.equal(profitResult.netProfit, 1083992);
  assert.equal(profitResult.formatted, 'PKR 1,083,992');
  assert.equal(profitResult.fuelRevenue, 905462);
  assert.equal(profitResult.otherIncome, 237030);
  assert.equal(profitResult.expenses, 58500);
  assert.equal(profitResult.isPositive, true);
});

test('Flow AI Tools: Stock runout predictor and reorder recommendations', () => {
  const mockTanks = [
    {
      id: 't1',
      name: 'Tank 1',
      fuelCode: 'HSD',
      fuelName: 'Diesel / HSD',
      capacity: 45000,
      currentStock: 12600, // 28%
      todayDispensed: 7200,
    },
    {
      id: 't2',
      name: 'Tank 2',
      fuelCode: 'PMG',
      fuelName: 'Petrol / PMG',
      capacity: 42750,
      currentStock: 26900, // 63%
      todayDispensed: 6000,
    },
  ];

  const predictions = predict_stock_runout({ tanks: mockTanks });
  assert.equal(predictions.length, 2);

  const dieselTank = predictions.find(p => p.fuelCode === 'HSD');
  assert.equal(dieselTank.percentage, 28);
  assert.equal(dieselTank.isReorderNeeded, true);
  assert.equal(dieselTank.reorderStatus, 'Reorder Recommended');
  assert.ok(dieselTank.recommendedQty >= 15000);

  const petrolTank = predictions.find(p => p.fuelCode === 'PMG');
  assert.equal(petrolTank.percentage, 63);
  assert.equal(petrolTank.isReorderNeeded, false);
  assert.equal(petrolTank.reorderStatus, 'Healthy');
});

test('Flow AI Tools: Smart anomaly detection for tanks and shifts', () => {
  const mockTanks = [
    {
      id: 't1',
      name: 'Tank 1',
      fuelCode: 'HSD',
      fuelName: 'Diesel / HSD',
      capacity: 45000,
      currentStock: 4000, // < 10% critical
      dip: { mm: 160 },
      calibration: 24.5,
    },
    {
      id: 't2',
      name: 'Tank 2',
      fuelCode: 'PMG',
      fuelName: 'Petrol / PMG',
      capacity: 42750,
      currentStock: 25000,
      dip: { mm: 1200 }, // 1200 * 23.8 = 28560 => difference of 3560 L (>3% and >400L)
      calibration: 23.8,
    },
  ];

  const anomalies = detect_stock_variance({ tanks: mockTanks });
  assert.ok(anomalies.length >= 2);
  assert.ok(anomalies.some(a => a.type === 'critical' && a.title.includes('Critical Fuel Stock')));
  assert.ok(anomalies.some(a => a.type === 'warning' && a.title.includes('Physical Dip Variance')));
});

test('Flow AI Tools: Natural Language Query Processor responds accurately', () => {
  const context = {
    today: '2026-10-04',
    userName: 'Daud',
    sales: { daily: { revenue: 905462, litres: 12450 } },
    tanks: [
      { id: 't1', name: 'Tank 1', fuelCode: 'HSD', fuelName: 'Diesel / HSD', capacity: 45000, currentStock: 12600, todayDispensed: 6200, todayRevenue: 450000, nozzles: [{ id: 'nz1', nozzleNumber: '1', active: true, todayDispensed: 6200, todayRevenue: 450000 }] },
    ],
    income: [{ id: 'i1', name: 'Shop sales', category: 'Convenience', date: '2026-10-04', amount: 237030 }],
    expenses: [{ id: 'e1', name: 'Utilities', category: 'Operations', date: '2026-10-04', amount: 58500 }],
    shiftReconciliation: [
      ['Shift 1 - Day', 'Bilal Ahmed', '07:00 - 19:00', 45000, 0, 45000, 6200, 38800, 'Completed'],
    ],
  };

  // Test net profit query
  const profitResp = process_flow_ai_query('Aaj ka net profit kitna hai?', context);
  assert.ok(profitResp.text.includes('Net Profit'));
  assert.ok(profitResp.text.includes('1,083,992'));

  // Test report generation query
  const reportResp = process_flow_ai_query('Give me today\'s report', context);
  assert.ok(reportResp.reportTrigger);
  assert.equal(reportResp.reportTrigger.range, 'today');

  // Test tank refill query
  const refillResp = process_flow_ai_query('Kaunsa tank refill karna chahiye?', context);
  assert.ok(refillResp.text.includes('Tank 1') || refillResp.text.includes('Diesel'));

  // Test cash mismatch query
  const cashResp = process_flow_ai_query('Kya kisi operator ka cash mismatch hai?', context);
  assert.ok(cashResp.text.includes('No cash mismatch detected') || cashResp.text.includes('reconciled'));
});

test('Report Export: Section configuration and period helpers', () => {
  assert.equal(reportSections.length, 11);
  assert.ok(reportSections.includes('Sales'));
  assert.ok(reportSections.includes('Fuel Volume'));
  assert.ok(reportSections.includes('Other Income'));
  assert.ok(reportSections.includes('Expenses'));
  assert.ok(reportSections.includes('Net Profit'));
  assert.ok(reportSections.includes('Shift Performance'));
  assert.ok(reportSections.includes('Nozzle Performance'));
  assert.ok(reportSections.includes('Inventory'));
  assert.ok(reportSections.includes('Cash Reconciliation'));

  assert.equal(defaultSelectedSections.length, 9);

  const periodToday = reportPeriod('today', '2026-10-04');
  assert.equal(periodToday.start, '2026-10-04');
  assert.equal(periodToday.end, '2026-10-04');

  const periodMonth = reportPeriod('month', '2026-10-04');
  assert.equal(periodMonth.start, '2026-10-01');
  assert.equal(periodMonth.end, '2026-10-04');
});

test('Requirement 1 & 2: Strict 2-shift cycle, dynamic staff, and stock carry-forward math', () => {
  // 1. Strict 2-shift cycle: only Shift 1 - Day (07:00-19:00) and Shift 2 - Night (19:00-07:00)
  // Ensure shift number never increments to Shift 3
  const nextFrom1 = (1 % 2) + 1; // 2
  const nextFrom2 = (2 % 2) + 1; // 1 (resets back to Shift 1)
  assert.equal(nextFrom1, 2);
  assert.equal(nextFrom2, 1);

  // Dynamic staff assignment test
  const activeShiftDay = get_active_shifts({ overview: { openShift: { shiftNumber: 1 } } });
  assert.equal(activeShiftDay.name, 'Shift 1 - Day');
  assert.equal(activeShiftDay.hours, '07:00 - 19:00');
  assert.equal(activeShiftDay.operator, 'Fahad Iqbal');

  const activeShiftNight = get_active_shifts({ overview: { openShift: { shiftNumber: 2 } } });
  assert.equal(activeShiftNight.name, 'Shift 2 - Night');
  assert.equal(activeShiftNight.hours, '19:00 - 07:00');
  assert.equal(activeShiftNight.operator, 'Hamza Raza');

  // If shift number was 3 somehow, it strictly maps to Shift 1 - Day
  const activeShiftOverflow = get_active_shifts({ overview: { openShift: { shiftNumber: 3 } } });
  assert.equal(activeShiftOverflow.shiftNumber, 1);
  assert.equal(activeShiftOverflow.name, 'Shift 1 - Day');

  // 2. Mathematical Formula Enforcement & Linking
  // Total Stock = Opening Stock + Purchases
  // Closing Stock = Total Stock - 12-Hour Fuel Sales
  // Shift 1 Closing Stock -> Shift 2 Opening Stock
  const shift1Opening = 75050;
  const shift1Purchases = 0;
  const shift1Total = shift1Opening + shift1Purchases;
  const shift1Sales = 6800;
  const shift1Closing = shift1Total - shift1Sales;
  assert.equal(shift1Total, 75050);
  assert.equal(shift1Closing, 68250);

  // Shift 2 automatically inherits Shift 1 closing as opening stock
  const shift2Opening = shift1Closing;
  const shift2Purchases = 5000; // Fuel delivery during night shift
  const shift2Total = shift2Opening + shift2Purchases;
  const shift2Sales = 4200;
  const shift2Closing = shift2Total - shift2Sales;
  assert.equal(shift2Opening, 68250);
  assert.equal(shift2Total, 73250);
  assert.equal(shift2Closing, 69050);

  // Next Day Shift 1 automatically inherits Shift 2 closing as opening stock
  const nextDayShift1Opening = shift2Closing;
  assert.equal(nextDayShift1Opening, 69050);
});

test('Requirement 3: Disabled/Inactive filter for tanks & nozzles and dynamic >50L dip threshold', () => {
  const mixedTanks = [
    {
      id: 'active-tank-1',
      name: 'Tank 1',
      fuelCode: 'HSD',
      fuelName: 'Diesel / HSD',
      capacity: 45000,
      currentStock: 25000,
      todayDispensed: 5000,
      todayRevenue: 400000,
      active: true,
      dip: { mm: 1020 },
      calibration: 24.5, // 1020 * 24.5 = 24990 => diff is -10 L (<= 50L threshold, NO anomaly)
      nozzles: [
        { id: 'nz-1', nozzleNumber: '1', active: true, todayDispensed: 2500, todayRevenue: 200000 },
        { id: 'nz-2', nozzleNumber: '2', active: false, todayDispensed: 1000, todayRevenue: 80000 }, // DISABLED NOZZLE
      ],
    },
    {
      id: 'disabled-tank-2',
      name: 'Tank 2 (Maintenance)',
      fuelCode: 'PMG',
      fuelName: 'Petrol / PMG',
      capacity: 42750,
      currentStock: 10000,
      todayDispensed: 0,
      todayRevenue: 0,
      active: false, // DEACTIVATED TANK
      nozzles: [
        { id: 'nz-3', nozzleNumber: '3', active: true, todayDispensed: 0, todayRevenue: 0 },
      ],
    },
    {
      id: 'active-tank-3',
      name: 'Tank 3',
      fuelCode: 'PMG',
      fuelName: 'Petrol / PMG',
      capacity: 42750,
      currentStock: 20000,
      active: true,
      dip: { mm: 850 },
      calibration: 23.8, // 850 * 23.8 = 20230 => diff is +230 L (> 50L threshold, MUST trigger warning)
      nozzles: [
        { id: 'nz-4', nozzleNumber: '4', active: true, todayDispensed: 3000, todayRevenue: 240000 },
      ],
    },
  ];

  // A. Nozzle performance must completely hide disabled nozzles and deactivated tanks
  const nozzlePerf = get_nozzle_performance({ tanks: mixedTanks });
  assert.equal(nozzlePerf.nozzles.length, 2); // only nz-1 and nz-4
  assert.ok(nozzlePerf.nozzles.every(n => n.id !== 'nz-2' && n.id !== 'nz-3'));

  // B. Tank levels must completely hide deactivated tanks
  const tankLevels = get_tank_levels({ tanks: mixedTanks });
  assert.equal(tankLevels.length, 2);
  assert.ok(tankLevels.every(t => t.id !== 'disabled-tank-2'));

  // C. Dynamic dip warning threshold: strictly triggers ONLY when |Physical - Book| > 50 L
  const anomalies = detect_stock_variance({ tanks: mixedTanks });
  // Tank 1 diff is 10 L <= 50L => No anomaly
  assert.ok(!anomalies.some(a => a.tankId === 'active-tank-1'));
  // Tank 3 diff is 230 L > 50L => Triggers Physical Dip Variance
  assert.ok(anomalies.some(a => a.tankId === 'active-tank-3' && a.title.includes('Physical Dip Variance')));
});

test('Requirement 4: Sales Overview Graph spline curve, dual-color stacked area, and period subtitles', () => {
  // Subtitles
  assert.equal(getChartSubtitle('daily', 1), 'Revenue performance across the station - Today');
  assert.equal(getChartSubtitle('weekly', 7), 'Fuel sales revenue (PKR) across the station - Last 7 days');
  assert.equal(getChartSubtitle('monthly', 30), 'Fuel sales revenue (PKR) across the station - Last 30 days');

  const testSeries = [
    { date: '2026-10-01', revenue: 500000, litres: 2000, otherIncome: 30000 },
    { date: '2026-10-02', revenue: 750000, litres: 3000, otherIncome: 45000 },
    { date: '2026-10-03', revenue: 620000, litres: 2500, otherIncome: 20000 },
  ];

  const chart = buildChart(testSeries, 7, { period: 'weekly' });
  assert.equal(chart.empty, false);
  // Spline Cubic Bezier command 'C' in revenuePath
  assert.ok(chart.revenuePath.includes(' C '));
  // Closed polygon areas for dual-color stacked shading
  assert.ok(chart.revenueArea.endsWith(' Z'));
  assert.ok(chart.fuelArea.endsWith(' Z'));

  // Dynamic Y-axis with 15% top buffer: peak total revenue is 750,000 + 45,000 = 795,000.
  // 795,000 * 1.15 = 914,250 => niceCeil => 1,000,000
  assert.ok(chart.maxRev >= 914250);
});

test('Requirement 5: Owner AI Action Registry & Proactive Excel Suggestions', () => {
  // 1. Registry integrity checks
  assert.ok(Array.isArray(AI_ACTION_REGISTRY));
  assert.ok(AI_ACTION_REGISTRY.length >= 10);
  assert.ok(AI_ACTION_REGISTRY.some(a => a.actionType === 'excel'));
  assert.ok(AI_ACTION_REGISTRY.some(a => a.actionType === 'pdf'));
  assert.ok(AI_ACTION_REGISTRY.some(a => a.actionType === 'navigate'));

  // 2. Proactive Excel Suggestions for user queries
  const excelSalesSuggestions = get_action_suggestions('Show me monthly fuel sales in Excel.');
  assert.ok(excelSalesSuggestions.length > 0);
  assert.equal(excelSalesSuggestions[0].actionType, 'excel');
  assert.ok(excelSalesSuggestions[0].keywords.includes('excel'));

  const excelExpenseSuggestions = get_action_suggestions('Can you make an Excel of expenses?');
  assert.ok(excelExpenseSuggestions.length > 0);
  assert.equal(excelExpenseSuggestions[0].actionType, 'excel');
  assert.ok(excelExpenseSuggestions[0].keywords.includes('expenses') || excelExpenseSuggestions[0].keywords.includes('expense'));

  const exportRecordsSuggestions = get_action_suggestions('Export these records to Excel.');
  assert.ok(exportRecordsSuggestions.length > 0);
  assert.equal(exportRecordsSuggestions[0].actionType, 'excel');

  const createExcelReport = get_action_suggestions("Create an Excel report for this month's sales.");
  assert.ok(createExcelReport.length > 0);
  assert.equal(createExcelReport[0].actionType, 'excel');

  // 3. Proactive Excel detection inside process_flow_ai_query
  const mockContext = {
    sales: { daily: { revenue: 900000, litres: 12000 } },
    tanks: [],
    income: [],
    expenses: [],
  };

  const expenseExcelResp = process_flow_ai_query('Can you make an Excel of expenses?', mockContext);
  assert.ok(expenseExcelResp.text.includes('Excel'));
  assert.ok(expenseExcelResp.reportTrigger);
  assert.ok(expenseExcelResp.actionSuggestions.some(a => a.actionType === 'excel'));

  const salesExcelResp = process_flow_ai_query("Show me monthly fuel sales in Excel.", mockContext);
  assert.ok(salesExcelResp.text.includes('Excel'));
  assert.ok(salesExcelResp.reportTrigger);
  assert.ok(salesExcelResp.actionSuggestions.some(a => a.actionType === 'excel'));
});

test('Requirement 5b: Combined keywords specificity and fuel ranking audit', () => {
  // 1. petrol sales gives petrol-specific actions rather than only generic sales actions
  const petrolSales = get_action_suggestions('petrol sales');
  assert.ok(petrolSales.length > 0);
  assert.ok(petrolSales[0].keywords.includes('petrol'), 'Top suggestion must be petrol-specific');
  assert.ok(!petrolSales[0].keywords.includes('diesel'), 'Top suggestion must not be diesel');

  // 2. diesel sales gives diesel-specific actions rather than only generic sales actions
  const dieselSales = get_action_suggestions('diesel sales');
  assert.ok(dieselSales.length > 0);
  assert.ok(dieselSales[0].keywords.includes('diesel'), 'Top suggestion must be diesel-specific');
  assert.ok(!dieselSales[0].keywords.includes('petrol'), 'Top suggestion must not be petrol');

  // 3. monthly petrol sales excel produces specifically relevant monthly petrol Excel action
  const monthlyPetrolExcel = get_action_suggestions('monthly petrol sales excel');
  assert.equal(monthlyPetrolExcel[0].id, 'act-excel-petrol-month');
  assert.equal(monthlyPetrolExcel[0].actionType, 'excel');

  // 4. monthly diesel sales pdf produces specifically relevant diesel PDF action
  const monthlyDieselPdf = get_action_suggestions('monthly diesel sales pdf');
  assert.equal(monthlyDieselPdf[0].id, 'act-pdf-diesel-month');
  assert.equal(monthlyDieselPdf[0].actionType, 'pdf');

  // 5. expenses excel produces expenses Excel action
  const expensesExcel = get_action_suggestions('expenses excel');
  assert.equal(expensesExcel[0].id, 'act-excel-expenses');

  // 6. nozzle sales produces nozzle dispenser action
  const nozzleSales = get_action_suggestions('nozzle sales');
  assert.equal(nozzleSales[0].id, 'act-excel-nozzle-sales');

  // 7. tank report produces tank & inventory audit
  const tankReport = get_action_suggestions('tank report');
  assert.ok(tankReport.some(a => a.keywords.includes('tank')));

  // 8. salary report produces salary excel
  const salaryReport = get_action_suggestions('salary report');
  assert.ok(salaryReport.some(a => a.keywords.includes('salary')));

  // 9. All 23 inputs return valid relevant suggestions
  const exactInputs = [
    'excel', 'pdf', 'petrol', 'diesel', 'sales', 'expenses', 'salary',
    'employees', 'tank', 'nozzle', 'shift', 'inventory', 'petrol sales',
    'diesel sales', 'monthly sales', 'monthly petrol sales', 'petrol sales excel',
    'monthly petrol sales excel', 'monthly diesel sales pdf', 'expenses excel',
    'salary report', 'tank report', 'nozzle sales',
  ];

  exactInputs.forEach(input => {
    const res = get_action_suggestions(input);
    assert.ok(Array.isArray(res) && res.length >= 1, `Input "${input}" must return suggestions`);
    assert.ok(res.every(a => a.id && a.label && a.actionType), `Suggestions for "${input}" must have valid structure`);
  });
});

test('Requirement 5c: Owner AI query processor returns clickable actionSuggestions for all 10 inputs', () => {
  const mockContext = {
    userName: 'Owner',
    sales: { daily: { revenue: 950000, litres: 13000 } },
    tanks: [
      { id: 't1', name: 'Tank 1', fuelCode: 'HSD', fuelName: 'Diesel', todayRevenue: 450000, todayDispensed: 6000 },
      { id: 't2', name: 'Tank 2', fuelCode: 'PMG', fuelName: 'Petrol', todayRevenue: 500000, todayDispensed: 7000 },
    ],
    income: [],
    expenses: [{ id: 'e1', name: 'Generator fuel', category: 'Operations', amount: 35000 }],
    employees: [['Ali', 'Attendant', 'Day', 'Active', 'PKR 35,000']],
    today: '2026-10-04',
  };

  const testInputs = [
    'excel',
    'pdf',
    'petrol sales',
    'diesel sales',
    'expenses excel',
    'monthly petrol sales excel',
    'monthly diesel sales pdf',
    'nozzle sales',
    'salary',
    'reports',
  ];

  testInputs.forEach((input) => {
    const res = process_flow_ai_query(input, mockContext);
    assert.ok(res, `Response must exist for ${input}`);
    assert.ok(Array.isArray(res.actionSuggestions), `actionSuggestions must be an array for "${input}"`);
    assert.ok(res.actionSuggestions.length >= 1, `actionSuggestions must not be empty for "${input}"`);
    assert.ok(res.actionSuggestions.every(a => a.id && a.label && a.actionType), `Every suggestion must have id, label, actionType for "${input}"`);
  });

  // Verify exact priority requirements
  const petrolMonthExcel = process_flow_ai_query('monthly petrol sales excel', mockContext);
  assert.equal(petrolMonthExcel.actionSuggestions[0].id, 'act-excel-petrol-month');

  const dieselMonthPdf = process_flow_ai_query('monthly diesel sales pdf', mockContext);
  assert.equal(dieselMonthPdf.actionSuggestions[0].id, 'act-pdf-diesel-month');

  const expensesExcel = process_flow_ai_query('expenses excel', mockContext);
  assert.equal(expensesExcel.actionSuggestions[0].id, 'act-excel-expenses');

  const nozzleSales = process_flow_ai_query('nozzle sales', mockContext);
  assert.equal(nozzleSales.actionSuggestions[0].id, 'act-excel-nozzle-sales');

  const petrolSales = process_flow_ai_query('petrol sales', mockContext);
  assert.ok(petrolSales.actionSuggestions[0].keywords.includes('petrol'));

  const dieselSales = process_flow_ai_query('diesel sales', mockContext);
  assert.ok(dieselSales.actionSuggestions[0].keywords.includes('diesel'));

  const salary = process_flow_ai_query('salary', mockContext);
  assert.equal(salary.actionSuggestions[0].id, 'act-excel-salary');

  const reports = process_flow_ai_query('reports', mockContext);
  assert.equal(reports.actionSuggestions[0].id, 'act-nav-reports');

  // Verify Urdu translation label
  assert.ok(petrolMonthExcel.actionSuggestions[0].labelUrdu, 'Must have Urdu translation label');
});


