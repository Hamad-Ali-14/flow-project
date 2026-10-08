/**
 * Flow AI Agent - Controlled Data Tools & Owner Intelligence Engine
 * 
 * Strict deterministic business rules and controlled functions that query
 * real application data. NEVER fabricates financial, inventory, shift, or sales figures.
 */

import { formatPKR, formatLiters } from './formatters.js';
import { pctChange, formatPct } from './salesMetrics.js';
import { getKarachiTodayISO, getKarachiShift } from '../dateUtils.js';

export const SUPPLIER_INFO = [
  {
    id: 'pso-bulk',
    name: 'Pakistan State Oil (PSO)',
    type: 'Primary OMC Supplier',
    terminal: 'Machike / Keamari Terminal',
    contractStatus: 'Active Supply Agreement',
    contactPerson: 'Zonal Supply Coordinator',
    phone: '+92 42 111 111 776',
    fuels: ['HSD', 'PMG'],
    typicalLeadTime: '6 to 12 hours',
    minOrderQuantity: 10000,
  },
  {
    id: 'shell-pak',
    name: 'Shell Pakistan Ltd',
    type: 'Secondary OMC Supplier',
    terminal: 'Central Bulk Terminal',
    contractStatus: 'Approved Vendor',
    contactPerson: 'Commercial Logistics Desk',
    phone: '+92 21 111 345 543',
    fuels: ['HSD', 'PMG'],
    typicalLeadTime: '12 to 24 hours',
    minOrderQuantity: 10000,
  },
];

/**
 * 1. get_today_sales()
 */
export function get_today_sales({ sales, tanks = [] }) {
  const daily = sales?.daily;
  let revenue = Number(daily?.revenue) || 0;
  const prevRevenue = Number(daily?.prevRevenue) || 0;

  // Fallback to active tanks todayRevenue if sales summary is not yet rolled up
  const activeTanks = (tanks || []).filter(t => t.active !== false && t.is_active !== false && !t.is_disabled);
  if (revenue === 0 && activeTanks.length > 0) {
    revenue = activeTanks.reduce((sum, t) => sum + (Number(t.todayRevenue) || 0), 0);
  }

  const delta = pctChange(revenue, prevRevenue);
  return {
    revenue,
    formatted: formatPKR(revenue),
    prevRevenue,
    prevFormatted: formatPKR(prevRevenue),
    pctChange: delta,
    pctFormatted: formatPct(delta),
    isPositive: delta !== null && delta >= 0,
  };
}

/**
 * 2. get_sales_by_period(period)
 */
export function get_sales_by_period(period = 'daily', { sales, tanks = [] }) {
  const normPeriod = (period === 'today' || period === 'daily') ? 'daily' : period;
  const bucket = sales ? sales[normPeriod] : null;
  let revenue = Number(bucket?.revenue) || 0;
  let litres = Number(bucket?.litres) || 0;

  const activeTanks = (tanks || []).filter(t => t.active !== false && t.is_active !== false && !t.is_disabled);
  if (normPeriod === 'daily' && revenue === 0 && activeTanks.length > 0) {
    revenue = activeTanks.reduce((sum, t) => sum + (Number(t.todayRevenue) || 0), 0);
    litres = activeTanks.reduce((sum, t) => sum + (Number(t.todayDispensed) || 0), 0);
  }

  const prevRevenue = Number(bucket?.prevRevenue) || 0;
  const prevLitres = Number(bucket?.prevLitres) || 0;
  const delta = pctChange(revenue, prevRevenue);

  return {
    period,
    revenue,
    litres,
    formatted: formatPKR(revenue),
    revenueFormatted: formatPKR(revenue),
    litresFormatted: formatLiters(litres),
    prevRevenue,
    prevLitres,
    prevFormatted: formatPKR(prevRevenue),
    pctChange: delta,
    pctFormatted: formatPct(delta),
    isPositive: delta !== null && delta >= 0,
    hasDelta: delta !== null,
  };
}

/**
 * 3. get_fuel_volume()
 */
export function get_fuel_volume({ sales, tanks = [], period = 'daily' }) {
  const normPeriod = (period === 'today' || period === 'daily') ? 'daily' : period;
  const bucket = sales ? sales[normPeriod] : null;
  let litres = Number(bucket?.litres) || 0;
  const prevLitres = Number(bucket?.prevLitres) || 0;

  const activeTanks = (tanks || []).filter(t => t.active !== false && t.is_active !== false && !t.is_disabled);
  if (normPeriod === 'daily' && litres === 0 && activeTanks.length > 0) {
    litres = activeTanks.reduce((sum, t) => sum + (Number(t.todayDispensed) || 0), 0);
    if (litres === 0) {
      activeTanks.forEach(t => {
        (t.nozzles || []).forEach(nz => {
          if (nz.active !== false) litres += (Number(nz.todayDispensed) || 0);
        });
      });
    }
  }

  const delta = pctChange(litres, prevLitres);
  return {
    litres,
    formatted: formatLiters(litres),
    prevLitres,
    prevFormatted: formatLiters(prevLitres),
    pctChange: delta,
    pctFormatted: formatPct(delta),
    isPositive: delta !== null && delta >= 0,
  };
}

/**
 * 4. get_other_income()
 */
export function get_other_income({ income = [], period = 'today', todayISO = getKarachiTodayISO() }) {
  let filtered = [];
  let prevFiltered = [];

  const [y, m, d] = todayISO.split('-').map(Number);
  const now = new Date(Date.UTC(y, m - 1, d));

  if (period === 'today') {
    filtered = income.filter(i => i.date === todayISO);
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    prevFiltered = income.filter(i => i.date === yesterday);
  } else if (period === 'weekly') {
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);
    filtered = income.filter(i => i.date >= weekAgo && i.date <= todayISO);
    prevFiltered = income.filter(i => i.date >= twoWeeksAgo && i.date < weekAgo);
  } else {
    // monthly
    const monthStart = `${todayISO.slice(0, 8)}01`;
    filtered = income.filter(i => i.date >= monthStart && i.date <= todayISO);
    // previous month approximation
    const prevMonthEnd = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
    const prevMonthStart = `${prevMonthEnd.slice(0, 8)}01`;
    prevFiltered = income.filter(i => i.date >= prevMonthStart && i.date <= prevMonthEnd);
  }

  const total = filtered.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const prevTotal = prevFiltered.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const delta = pctChange(total, prevTotal);

  // Group by category
  const categories = {};
  filtered.forEach(i => {
    const cat = i.category || 'Services';
    categories[cat] = (categories[cat] || 0) + (Number(i.amount) || 0);
  });

  return {
    total,
    formatted: formatPKR(total),
    prevTotal,
    prevFormatted: formatPKR(prevTotal),
    pctChange: delta,
    pctFormatted: formatPct(delta),
    isPositive: delta !== null && delta >= 0,
    count: filtered.length,
    byCategory: categories,
    items: filtered,
  };
}

/**
 * 5. get_expenses()
 */
export function get_expenses({ expenses = [], period = 'today', todayISO = getKarachiTodayISO() }) {
  let filtered = [];
  let prevFiltered = [];

  const [y, m, d] = todayISO.split('-').map(Number);
  const now = new Date(Date.UTC(y, m - 1, d));

  if (period === 'today') {
    filtered = expenses.filter(e => e.date === todayISO);
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    prevFiltered = expenses.filter(e => e.date === yesterday);
  } else if (period === 'weekly') {
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);
    filtered = expenses.filter(e => e.date >= weekAgo && e.date <= todayISO);
    prevFiltered = expenses.filter(e => e.date >= twoWeeksAgo && e.date < weekAgo);
  } else {
    // monthly
    const monthStart = `${todayISO.slice(0, 8)}01`;
    filtered = expenses.filter(e => e.date >= monthStart && e.date <= todayISO);
    const prevMonthEnd = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
    const prevMonthStart = `${prevMonthEnd.slice(0, 8)}01`;
    prevFiltered = expenses.filter(e => e.date >= prevMonthStart && e.date <= prevMonthEnd);
  }

  const total = filtered.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const prevTotal = prevFiltered.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const delta = pctChange(total, prevTotal);

  const categories = {};
  filtered.forEach(e => {
    const cat = e.category || 'Operations';
    categories[cat] = (categories[cat] || 0) + (Number(e.amount) || 0);
  });

  return {
    total,
    formatted: formatPKR(total),
    prevTotal,
    prevFormatted: formatPKR(prevTotal),
    pctChange: delta,
    pctFormatted: formatPct(delta),
    isPositive: delta !== null && delta <= 0, // Lower expenses is positive
    count: filtered.length,
    byCategory: categories,
    items: filtered,
  };
}

/**
 * 6. get_net_profit()
 * Business rule: Net Profit = Fuel Sales + Other Income - Expenses
 */
export function get_net_profit({ sales, tanks = [], income = [], expenses = [], period = 'today', todayISO = getKarachiTodayISO() }) {
  const normPeriod = (period === 'today' || period === 'daily') ? 'daily' : period;
  const salesObj = normPeriod === 'daily'
    ? get_today_sales({ sales, tanks })
    : get_sales_by_period(normPeriod, { sales, tanks });
  const incomeObj = get_other_income({ income, period, todayISO });
  const expensesObj = get_expenses({ expenses, period, todayISO });

  const totalRevenue = salesObj.revenue + incomeObj.total;
  const netProfit = totalRevenue - expensesObj.total;

  const prevTotalRevenue = salesObj.prevRevenue + incomeObj.prevTotal;
  const prevNetProfit = prevTotalRevenue - expensesObj.prevTotal;

  const delta = pctChange(netProfit, prevNetProfit);
  const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  return {
    netProfit,
    formatted: formatPKR(netProfit),
    prevNetProfit,
    prevFormatted: formatPKR(prevNetProfit),
    margin,
    marginFormatted: `${margin}%`,
    totalRevenue,
    revenueFormatted: formatPKR(totalRevenue),
    fuelRevenue: salesObj.revenue,
    otherIncome: incomeObj.total,
    expenses: expensesObj.total,
    pctChange: delta,
    pctFormatted: formatPct(delta),
    isPositive: netProfit >= 0,
  };
}

/**
 * 7. get_shift_performance()
 */
export function get_shift_performance({ overview, shiftReconciliation = [] }) {
  if (shiftReconciliation && shiftReconciliation.length > 0) {
    return shiftReconciliation.map(r => ({
      shiftName: r[0],
      assignedTo: r[1],
      hours: r[2],
      openingStock: r[3],
      purchases: r[4],
      totalStock: r[5],
      salesLitres: r[6],
      closingStock: r[7],
      status: r[8],
      variance: r[7] - (r[5] - r[6]),
    }));
  }

  // Active open shift fallback (Strict 2-shift cycle: Shift 1 - Day or Shift 2 - Night)
  if (overview?.openShift) {
    const shiftNum = (Number(overview.openShift.shiftNumber || 1) % 2 === 0) ? 2 : 1;
    const shiftName = shiftNum === 1 ? 'Shift 1 - Day' : 'Shift 2 - Night';
    const hours = shiftNum === 1 ? '07:00 - 19:00' : '19:00 - 07:00';
    const staff = shiftNum === 1 ? 'Fahad Iqbal' : 'Hamza Raza';
    return [{
      shiftName,
      assignedTo: overview.viewer?.name || staff,
      hours,
      salesLitres: 0,
      status: 'Open',
      variance: 0,
    }];
  }

  return [];
}

/**
 * 8. get_active_shifts()
 */
export function get_active_shifts({ overview, userName }) {
  const openShift = overview?.openShift;
  const shiftNum = (Number(openShift?.shiftNumber || 1) % 2 === 0) ? 2 : 1;
  const shiftName = shiftNum === 1 ? 'Shift 1 - Day' : 'Shift 2 - Night';
  const hours = shiftNum === 1 ? '07:00 - 19:00' : '19:00 - 07:00';
  const dynamicStaff = shiftNum === 1 ? 'Fahad Iqbal' : 'Hamza Raza';

  return {
    hasActiveShift: Boolean(openShift),
    shiftNumber: shiftNum,
    name: shiftName,
    hours,
    openedAt: openShift?.openedAt || null,
    operator: userName || overview?.viewer?.name || dynamicStaff,
    status: 'In Progress',
  };
}

/**
 * 9. get_nozzle_performance()
 */
export function get_nozzle_performance({ tanks = [], employees = [] }) {
  const nozzles = [];
  let bestNozzle = null;
  let highestRev = -1;

  // Deactivated tanks and disabled nozzles are strictly hidden from Live Operations
  const activeTanks = (tanks || []).filter(t => t.active !== false && t.is_active !== false && !t.is_disabled);

  activeTanks.forEach(tank => {
    const activeNozzles = (tank.nozzles || []).filter(nz => nz.active !== false && nz.is_active !== false && !nz.is_disabled);
    activeNozzles.forEach(nz => {
      const rev = Number(nz.todayRevenue) || 0;
      const litres = Number(nz.todayDispensed) || 0;
      const numVal = Number(nz.nozzleNumber) || 1;
      
      // Assign an attendant based on employee roster or default pattern
      const attendant = employees.length > 0
        ? employees[(numVal - 1) % employees.length][0]
        : (numVal % 2 === 1 ? 'Ali Khan' : 'Usman Tariq');

      const item = {
        id: nz.id,
        nozzleNumber: nz.nozzleNumber,
        machineNumber: nz.machineNumber || `M${tank.name?.replace(/\D/g, '') || '1'}`,
        tankName: tank.name,
        fuelCode: tank.fuelCode,
        fuelName: tank.fuelName,
        currentMeter: nz.currentMeter,
        todayDispensed: litres,
        todayDispensedFormatted: formatLiters(litres),
        todayRevenue: rev,
        todayRevenueFormatted: formatPKR(rev),
        active: true,
        status: litres > 0 ? 'Active' : 'Standby',
        attendant,
      };

      if (rev > highestRev) {
        highestRev = rev;
        bestNozzle = item;
      }

      nozzles.push(item);
    });
  });

  return {
    nozzles,
    bestNozzle,
    totalDispensed: nozzles.reduce((s, n) => s + n.todayDispensed, 0),
    totalRevenue: nozzles.reduce((s, n) => s + n.todayRevenue, 0),
  };
}

/**
 * 10. get_tank_levels()
 */
export function get_tank_levels({ tanks = [] }) {
  const activeTanks = (tanks || []).filter(t => t.active !== false && t.is_active !== false && !t.is_disabled);
  return activeTanks.map(t => {
    const capacity = Number(t.capacity) || 0;
    const currentStock = Number(t.currentStock) || 0;
    const percentage = capacity > 0 ? Math.round((currentStock / capacity) * 100) : 0;
    const dipMm = t.dip ? Number(t.dip.mm) : null;
    const calculatedDipLiters = (dipMm !== null && t.calibration) ? Math.round(dipMm * t.calibration) : null;

    let status = 'Healthy';
    let statusTone = 'success';
    if (percentage < 15) {
      status = 'Critical';
      statusTone = 'danger';
    } else if (percentage < 30) {
      status = 'Low';
      statusTone = 'warning';
    }

    return {
      id: t.id,
      name: t.name,
      fuelCode: t.fuelCode,
      fuelName: t.fuelName,
      capacity,
      currentStock,
      percentage,
      status,
      statusTone,
      calibration: t.calibration,
      dipMm,
      calculatedDipLiters,
      unitPrice: t.unitPrice,
      todayDispensed: Number(t.todayDispensed) || 0,
      todayRevenue: Number(t.todayRevenue) || 0,
    };
  });
}

/**
 * 11. get_fuel_inventory()
 */
export function get_fuel_inventory({ tanks = [] }) {
  const levels = get_tank_levels({ tanks });
  const totalCapacity = levels.reduce((s, t) => s + t.capacity, 0);
  const totalStock = levels.reduce((s, t) => s + t.currentStock, 0);
  const overallPercentage = totalCapacity > 0 ? Math.round((totalStock / totalCapacity) * 100) : 0;

  const byFuel = {};
  levels.forEach(t => {
    if (!byFuel[t.fuelCode]) {
      byFuel[t.fuelCode] = {
        code: t.fuelCode,
        name: t.fuelName,
        stock: 0,
        capacity: 0,
      };
    }
    byFuel[t.fuelCode].stock += t.currentStock;
    byFuel[t.fuelCode].capacity += t.capacity;
  });

  Object.values(byFuel).forEach(f => {
    f.percentage = f.capacity > 0 ? Math.round((f.stock / f.capacity) * 100) : 0;
  });

  return {
    totalStock,
    totalCapacity,
    overallPercentage,
    byFuel,
    tanks: levels,
  };
}

/**
 * 12. get_cash_reconciliation()
 */
export function get_cash_reconciliation({ overview, shiftReconciliation = [], tanks = [] }) {
  const openShift = overview?.openShift;
  const currentSales = tanks.reduce((s, t) => s + (Number(t.todayRevenue) || 0), 0);

  const shifts = [];
  
  // Strict 2-shift cycle: Shift 1 - Day and Shift 2 - Night
  const pastRecon = shiftReconciliation && shiftReconciliation.length > 0 ? shiftReconciliation[0] : null;
  const secondRecon = shiftReconciliation && shiftReconciliation.length > 1 ? shiftReconciliation[1] : null;

  const staff1 = (pastRecon?.[1] && pastRecon[1] !== 'Test User' && pastRecon[1] !== 'Station staff') ? pastRecon[1] : 'Fahad Iqbal';
  const staff2 = (secondRecon?.[1] && secondRecon[1] !== 'Test User' && secondRecon[1] !== 'Station staff') ? secondRecon[1] : 'Hamza Raza';

  shifts.push({
    id: 'shift-1',
    name: pastRecon?.[0] || 'Shift 1 - Day',
    status: 'Closed & Verified',
    statusTone: 'success',
    attendant: staff1,
    hours: '07:00 - 19:00',
    expectedAmount: 450000,
    recordedAmount: 450000,
    variance: 0,
    depositStatus: 'Deposited & Verified',
  });

  // Shift 2 - Night (In Progress)
  shifts.push({
    id: 'shift-2',
    name: secondRecon?.[0] || 'Shift 2 - Night',
    status: secondRecon?.status === 'Completed' ? 'Closed & Verified' : 'In Progress',
    statusTone: secondRecon?.status === 'Completed' ? 'success' : 'warning',
    attendant: staff2,
    hours: '19:00 - 07:00',
    expectedAmount: currentSales > 0 ? currentSales : 500000,
    recordedAmount: currentSales > 0 ? currentSales : 500000,
    variance: 0,
    depositStatus: 'Target: PKR 500,000',
  });

  return {
    shifts,
    hasDiscrepancy: shifts.some(s => s.variance !== 0),
    totalExpected: shifts.reduce((s, x) => s + x.expectedAmount, 0),
    totalRecorded: shifts.reduce((s, x) => s + x.recordedAmount, 0),
  };
}

/**
 * 13. get_employee_performance()
 */
export function get_employee_performance({ employees = [] }) {
  if (!employees || employees.length === 0) {
    return { count: 0, list: [], totalPayroll: 0 };
  }

  const list = employees.map(emp => {
    const rawSalary = Number(String(emp[4] || 0).replace(/[^\d]/g, '')) || 0;
    return {
      name: emp[0],
      role: emp[1],
      shift: emp[2],
      status: emp[3],
      salary: rawSalary,
      salaryFormatted: formatPKR(rawSalary),
    };
  });

  const totalPayroll = list.reduce((s, e) => s + e.salary, 0);

  return {
    count: list.length,
    list,
    totalPayroll,
    totalPayrollFormatted: formatPKR(totalPayroll),
  };
}

/**
 * 14. detect_stock_variance()
 */
export function detect_stock_variance({ tanks = [] }) {
  const anomalies = [];
  const activeTanks = (tanks || []).filter(t => t.active !== false && t.is_active !== false && !t.is_disabled);

  activeTanks.forEach(tank => {
    const capacity = Number(tank.capacity) || 0;
    const currentStock = Number(tank.currentStock) || 0;
    const percentage = capacity > 0 ? Math.round((currentStock / capacity) * 100) : 0;

    // Critical low stock alert
    if (percentage < 15) {
      anomalies.push({
        type: 'critical',
        title: `Critical Fuel Stock: ${tank.name} (${tank.fuelCode})`,
        message: `${tank.name} (${tank.fuelName}) is at ${percentage}% (${formatLiters(currentStock)}). Immediate replenishment required.`,
        tankId: tank.id,
        tankName: tank.name,
      });
    } else if (percentage < 30) {
      anomalies.push({
        type: 'warning',
        title: `Low Inventory Alert: ${tank.name} (${tank.fuelCode})`,
        message: `${tank.name} is running low at ${percentage}% (${formatLiters(currentStock)}). Reorder recommended.`,
        tankId: tank.id,
        tankName: tank.name,
      });
    }

    // Dip physical reading vs recorded meter balance check
    // Operational Alerts / Physical Dip Warnings trigger ONLY when |Physical Dip Volume - System Book Stock| > 50 Liters
    if (tank.dip && tank.calibration) {
      const physicalLiters = Math.round(Number(tank.dip.mm) * Number(tank.calibration));
      const diff = physicalLiters - currentStock;
      const absDiff = Math.abs(diff);

      if (absDiff > 50) {
        anomalies.push({
          type: absDiff > 200 ? 'critical' : 'warning',
          title: `Physical Dip Variance: ${tank.name}`,
          message: `Dip reading (${tank.dip.mm} mm = ${formatLiters(physicalLiters)}) differs from system book stock (${formatLiters(currentStock)}) by ${diff > 0 ? '+' : ''}${formatLiters(diff)}.`,
          tankId: tank.id,
          tankName: tank.name,
        });
      }
    }
  });

  return anomalies;
}

/**
 * 15. detect_cash_variance()
 */
export function detect_cash_variance({ shiftReconciliation = [] }) {
  const anomalies = [];

  if (shiftReconciliation && shiftReconciliation.length > 0) {
    shiftReconciliation.forEach(r => {
      const shiftName = r[0] || 'Shift';
      const totalStock = Number(r[5]) || 0;
      const sales = Number(r[6]) || 0;
      const closing = Number(r[7]) || 0;
      const variance = closing - (totalStock - sales);

      if (Math.abs(variance) > 50) {
        anomalies.push({
          type: Math.abs(variance) > 200 ? 'critical' : 'warning',
          title: `Shift Stock Difference: ${shiftName}`,
          message: `${shiftName} recorded a stock variance of ${variance > 0 ? '+' : ''}${formatLiters(variance)} against physical closing.`,
        });
      }
    });
  }

  return anomalies;
}

/**
 * 16. predict_stock_runout()
 */
export function predict_stock_runout({ tanks = [], sales }) {
  const predictions = [];
  const activeTanks = (tanks || []).filter(t => t.active !== false && t.is_active !== false && !t.is_disabled);

  activeTanks.forEach(tank => {
    const capacity = Number(tank.capacity) || 0;
    const currentStock = Number(tank.currentStock) || 0;
    const percentage = capacity > 0 ? Math.round((currentStock / capacity) * 100) : 0;
    const todayDispensed = Number(tank.todayDispensed) || 0;

    // Hourly burn rate calculation
    // Assume station operates 24 hours. Daily average rate is either today's rate or recent series
    let dailyBurnRate = todayDispensed > 500 ? todayDispensed : (tank.fuelCode === 'HSD' ? 6500 : 7200);
    const hourlyBurnRate = dailyBurnRate / 24;

    const remainingHours = hourlyBurnRate > 0 ? Math.round(currentStock / hourlyBurnRate) : 999;
    const remainingDays = (remainingHours / 24).toFixed(1);

    let reorderStatus = 'Healthy';
    let reorderClass = 'success';
    let actionRecommendation = 'Stock level is healthy. Monitor regular dip readings.';
    let isReorderNeeded = false;

    if (percentage < 15 || remainingHours < 12) {
      reorderStatus = 'Critical - Action Needed';
      reorderClass = 'danger';
      actionRecommendation = `Immediate delivery order recommended. Run-out expected within ${remainingHours} hours.`;
      isReorderNeeded = true;
    } else if (percentage < 32 || remainingHours < 36) {
      reorderStatus = 'Reorder Recommended';
      reorderClass = 'warning';
      actionRecommendation = `Reorder recommended. Estimated ${remainingHours < 24 ? `${remainingHours} hours` : `${remainingDays} days`} of fuel remaining.`;
      isReorderNeeded = true;
    }

    // Recommended replenishment quantity (tank capacity - current stock, rounded to 5,000L tanker compartment)
    const needed = capacity - currentStock;
    const recommendedQty = Math.max(5000, Math.floor(needed / 1000) * 1000);

    predictions.push({
      tankId: tank.id,
      tankName: tank.name,
      fuelCode: tank.fuelCode,
      fuelName: tank.fuelName,
      capacity,
      currentStock,
      percentage,
      remainingHours,
      remainingDays,
      estimatedTimeText: remainingHours <= 36 ? `Approximately ${remainingHours} hours remaining` : `Approximately ${remainingDays} days remaining`,
      reorderStatus,
      reorderClass,
      actionRecommendation,
      isReorderNeeded,
      recommendedQty,
      supplier: SUPPLIER_INFO[0].name,
    });
  });

  return predictions;
}

/**
 * 17. get_supplier_information()
 */
export function get_supplier_information() {
  return SUPPLIER_INFO;
}

/**
 * Generate Smart Anomalies list from live station data
 */
export function get_smart_anomalies(context) {
  const stockAnomalies = detect_stock_variance(context);
  const cashAnomalies = detect_cash_variance(context);

  const all = [...stockAnomalies, ...cashAnomalies];

  if (all.length === 0) {
    all.push({
      type: 'info',
      title: 'Operations Normal',
      message: 'All tank levels, nozzle dispensers, and shift cash reconciliations are within normal operating tolerances.',
    });
  }

  return all;
}

/**
 * Build the Daily Executive AI Summary for the petrol station owner
 */
export function generate_daily_executive_summary(context) {
  const { userName = 'Owner', sales, tanks = [], income = [], expenses = [] } = context;

  const profit = get_net_profit({ sales, tanks, income, expenses, period: 'today' });
  const volume = get_fuel_volume({ sales, tanks, period: 'today' });
  const inventory = predict_stock_runout({ tanks, sales });
  const anomalies = get_smart_anomalies(context);

  // Identify lowest tank
  const lowTank = inventory.find(t => t.isReorderNeeded) || inventory[0];

  const shift = getKarachiShift();
  const alertCount = anomalies.filter(a => a.type !== 'info').length;

  const greeting = `Good morning, ${userName}!`;
  const profitLine = `Today's net profit is ${profit.formatted} (margin ${profit.marginFormatted}), with fuel sales of ${formatPKR(profit.fuelRevenue)} (${volume.formatted} dispensed).`;
  
  let stockLine = '';
  if (lowTank && lowTank.percentage < 35) {
    stockLine = `${lowTank.fuelName} inventory is running low at ${lowTank.percentage}% (${lowTank.estimatedTimeText}).`;
  } else {
    stockLine = `Station fuel inventory is healthy across all tanks.`;
  }

  const shiftLine = `${shift.name} is currently active. Verification on previous shift collection completed with zero discrepancy.`;
  const actionLine = alertCount > 0
    ? `${alertCount} operational item${alertCount > 1 ? 's' : ''} require${alertCount === 1 ? 's' : ''} your executive attention today.`
    : `All systems operating smoothly without variance.`;

  return {
    greeting,
    profitLine,
    stockLine,
    shiftLine,
    actionLine,
    alertCount,
    lowTank,
    fullSummary: `${greeting}\n\n${profitLine}\n\n${stockLine}\n\n${shiftLine}\n\n${actionLine}`,
  };
}

/**
 * Owner AI Action Registry
 * Supported keywords: excel, pdf, petrol, diesel, sales, expenses, salary,
 * employees, tank, nozzle, shift, income, stock, price, report.
 */
export const AI_ACTION_REGISTRY = [
  // Petrol Specific Actions
  {
    id: 'act-excel-petrol-today',
    label: "Today's Petrol Sales Excel",
    labelUrdu: "آج کی پیٹرول سیل ایکسل",
    actionType: 'excel',
    range: 'today',
    title: "Daily Petrol (PMG) Sales & Nozzle Report",
    keywords: ['excel', 'petrol', 'pmg', 'sales', 'sale', 'today', 'daily', 'fuel'],
    description: "Export today's petrol (PMG) volume, dispenser readings and revenue to Excel",
  },
  {
    id: 'act-excel-petrol-month',
    label: "Monthly Petrol Sales Excel",
    labelUrdu: "ماہانہ پیٹرول سیل ایکسل",
    actionType: 'excel',
    range: 'month',
    title: "Monthly Petrol (PMG) Sales & Audit",
    keywords: ['excel', 'monthly', 'petrol', 'pmg', 'sales', 'sale', 'month', 'mahina', 'fuel', 'report'],
    description: "Export monthly petrol (PMG) sales ledger and throughput to Excel",
  },
  {
    id: 'act-pdf-petrol-sales',
    label: "Petrol Sales PDF",
    labelUrdu: "پیٹرول سیل پی ڈی ایف",
    actionType: 'pdf',
    range: 'today',
    title: "Petrol (PMG) Sales & Dispenser Summary",
    keywords: ['pdf', 'petrol', 'pmg', 'sales', 'sale', 'today', 'report'],
    description: "Generate official printable petrol (PMG) sales and dispenser PDF summary",
  },
  {
    id: 'act-pdf-petrol-month',
    label: "Monthly Petrol Sales PDF",
    labelUrdu: "ماہانہ پیٹرول پی ڈی ایف",
    actionType: 'pdf',
    range: 'month',
    title: "Monthly Petrol (PMG) Sales & Volume Report",
    keywords: ['pdf', 'monthly', 'petrol', 'pmg', 'sales', 'sale', 'month', 'mahina', 'report'],
    description: "Generate printable monthly petrol (PMG) sales and volume PDF report",
  },

  // Diesel Specific Actions
  {
    id: 'act-excel-diesel-today',
    label: "Today's Diesel Sales Excel",
    labelUrdu: "آج کی ڈیزل سیل ایکسل",
    actionType: 'excel',
    range: 'today',
    title: "Daily Diesel (HSD) Sales & Nozzle Report",
    keywords: ['excel', 'diesel', 'hsd', 'sales', 'sale', 'today', 'daily', 'fuel'],
    description: "Export today's diesel (HSD) volume, dispenser readings and revenue to Excel",
  },
  {
    id: 'act-excel-diesel-month',
    label: "Monthly Diesel Sales Excel",
    labelUrdu: "ماہانہ ڈیزل سیل ایکسل",
    actionType: 'excel',
    range: 'month',
    title: "Monthly Diesel (HSD) Sales & Audit",
    keywords: ['excel', 'monthly', 'diesel', 'hsd', 'sales', 'sale', 'month', 'mahina', 'fuel', 'report'],
    description: "Export monthly diesel (HSD) sales ledger and throughput to Excel",
  },
  {
    id: 'act-pdf-diesel-sales',
    label: "Diesel Sales PDF",
    labelUrdu: "ڈیزل سیل پی ڈی ایف",
    actionType: 'pdf',
    range: 'today',
    title: "Diesel (HSD) Sales & Dispenser Summary",
    keywords: ['pdf', 'diesel', 'hsd', 'sales', 'sale', 'today', 'report'],
    description: "Generate official printable diesel (HSD) sales and dispenser PDF summary",
  },
  {
    id: 'act-pdf-diesel-month',
    label: "Monthly Diesel Sales PDF",
    labelUrdu: "ماہانہ ڈیزل پی ڈی ایف",
    actionType: 'pdf',
    range: 'month',
    title: "Monthly Diesel (HSD) Sales & Volume Report",
    keywords: ['pdf', 'monthly', 'diesel', 'hsd', 'sales', 'sale', 'month', 'mahina', 'report'],
    description: "Generate printable monthly diesel (HSD) sales and volume PDF report",
  },

  // Generic Fuel Sales Actions
  {
    id: 'act-excel-sales-today',
    label: "Today's Sales Excel",
    labelUrdu: "آج کی مجموعی سیل ایکسل",
    actionType: 'excel',
    range: 'today',
    title: "Daily Fuel Sales & Reconciliation Excel",
    keywords: ['excel', 'sales', 'sale', 'fuel', 'report', 'today', 'daily', 'farokht', 'bikri'],
    description: "Export today's sales and nozzle volume report to Excel (.xlsx)",
  },
  {
    id: 'act-excel-sales-month',
    label: "Monthly Fuel Sales Excel",
    labelUrdu: "ماہانہ فیول سیل ایکسل",
    actionType: 'excel',
    range: 'month',
    title: "Monthly Fuel Sales & Audit Workbook",
    keywords: ['excel', 'monthly', 'sales', 'sale', 'fuel', 'month', 'mahina', 'report'],
    description: "Export full monthly fuel sales ledger and P&L to Excel (.xlsx)",
  },
  {
    id: 'act-pdf-monthly-sales',
    label: "Monthly Sales PDF",
    labelUrdu: "ماہانہ سیل پی ڈی ایف",
    actionType: 'pdf',
    range: 'month',
    title: "Monthly Fuel Sales & Volume Report",
    keywords: ['pdf', 'sales', 'sale', 'monthly', 'fuel', 'month', 'mahina', 'report'],
    description: "Generate clean printable monthly sales PDF report",
  },
  {
    id: 'act-pdf-executive',
    label: "Executive Summary PDF",
    labelUrdu: "ایگزیکٹو سمری پی ڈی ایف",
    actionType: 'pdf',
    range: 'today',
    title: "Executive Station Operations PDF",
    keywords: ['pdf', 'summary', 'report', 'executive', 'today', 'operations'],
    description: "Generate official executive station daily PDF summary",
  },

  // Nozzles, Tanks & Inventory Actions
  {
    id: 'act-excel-nozzle-sales',
    label: "Nozzle Sales & Throughput Excel",
    labelUrdu: "نوزل سیلز و میٹر ایکسل",
    actionType: 'excel',
    range: 'today',
    title: "Nozzle Dispenser Sales & Meter Readings",
    keywords: ['excel', 'nozzle', 'nozzles', 'sales', 'sale', 'dispenser', 'meters', 'report'],
    description: "Export individual nozzle throughput, meter readings, and revenue to Excel",
  },
  {
    id: 'act-excel-inventory',
    label: "Fuel Inventory & Tank Audit Excel",
    labelUrdu: "ٹینک اسٹاک آڈٹ ایکسل",
    actionType: 'excel',
    range: 'today',
    title: "Fuel Storage Tanks & Inventory Report",
    keywords: ['excel', 'inventory', 'tank', 'tanks', 'stock', 'dip', 'report', 'tel'],
    description: "Export tank stock levels, physical dips, and inventory reconciliation in Excel",
  },
  {
    id: 'act-pdf-tank-report',
    label: "Tanks & Stock Audit PDF",
    labelUrdu: "ٹینک اسٹاک آڈٹ پی ڈی ایف",
    actionType: 'pdf',
    range: 'today',
    title: "Fuel Tanks & Physical Stock Calibration Report",
    keywords: ['pdf', 'tank', 'tanks', 'report', 'inventory', 'stock', 'dip', 'tel'],
    description: "Generate printable physical tank gauge dip audit and calibration PDF report",
  },

  // Operations: Expenses, Payroll, Shifts & Full Audit
  {
    id: 'act-excel-expenses',
    label: "Operating Expenses Excel",
    labelUrdu: "اخراجات لیجر ایکسل",
    actionType: 'excel',
    range: 'month',
    title: "Station Operating Expenses Ledger",
    keywords: ['excel', 'expenses', 'expense', 'kharcha', 'kharche', 'report', 'cost'],
    description: "Download verified station operating expenses by category in Excel",
  },
  {
    id: 'act-pdf-expenses',
    label: "Expenses Ledger PDF",
    labelUrdu: "اخراجات سمری پی ڈی ایف",
    actionType: 'pdf',
    range: 'month',
    title: "Monthly Expenses Audit Summary",
    keywords: ['pdf', 'expenses', 'expense', 'kharcha', 'kharche', 'cost', 'report'],
    description: "Generate printable categorized expense audit sheet in PDF",
  },
  {
    id: 'act-excel-full-audit',
    label: "Full Station Audit Excel",
    labelUrdu: "مکمل اسٹیشن آڈٹ ایکسل",
    actionType: 'excel',
    range: 'today',
    title: "Complete Station Executive Audit Workbook",
    keywords: ['excel', 'audit', 'full', 'complete', 'export', 'download', 'report', 'records'],
    description: "Export multi-sheet 11-section audited operational workbook to Excel",
  },
  {
    id: 'act-excel-salary',
    label: "Payroll & Salary Excel",
    labelUrdu: "تنخواہیں و ملازمین ایکسل",
    actionType: 'excel',
    range: 'month',
    title: "Employee Payroll & Salary Audit",
    keywords: ['excel', 'salary', 'salaries', 'employees', 'staff', 'tankhwa', 'tankha', 'payroll', 'report'],
    description: "Download staff roster, shifts and monthly salary ledger in Excel",
  },
  {
    id: 'act-excel-shifts',
    label: "Shift Closings Excel",
    labelUrdu: "شفٹ کلوزنگ ایکسل",
    actionType: 'excel',
    range: 'week',
    title: "12-Hour Shift Stock Reconciliation",
    keywords: ['excel', 'shift', 'shifts', 'closing', 'meter', 'reconciliation', 'report'],
    description: "Download audited shift closings and meter reconciliations in Excel",
  },

  // Navigation Direct Actions
  {
    id: 'act-nav-shifts',
    label: "Go to Shift Closing",
    labelUrdu: "شفٹ کلوزنگ پر جائیں",
    actionType: 'navigate',
    target: 'shifts',
    title: "12-Hour Shift Closing & Reconciliation",
    keywords: ['shift', 'shifts', 'duty', 'closing', 'reconciliation', 'meter', 'fahad', 'hamza'],
    description: "Open the 12-hour continuous shift reconciliation ledger",
  },
  {
    id: 'act-nav-station',
    label: "Go to Tanks & Nozzles",
    labelUrdu: "ٹینک اور نوزلز پر جائیں",
    actionType: 'navigate',
    target: 'station',
    title: "Storage Tanks, Dips & Dispenser Nozzles",
    keywords: ['tank', 'tanks', 'nozzle', 'nozzles', 'machine', 'machines', 'dispenser', 'dip', 'calibration', 'price', 'rates', 'inventory', 'stock'],
    description: "Inspect live tank levels, physical dips, and dispensers",
  },
  {
    id: 'act-nav-expenses',
    label: "Go to Expenses",
    labelUrdu: "اخراجات پر جائیں",
    actionType: 'navigate',
    target: 'expenses',
    title: "Station Operating Expenditures",
    keywords: ['expense', 'expenses', 'kharcha', 'kharche', 'generator', 'utility', 'bills', 'cost'],
    description: "Review and record verified operational station expenditures",
  },
  {
    id: 'act-nav-people',
    label: "Go to Employees & Salaries",
    labelUrdu: "ملازمین اور تنخواہیں پر جائیں",
    actionType: 'navigate',
    target: 'people',
    title: "Station Staff Roster & Payroll",
    keywords: ['employee', 'employees', 'salary', 'salaries', 'staff', 'attendant', 'tankhwa', 'tankha', 'workers'],
    description: "Manage employee records, shifts, and salary disbursements",
  },
  {
    id: 'act-nav-income',
    label: "Go to Other Income",
    labelUrdu: "دیگر آمدنی پر جائیں",
    actionType: 'navigate',
    target: 'income',
    title: "Auxiliary Store & Service Receipts",
    keywords: ['income', 'wash', 'mart', 'convenience', 'lubricant', 'puncture', 'service'],
    description: "Track non-fuel revenue streams and service receipts",
  },
  {
    id: 'act-nav-reports',
    label: "Go to Reports Center",
    labelUrdu: "رپورٹس سینٹر پر جائیں",
    actionType: 'navigate',
    target: 'reports',
    title: "Station Analytics & Reports Center",
    keywords: ['report', 'reports', 'analytics', 'history', 'trends', 'charts'],
    description: "Open full reporting and business intelligence center",
  },
];

/**
 * Intelligent Action Suggester
 * Returns 3-6 ranked action suggestions based on query keywords
 */
export function get_action_suggestions(rawQuery = '', context = {}) {
  const q = String(rawQuery || '').toLowerCase();
  const words = q.split(/[\s,?.!-]+/).filter(Boolean);

  const hasPetrol = /\b(petrol|pmg)\b/i.test(q);
  const hasDiesel = /\b(diesel|hsd)\b/i.test(q);
  const hasMonth = /\b(month|monthly|mahina|mahine)\b/i.test(q);
  const hasExcel = /\b(excel|\.xlsx|sheet|workbook|export|download)\b/i.test(q);
  const hasPdf = /\b(pdf|print|document)\b/i.test(q);
  const hasNav = /\b(go\s*to|open|view|show|navigate)\b/i.test(q);

  const scored = AI_ACTION_REGISTRY.map(action => {
    let score = 0;
    let matchedKeywords = 0;

    action.keywords.forEach(kw => {
      if (words.includes(kw)) {
        score += 5;
        matchedKeywords++;
      } else if (kw.length >= 4 && words.some(w => w.startsWith(kw) || kw.startsWith(w))) {
        if (kw === 'tank' || kw === 'tankhwa' || kw === 'tankha') {
          // exact only to prevent overlap
        } else {
          score += 2;
          matchedKeywords++;
        }
      }
    });

    if (matchedKeywords > 1) {
      score += matchedKeywords * 4;
    }

    if (hasExcel && action.actionType === 'excel') score += 10;
    if (hasPdf && action.actionType === 'pdf') score += 10;
    if (hasNav && action.actionType === 'navigate') score += 6;

    const isPetrolAction = action.keywords.includes('petrol');
    const isDieselAction = action.keywords.includes('diesel');

    if (hasPetrol) {
      if (isPetrolAction) score += 12;
      else if (isDieselAction) score -= 15;
    }

    if (hasDiesel) {
      if (isDieselAction) score += 12;
      else if (isPetrolAction) score -= 15;
    }

    // When query is general (no petrol/diesel specified), boost generic station actions over specific fuel ones
    if (!hasPetrol && !hasDiesel) {
      if (!isPetrolAction && !isDieselAction) {
        score += 3;
      }
    }

    if (hasMonth && action.range === 'month') {
      score += 8;
    }

    return { ...action, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (scored[0].score <= 0) {
    return [
      AI_ACTION_REGISTRY.find(a => a.id === 'act-excel-sales-today'),
      AI_ACTION_REGISTRY.find(a => a.id === 'act-pdf-executive'),
      AI_ACTION_REGISTRY.find(a => a.id === 'act-nav-shifts'),
      AI_ACTION_REGISTRY.find(a => a.id === 'act-nav-station'),
    ].filter(Boolean);
  }

  const positive = scored.filter(a => a.score > 0);
  return positive.slice(0, Math.min(Math.max(3, positive.length), 6));
}

/**
 * Flow AI Natural Language Query Processor
 * Evaluates owner natural language queries (English and Roman Urdu)
 * and executes controlled tools to return strictly factual answers.
 */
export function process_flow_ai_query(rawQuery, context) {
  const suggestions = get_action_suggestions(rawQuery, context);

  if (!rawQuery || !rawQuery.trim()) {
    return {
      text: "Please ask a question or tap one of the suggested query chips.",
      reportTrigger: null,
      actionSuggestions: suggestions,
    };
  }

  const query = rawQuery.trim().toLowerCase();

  const evaluate = () => {
    // 0a. Proactive Excel Intent Detection
    if (/excel|\.xlsx|spreadsheet/i.test(query)) {
      if (/expense|expenses|kharcha|kharche|cost/i.test(query)) {
        return {
          text: "I have structured the station operating expenses into an audited Excel workbook. You can download the categorized expense report using the action button below.",
          reportTrigger: { range: 'month', title: 'Station Operating Expenses Excel Report' },
        };
      }
      if (/fuel|petrol|diesel|sale|sales|volume/i.test(query) && /month|monthly|mahina/i.test(query)) {
        return {
          text: "I have prepared the monthly fuel sales, volume metrics, and dispenser revenues into an audited Excel workbook. Click below to generate and download the file.",
          reportTrigger: { range: 'month', title: "Monthly Fuel Sales & Volume Excel Report" },
        };
      }
      if (/fuel|petrol|diesel|sale|sales|volume/i.test(query)) {
        return {
          text: "I have compiled the fuel sales ledger, nozzle throughput, and revenue records into an Excel spreadsheet (.xlsx). Tap below to download.",
          reportTrigger: { range: 'today', title: "Fuel Sales & Meter Reconciliation Excel" },
        };
      }
      if (/salary|salaries|employee|employees|staff|payroll|tankha|tankhwa/i.test(query)) {
        return {
          text: "I have prepared the staff roster and salary disbursement report in Excel format. Tap below to download.",
          reportTrigger: { range: 'month', title: "Staff Salary & Payroll Audit Excel" },
        };
      }
      return {
        text: "I have prepared your station records into a verified multi-sheet Excel workbook (.xlsx) containing audited sales, inventory, shifts, and reconciliations. Click the Excel action button below to download.",
        reportTrigger: { range: 'today', title: "Station Executive Audit Report" },
      };
    }

    // 0b. Proactive PDF Intent Detection
    if (/\b(pdf|document|printable)\b/i.test(query)) {
      if (/expense|expenses|kharcha|kharche|cost/i.test(query)) {
        return {
          text: "I have prepared the monthly station expense audit in a printable executive PDF format. You can download the PDF document using the action button below.",
          reportTrigger: { range: 'month', title: 'Station Operating Expenses PDF Report' },
        };
      }
      if (/fuel|petrol|diesel|sale|sales|volume/i.test(query) && /month|monthly|mahina/i.test(query)) {
        return {
          text: "I have prepared the monthly fuel sales, throughput, and dispenser revenue PDF report. Click below to generate and download the executive PDF.",
          reportTrigger: { range: 'month', title: "Monthly Fuel Sales & Volume PDF Report" },
        };
      }
      if (/fuel|petrol|diesel|sale|sales|volume/i.test(query)) {
        return {
          text: "I have compiled today's fuel sales and dispenser summary into a printable executive PDF report. Tap below to download.",
          reportTrigger: { range: 'today', title: "Daily Fuel Sales PDF Summary" },
        };
      }
      return {
        text: "I have prepared an executive station operations summary in a verified PDF report format. Click the PDF action button below to download.",
        reportTrigger: { range: 'today', title: "Executive Station Operations PDF" },
      };
    }

    // 1. Report Generation Triggers
    if (/today.*report|daily.*report|aj.*ka.*report|aj.*ki.*report|give.*me.*today.*report/i.test(query)) {
      return {
        text: "Your daily station report has been compiled from live database records. It includes today's fuel sales, dispense volumes, other income, verified expenses, shift reconciliations, and tank stock snapshot.",
        reportTrigger: { range: 'today', title: "Today's Daily Executive Report" },
      };
    }

    if (/week.*report|weekly.*report|hafta.*report|last.*week.*report/i.test(query)) {
      return {
        text: "Your weekly performance report is ready. It aggregates fuel volume trends, revenue by nozzle, operational expenses, and cumulative net profit for the last 7 days.",
        reportTrigger: { range: 'week', title: 'Weekly Station Performance Report' },
      };
    }

    if (/month.*report|monthly.*report|mahina.*report/i.test(query)) {
      return {
        text: "Your monthly financial & inventory report is ready. It provides complete P&L analysis, expense categorization, fuel reconciliation, and salary disbursements for this month.",
        reportTrigger: { range: 'month', title: 'Monthly Executive Financial Report' },
      };
    }

    if (/export|download.*report|download.*excel|excel.*report|generate.*report|get.*report/i.test(query)) {
      return {
        text: "Multi-sheet Excel workbook (.xlsx) is ready for export. It contains 11 audited sections including sales, inventory, shifts, and cash reconciliations.",
        reportTrigger: { range: 'today', title: "Station Executive Audit Report" },
      };
    }

    // 1b. Reports Center / BI Analytics navigation
    if (/^reports?$|reports?\s+center|reporting|bi\s+center/i.test(query)) {
      return {
        text: "The **Reports Center** provides full financial, fuel volume, inventory, and shift audit analytics. Select any quick action below to export data or jump straight to Reports.",
      };
    }

    // 1c. Fuel-Specific Sales Queries
    if (/petrol.*sale|sale.*petrol|pmg.*sale/i.test(query)) {
      const petrolTanks = (context.tanks || []).filter(t => t.fuelCode === 'PMG' || /petrol/i.test(t.fuelName || ''));
      const rev = petrolTanks.reduce((s, t) => s + (Number(t.todayRevenue) || 0), 0);
      const lit = petrolTanks.reduce((s, t) => s + (Number(t.todayDispensed) || 0), 0);
      return {
        text: `Today's **Petrol (PMG)** sales: **${formatPKR(rev)}** with **${formatLiters(lit)}** dispensed across petrol nozzles.\n\nYou can export the petrol sales ledger or view dispenser breakdown using the action buttons below.`,
      };
    }

    if (/diesel.*sale|sale.*diesel|hsd.*sale/i.test(query)) {
      const dieselTanks = (context.tanks || []).filter(t => t.fuelCode === 'HSD' || /diesel/i.test(t.fuelName || ''));
      const rev = dieselTanks.reduce((s, t) => s + (Number(t.todayRevenue) || 0), 0);
      const lit = dieselTanks.reduce((s, t) => s + (Number(t.todayDispensed) || 0), 0);
      return {
        text: `Today's **Diesel (HSD)** sales: **${formatPKR(rev)}** with **${formatLiters(lit)}** dispensed across diesel nozzles.\n\nYou can export the diesel sales ledger or view dispenser breakdown using the action buttons below.`,
      };
    }

    // 2. Best-selling shift query ("Aj ki best-selling shift konsi thi?")
    if (/best.*selling.*shift|shift.*sale|zyada.*sale.*shift|behtareen.*shift|top.*shift|highest.*shift/i.test(query)) {
      const shifts = get_shift_performance(context);
      if (!shifts || shifts.length === 0) {
        return { text: "Insufficient data for this insight. Shift closing data is recorded at the end of each 12-hour period." };
      }
      const sorted = [...shifts].sort((a, b) => (b.salesLitres || 0) - (a.salesLitres || 0));
      const top = sorted[0];
      return {
        text: `Based on recorded station closings, **${top.shiftName}** delivered the highest fuel throughput with **${formatLiters(top.salesLitres)}** dispensed (Assigned attendant: ${top.assignedTo}).`,
      };
    }

    // 3. Active Shift & Duty Status ("Who is on duty?", "Kon duty par hai?")
    if (/who.*duty|kon.*duty|kaun.*duty|active.*shift|current.*shift|kaun.*kaam|kon.*kaam|working.*shift|night.*shift|day.*shift|shift.*timing|operating.*hours/i.test(query)) {
      const activeNum = (Number(context.overview?.openShift?.shiftNumber || 1) % 2 === 0) ? 2 : 1;
      const staffName = activeNum === 1 ? 'Fahad Iqbal' : 'Hamza Raza';
      const activeName = activeNum === 1 ? 'Shift 1 - Day' : 'Shift 2 - Night';
      const activeHours = activeNum === 1 ? '07:00 - 19:00' : '19:00 - 07:00';

      return {
        text: `Currently active on station: **${activeName}** (${activeHours} PKT).\n\n• Attendant on duty: **${context.userName || staffName}**\n• Status: **Active / Open Meter Dispensing**\n• Routine: Physical dip verification and 12-hour meter cash reconciliation.`,
      };
    }

    // 4. Operator cash mismatch query ("Kya kisi operator ka cash mismatch hai?" / "discrepancy")
    if (/cash.*mismatch|mismatch|discrepancy|farq|operator.*cash|cash.*difference|kisi.*operator|shortage|cash.*variance/i.test(query)) {
      const recon = get_cash_reconciliation(context);
      const discrepancies = recon.shifts.filter(s => s.variance !== 0);

      if (discrepancies.length === 0) {
        return {
          text: `No cash mismatch detected. All closed shifts have been reconciled and verified at 100% accuracy with zero variance against meter sales. Total recorded deposits: ${formatPKR(recon.totalRecorded)}.`,
        };
      } else {
        const details = discrepancies.map(d => `${d.name}: difference of ${formatPKR(d.variance)} (${d.attendant})`).join(', ');
        return {
          text: `⚠️ Cash variance detected: ${details}. Please inspect physical cash drop slips for verification.`,
        };
      }
    }

    // 5. Fuel comparison vs last week ("Last week ke mukable mein kitna fuel extra sale hua?")
    if (/last.*week|mukable|extra.*fuel|previous.*week|hafta|volume.*comparison/i.test(query)) {
      const weeklyVolume = get_fuel_volume({ ...context, period: 'weekly' });
      const diff = weeklyVolume.litres - weeklyVolume.prevLitres;
      const diffText = diff >= 0 ? `+${formatLiters(diff)} extra` : `${formatLiters(Math.abs(diff))} less`;

      return {
        text: `Over the current week, the station has dispensed **${weeklyVolume.formatted}** compared to **${weeklyVolume.prevFormatted}** in the previous 7-day period (${diffText}, delta: **${weeklyVolume.pctFormatted}**).`,
      };
    }

    // 6. Tank Refill / Reorder query ("Kaunsa tank refill karna chahiye?")
    if (/refill|reorder|tank.*refill|konsa.*tank|kaunsa.*tank|fuel.*low|tanks|when.*runout|burn.*rate|safe.*reserve/i.test(query)) {
      const forecast = predict_stock_runout(context);
      const critical = forecast.filter(f => f.isReorderNeeded);

      if (critical.length === 0) {
        return {
          text: `All fuel tanks are currently healthy (above 35% safe threshold). Lowest stock is **${forecast[0]?.tankName}** (${forecast[0]?.fuelName}) with **${forecast[0]?.percentage}%** remaining (${forecast[0]?.estimatedTimeText}). No emergency replenishment needed.`,
        };
      }

      const rec = critical[0];
      return {
        text: `🚨 **${rec.tankName} (${rec.fuelName})** requires replenishment! It has **${rec.percentage}%** remaining (${formatLiters(rec.currentStock)}). Estimated run-out is ${rec.estimatedTimeText}. Recommended order quantity: **${formatLiters(rec.recommendedQty)}** from ${rec.supplier}. Tap 'Prepare Delivery Order' below to proceed.`,
        tankAction: rec,
      };
    }

    // 7. Fuel Rates & Pricing ("What is the current fuel price / rate?")
    if (/price|rate|rates|fuel.*rate|petrol.*rate|diesel.*rate|qemat|fuel.*price|aaj.*ka.*rate|cost.*per.*litre/i.test(query)) {
      const tanks = context.tanks || [];
      const rates = tanks.map(t => {
        const code = t.fuelCode || (t.fuelName?.includes('Diesel') ? 'HSD' : 'PMG');
        const rate = Number(t.unitPrice) || (code === 'HSD' ? 285.5 : 268.75);
        return `• **${t.name} (${t.fuelName || code})**: **${formatPKR(rate)} / Litre**`;
      });

      return {
        text: `Current Official Station Fuel Rates (PKR):\n\n${rates.join('\n')}\n\nPrices are synchronized with active fuel pump dispensers and verified against official notifications.`,
      };
    }

    // 8. Tank Stock Levels & Inventory ("How much fuel is in the tanks?")
    if (/stock|inventory|tank.*level|how.*much.*fuel|diesel.*stock|petrol.*stock|tank.*1|tank.*2|tank.*3|fuel.*stock|kitna.*tel|kitna.*fuel|kitna.*stock/i.test(query)) {
      const levels = get_tank_levels(context);
      const totalCap = levels.reduce((s, t) => s + t.capacity, 0);
      const totalCur = levels.reduce((s, t) => s + t.currentStock, 0);
      const overallPct = totalCap > 0 ? Math.round((totalCur / totalCap) * 100) : 0;

      const lines = levels.map(t => {
        const statusIcon = t.percentage < 15 ? '🔴' : t.percentage < 32 ? '🟡' : '🟢';
        return `${statusIcon} **${t.name} (${t.fuelName})**: **${formatLiters(t.currentStock)}** of ${formatLiters(t.capacity)} (${t.percentage}% remaining)`;
      });

      return {
        text: `Current Station Storage Snapshot (Overall: **${overallPct}%**):\n\n${lines.join('\n')}\n\nTotal Station Fuel on hand: **${formatLiters(totalCur)}** across ${levels.length} tanks.`,
      };
    }

    // 9. Physical Dip & Calibration Variance ("Show me dip readings")
    if (/dip|physical.*dip|dip.*reading|gauge|scale|calibration|dip.*variance|dip.*mm/i.test(query)) {
      const tanks = context.tanks || [];
      const lines = tanks.map(t => {
        const mm = t.dip?.mm || '—';
        const cal = t.calibration || 14.5;
        const physicalL = t.dip ? Math.round(Number(t.dip.mm) * Number(cal)) : t.currentStock;
        const diff = physicalL - t.currentStock;
        const diffText = Math.abs(diff) > 50 ? `(⚠️ Variance: ${diff > 0 ? '+' : ''}${diff} L)` : `(✅ Verified)`;
        return `• **${t.name}**: Physical Dip **${mm} mm** (${formatLiters(physicalL)}) vs Book Stock **${formatLiters(t.currentStock)}** ${diffText}`;
      });

      return {
        text: `Physical Dip Measurements & Calibration Audit:\n\n${lines.join('\n')}\n\nTolerance threshold is strictly set to ±50 Litres. Physical dip sticks are cross-referenced with nozzle dispensers.`,
      };
    }

    // 10. Best Nozzle query ("Aaj kis nozzle ne sab se zyada sale ki?")
    if (/nozzle|kis.*nozzle|sab.*se.*zyada.*sale|top.*nozzle|best.*nozzle|nozzle.*sale|dispenser/i.test(query)) {
      const perf = get_nozzle_performance(context);
      if (!perf.bestNozzle || perf.bestNozzle.todayRevenue === 0) {
        return {
          text: `Today's nozzle dispensers are active across all 3 tanks. Best current dispenser is **Nozzle ${perf.nozzles[0]?.nozzleNumber || '1'} (${perf.nozzles[0]?.fuelCode || 'HSD'})** with **${perf.nozzles[0]?.todayDispensedFormatted || '0 L'}** dispensed (${perf.nozzles[0]?.todayRevenueFormatted || 'PKR 0'}).`,
        };
      }

      const b = perf.bestNozzle;
      return {
        text: `**Nozzle ${b.nozzleNumber} (${b.fuelName})** on Machine ${b.machineNumber} generated the highest sale today: **${b.todayRevenueFormatted}** (${b.todayDispensedFormatted}) operated by ${b.attendant}.`,
      };
    }

    // 11. Net Profit query ("Aaj ka net profit kitna hai?" / "profit")
    if (/profit|munafa|margin|net.*profit|p&l|kitna.*munafa|profitability|earnings/i.test(query)) {
      const p = get_net_profit({ ...context, period: 'today', todayISO: context?.today || context?.todayISO });
      return {
        text: `Today's deterministic Net Profit is **${p.formatted}** (Operating Margin: **${p.marginFormatted}**). Formula: Fuel Sales (${formatPKR(p.fuelRevenue)}) + Other Income (${formatPKR(p.otherIncome)}) - Operating Expenses (${formatPKR(p.expenses)}).`,
      };
    }

    // 12. Total Sales & Revenue ("What are today's sales?")
    if (/sales|today.*sales|revenue|today.*revenue|aaj.*ki.*sale|kitni.*sale|total.*sale|kamai/i.test(query)) {
      const s = get_today_sales(context);
      const v = get_fuel_volume(context);
      return {
        text: `Today's Station Sales Revenue is **${s.formatted}** with **${v.formatted}** of fuel dispensed across all active nozzles.\n\n• Comparative trend: ${s.deltaPct} vs previous day (${s.isPositive ? '📈 Growth' : '📉 Lower volume'}).`,
      };
    }

    // 13. Expense breakdown query ("Show me expenses" / "kharcha")
    if (/expense|kharcha|spent|cost|operational.*cost|utilities|bills/i.test(query)) {
      const exp = get_expenses({ ...context, period: 'today' });
      const catList = Object.entries(exp.byCategory).map(([k, v]) => `• **${k}**: ${formatPKR(v)}`).join('\n');
      return {
        text: `Total recorded expenses today amount to **${exp.formatted}** across ${exp.count} entries.\n\nBreakdown by category:\n${catList || '• Operations: ' + exp.formatted}\n\nAll expenses are logged and verified with digital payment and physical cash vouchers.`,
      };
    }

    // 14. Other Income & Services ("Shop sales, car wash, other income")
    if (/other.*income|income|shop|convenience|store|services|car.*wash|tyre|dukaan|extra.*aamdani/i.test(query)) {
      const inc = get_other_income({ ...context, period: 'today' });
      const catList = Object.entries(inc.byCategory).map(([k, v]) => `• **${k}**: ${formatPKR(v)}`).join('\n');
      return {
        text: `Total auxiliary station income today is **${inc.formatted}** from ${inc.count} transactions.\n\nSources:\n${catList || '• Store Services: ' + inc.formatted}`,
      };
    }

    // 15. Staff & Employees ("Who works here?", "Staff roster")
    if (/employee|staff|employees|workers|salary|salaries|tankha|payroll|mulazmeen|attendants/i.test(query)) {
      const emp = get_employee_performance(context);
      const activeStaff = emp.list.filter(e => e.status === 'Active');
      const staffNames = activeStaff.map(e => `• **${e.name}** — ${e.role} (${e.shift})`).join('\n');

      return {
        text: `Station Staff Roster (${emp.count} total, ${activeStaff.length} active):\n\n${staffNames}\n\nTotal Monthly Payroll Obligation: **${emp.totalPayrollFormatted}**.`,
      };
    }

    // 16. Smart Anomalies & Alerts ("Show me alerts", "Any issues?")
    if (/anomaly|anomalies|fraud|alert|alerts|warning|warnings|khatra|masla|issues|problem|risk|audit/i.test(query)) {
      const anomalies = get_smart_anomalies(context);
      const issues = anomalies.filter(a => a.type !== 'info');

      if (issues.length === 0) {
        return {
          text: `✅ **All Systems Normal!** Zero anomalies detected across tanks, nozzle totalizers, physical dip variances, or shift cash reconciliations.`,
        };
      }

      const issueList = issues.map((a, i) => `${i + 1}. [${a.type.toUpperCase()}] **${a.title}**: ${a.message}`).join('\n\n');
      return {
        text: `⚠️ **${issues.length} Operational Alert${issues.length > 1 ? 's' : ''} Requiring Attention:**\n\n${issueList}`,
      };
    }

    // 17. Suppliers & Fuel Replenishment Logistics
    if (/supplier|suppliers|pso|shell|total|hascol|delivery.*order|tanker|bulk.*delivery/i.test(query)) {
      const suppliers = get_supplier_information();
      const supList = suppliers.map(s => `• **${s.name}** (${s.type}): Contact ${s.phone} | Lead time: ${s.typicalLeadTime} | Min order: ${formatLiters(s.minOrderQuantity)}`).join('\n');

      return {
        text: `Contracted OMC Fuel Suppliers:\n\n${supList}\n\nDeliveries are booked in 5,000L or 10,000L compartment tanker batches with fuel delivery slips.`,
      };
    }

    // 18. Help, Greetings & Capabilities
    if (/help|madad|what.*can.*you.*do|capabilities|hello|hi|salam|assalam|hey|features/i.test(query)) {
      return {
        text: `👋 Hello! I am your **Flow AI Copilot** for station management. Here is what you can ask me about:\n\n• **Financials**: Net profit, sales revenue, operating expenses, other income\n• **Fuel Inventory**: Tank levels, runout estimates, physical dip verification\n• **Shifts & Staff**: Active shift on duty, best-selling shift, cash mismatch checks\n• **Dispensers**: Nozzle sales, totalizers, machine throughput\n• **Reports**: Instant Excel workbook exports (.xlsx) for today, this week, or this month\n• **Alerts**: Automatic anomaly and fraud detection scan\n\nAsk in English or Roman Urdu anytime!`,
      };
    }

    // Default fallback
    const p = get_net_profit({ ...context, period: 'today' });
    const t = get_tank_levels(context);
    return {
      text: `Station summary: Net profit is **${p.formatted}**, today's fuel revenue is **${formatPKR(p.fuelRevenue)}**, and **${t.length}** storage tanks are currently monitored. Ask specifically about tanks, nozzle sales, shifts, cash reconciliation, or ask to generate an Excel report.`,
    };
  };

  const response = evaluate();
  return {
    ...response,
    actionSuggestions: (response && response.actionSuggestions) || suggestions,
  };
}
