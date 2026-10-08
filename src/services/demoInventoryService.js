// Demo backend used ONLY when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set.
// It keeps the original sample station (3 tanks, 6 nozzles) in memory so the Tanks &
// nozzles page is fully usable without a database. State resets on page refresh.
// It mirrors the SQL functions' rules and error codes; the SQL remains the real authority.
import { inventoryError } from './inventoryErrors';
import { getKarachiTodayISO, addDaysISO, getKarachiWeekStartISO, getKarachiMonthStartISO } from '../dateUtils';
import { calculateDispensedLiters, calculateSaleAmount, checkStockBounds, roundLiters } from '../utils/inventoryCalculations';

const delay = (ms = 280) => new Promise(resolve => setTimeout(resolve, ms));
const clone = value => JSON.parse(JSON.stringify(value));
const isToday = iso => getKarachiTodayISO(new Date(iso)) === getKarachiTodayISO();
const nozzleOrder = (a, b) => Number(a.number) - Number(b.number);

export function createDemoInventory() {
  const DEMO_USER = 'Demo user';
  const DEMO_SESSION = { email: 'demo@flow.local', name: 'Daud' };
  const listeners = new Set();
  let signedOut = false; // demo sign-out really signs out; signing back in needs no credentials
  let seq = 0;
  let shiftNumber = 1;
  let openShiftId = 'demo-shift-1';
  let openedAt = new Date().toISOString();

  const demoToday = getKarachiTodayISO();
  const demoExpensesList = [
    {
      id: 'demo-exp-1',
      name: 'Fuel delivery',
      category: 'Inventory',
      date: demoToday,
      amount: 284000,
      paymentMethod: 'Bank transfer',
      description: 'Diesel and petrol replenishment for station inventory.',
    },
    {
      id: 'demo-exp-2',
      name: 'Equipment service',
      category: 'Maintenance',
      date: new Date(Date.parse(`${demoToday}T00:00:00Z`) - 86400000).toISOString().slice(0, 10),
      amount: 48000,
      paymentMethod: 'Cash',
      description: 'Preventive service for dispensing equipment.',
    },
    {
      id: 'demo-exp-3',
      name: 'Utilities - June',
      category: 'Utilities',
      date: new Date(Date.parse(`${demoToday}T00:00:00Z`) - 172800000).toISOString().slice(0, 10),
      amount: 36840,
      paymentMethod: 'Bank transfer',
      description: 'Electricity and water utility bill for the station.',
    },
  ];

  const demoIncomeList = [
    {
      id: 'demo-inc-1',
      name: 'Car wash',
      category: 'Services',
      date: demoToday,
      amount: 32400,
      status: 'Received',
      description: 'Sample car wash revenue.',
    },
    {
      id: 'demo-inc-2',
      name: 'Shop sales',
      category: 'Convenience',
      date: demoToday,
      amount: 184230,
      status: 'Received',
      description: 'Sample convenience shop revenue.',
    },
    {
      id: 'demo-inc-3',
      name: 'Air & water',
      category: 'Station services',
      date: new Date(Date.parse(`${demoToday}T00:00:00Z`) - 86400000).toISOString().slice(0, 10),
      amount: 7400,
      status: 'Received',
      description: 'Sample station services revenue.',
    },
  ];

  const demoEmployeesList = [
    ['Fahad Iqbal', 'Station manager', 'Shift 1 - Day', 'Active', 'PKR 65,000'],
    ['Hamza Raza', 'Shift supervisor', 'Shift 2 - Night', 'Active', 'PKR 55,000'],
    ['Imran Shah', 'Pump attendant', 'Shift 1 - Day', 'Active', 'PKR 38,000'],
    ['Noman Tariq', 'Pump attendant', 'Shift 2 - Night', 'Active', 'PKR 37,000'],
    ['Rizwan Ahmed', 'Cleaner', 'General', 'Active', 'PKR 30,000'],
  ];

  const getStaffForShift = (num) => {
    const shiftLabel = num === 1 ? 'Shift 1' : 'Shift 2';
    const match = demoEmployeesList.find(e => e[2] && e[2].includes(shiftLabel) && e[3] === 'Active');
    return match ? match[0] : (num === 1 ? 'Fahad Iqbal' : 'Hamza Raza');
  };

  // Automated 2-shift sequence linking (Shift 1 closing -> Shift 2 opening -> next Day Shift 1 opening)
  let shiftRecords = [
    {
      shiftNumber: 1,
      name: 'Shift 1 - Day',
      assignedTo: 'Fahad Iqbal',
      hours: '07:00 - 19:00',
      openingStock: 75050,
      purchases: 0,
      totalStock: 75050,
      sales: 6800,
      closingStock: 68250,
      status: 'Completed',
    },
    {
      shiftNumber: 2,
      name: 'Shift 2 - Night',
      assignedTo: 'Hamza Raza',
      hours: '19:00 - 07:00',
      openingStock: 68250, // Shift 1 Closing Stock -> Shift 2 Opening Stock
      purchases: 0,
      totalStock: 68250,
      sales: 0,
      closingStock: 68250,
      status: 'Open',
    },
  ];

  const recordShiftClosing = ({ closedShiftNumber, dispensed }) => {
    const closedRec = shiftRecords.find(s => s.shiftNumber === closedShiftNumber && s.status === 'Open') || shiftRecords[0];
    if (closedRec) {
      closedRec.status = 'Completed';
      closedRec.sales = dispensed;
      closedRec.closingStock = closedRec.totalStock - dispensed;
    }
    const nextNum = (closedShiftNumber % 2) + 1; // Strict 2-shift cycle: 1 -> 2 -> 1 ...
    const nextName = nextNum === 1 ? 'Shift 1 - Day' : 'Shift 2 - Night';
    const nextHours = nextNum === 1 ? '07:00 - 19:00' : '19:00 - 07:00';
    const newOpening = closedRec ? closedRec.closingStock : 75050;

    shiftRecords.unshift({
      shiftNumber: nextNum,
      name: nextName,
      assignedTo: getStaffForShift(nextNum),
      hours: nextHours,
      openingStock: newOpening,
      purchases: 0,
      totalStock: newOpening,
      sales: 0,
      closingStock: newOpening,
      status: 'Open',
    });
    if (shiftRecords.length > 10) shiftRecords.pop();
  };

  const machines = [
    { id: 'demo-machine-1', machineNumber: 'M1', name: 'Dispenser 1 (Diesel)', active: true, status: 'working', createdAt: new Date().toISOString() },
    { id: 'demo-machine-2', machineNumber: 'M2', name: 'Dispenser 2 (Petrol)', active: true, status: 'working', createdAt: new Date().toISOString() },
    { id: 'demo-machine-3', machineNumber: 'M3', name: 'Dispenser 3 (Petrol)', active: true, status: 'working', createdAt: new Date().toISOString() },
  ];

  const tanks = [
    { id: 'demo-tank-1', name: 'Tank 1', fuelCode: 'HSD', fuelName: 'Diesel / HSD', capacity: 45000, stock: 30400, calibration: 24.5, dip: 1840 },
    { id: 'demo-tank-2', name: 'Tank 2', fuelCode: 'PMG', fuelName: 'Petrol / PMG', capacity: 42750, stock: 27550, calibration: 23.8, dip: 1625 },
    { id: 'demo-tank-3', name: 'Tank 3', fuelCode: 'PMG', fuelName: 'Petrol / PMG', capacity: 42750, stock: 23900, calibration: 23.8, dip: 1438 },
  ].map(t => ({ ...t, active: true }));

  const nozzles = [
    ['1', 'demo-tank-1', 83500, 'M1'], ['2', 'demo-tank-1', 90250, 'M1'],
    ['3', 'demo-tank-2', 123600, 'M2'], ['4', 'demo-tank-2', 208600, 'M2'],
    ['5', 'demo-tank-3', 132200, 'M3'], ['6', 'demo-tank-3', 118100, 'M3'],
  ].map(([number, tankId, meter, machineNumber]) => ({
    id: `demo-nozzle-${number}`,
    number,
    tankId,
    meter,
    machineNumber: machineNumber || 'M1',
    active: true,
    status: 'working',
  }));

  // Sample prices (PKR / litre) so the demo can show revenue. Real prices live in the database.
  const fuels = [
    { id: 'demo-fuel-HSD', code: 'HSD', name: 'Diesel / HSD', price: 285.5, effectiveFrom: new Date().toISOString() },
    { id: 'demo-fuel-PMG', code: 'PMG', name: 'Petrol / PMG', price: 268.75, effectiveFrom: new Date().toISOString() },
  ];
  const schedule = []; // { id, fuelId, price, effectiveAt (ms), status }
  const priceHistory = fuels.map(f => ({ id: `demo-ph-${f.code}`, fuelCode: f.code, fuelName: f.name, price: f.price, previousPrice: null, effectiveFrom: f.effectiveFrom, source: 'INITIAL', userName: DEMO_USER }));
  const fuelOf = tank => fuels.find(f => f.code === tank.fuelCode);
  // Mirrors _apply_due_prices(): switch every scheduled change whose time has come.
  const applyDue = () => {
    let n = 0;
    schedule.filter(s => s.status === 'PENDING' && s.effectiveAt <= Date.now()).sort((a, b) => a.effectiveAt - b.effectiveAt).forEach(s => {
      const fuel = fuels.find(f => f.id === s.fuelId);
      priceHistory.unshift({ id: `demo-ph-${++seq}`, fuelCode: fuel.code, fuelName: fuel.name, price: s.price, previousPrice: fuel.price, effectiveFrom: new Date(s.effectiveAt).toISOString(), source: 'SCHEDULED', userName: DEMO_USER });
      fuel.price = s.price; fuel.effectiveFrom = new Date(s.effectiveAt).toISOString();
      s.status = 'APPLIED'; n += 1;
    });
    return n;
  };
  const pricesView = () => ({
    serverTime: new Date().toISOString(),
    fuels: fuels.map(f => {
      const p = schedule.find(s => s.fuelId === f.id && s.status === 'PENDING');
      return { id: f.id, code: f.code, name: f.name, price: f.price, effectiveFrom: f.effectiveFrom, pending: p ? { id: p.id, price: p.price, effectiveAt: new Date(p.effectiveAt).toISOString() } : null };
    }),
    history: priceHistory.slice(0, 12),
  });

  const transactions = [];
  const dips = [];
  const post = ({ tank, type, quantity, nozzle = null, shift = null, reference = null, remarks = null, reason = null, approvalNote = null, unitPrice = null, saleAmount = null }) => {
    const before = tank.stock;
    const after = roundLiters(before + quantity);
    tank.stock = after;
    transactions.push({
      seq: ++seq, id: `demo-tx-${seq}`, tankId: tank.id, createdAt: new Date().toISOString(), type,
      nozzleNumber: nozzle ? nozzle.number : null, nozzleId: nozzle ? nozzle.id : null, shiftNumber: shift,
      quantity, stockBefore: before, stockAfter: after, reference, remarks, reason, approvalNote, userName: DEMO_USER,
      unitPrice, saleAmount,
    });
  };
  tanks.forEach(t => {
    const opening = t.stock;
    t.stock = 0;
    post({ tank: t, type: 'OPENING_STOCK', quantity: opening, reference: 'OPENING', remarks: 'Opening balance (demo data)' });
    dips.push({ id: `demo-dip-${t.id}`, tankId: t.id, dipMm: t.dip, recordedAt: new Date().toISOString(), remarks: 'Initial reading (demo data)', userName: DEMO_USER });
  });

  // Post completed Shift 1 sales for today (6,800 L dispensed matching completed Shift 1)
  const shift1Sales = [
    { tankId: 'demo-tank-1', nozzleId: 'demo-nozzle-1', litres: 1000, meter: 84500, price: 285.50 },
    { tankId: 'demo-tank-1', nozzleId: 'demo-nozzle-2', litres: 1000, meter: 91250, price: 285.50 },
    { tankId: 'demo-tank-2', nozzleId: 'demo-nozzle-3', litres: 1400, meter: 125000, price: 268.75 },
    { tankId: 'demo-tank-2', nozzleId: 'demo-nozzle-4', litres: 1400, meter: 210000, price: 268.75 },
    { tankId: 'demo-tank-3', nozzleId: 'demo-nozzle-5', litres: 1200, meter: 133400, price: 268.75 },
    { tankId: 'demo-tank-3', nozzleId: 'demo-nozzle-6', litres: 800, meter: 118900, price: 268.75 },
  ];
  shift1Sales.forEach(s => {
    const tank = tanks.find(t => t.id === s.tankId);
    const nozzle = nozzles.find(n => n.id === s.nozzleId);
    if (nozzle) nozzle.meter = s.meter;
    post({
      tank,
      type: 'NOZZLE_SALE',
      quantity: -s.litres,
      nozzle,
      shift: 1,
      reference: 'Shift 1 - Day',
      remarks: `Shift 1 meter reading ${s.meter} (${s.litres} L)`,
      unitPrice: s.price,
      saleAmount: roundLiters(s.litres * s.price),
    });
  });

  // Seed past 30 days of sales history for charts and period comparison deltas
  const nowMs = Date.now();
  for (let dayOffset = 1; dayOffset <= 30; dayOffset++) {
    const dayDate = new Date(nowMs - dayOffset * 86400000);
    const dayISO = dayDate.toISOString();
    const daySales = [
      { tankId: 'demo-tank-1', nozzleNumber: '1', litres: 950 + (dayOffset % 5) * 20, price: 285.50 },
      { tankId: 'demo-tank-1', nozzleNumber: '2', litres: 980 + (dayOffset % 4) * 25, price: 285.50 },
      { tankId: 'demo-tank-2', nozzleNumber: '3', litres: 1350 + (dayOffset % 6) * 30, price: 268.75 },
      { tankId: 'demo-tank-2', nozzleNumber: '4', litres: 1380 + (dayOffset % 3) * 40, price: 268.75 },
      { tankId: 'demo-tank-3', nozzleNumber: '5', litres: 1150 + (dayOffset % 5) * 30, price: 268.75 },
      { tankId: 'demo-tank-3', nozzleNumber: '6', litres: 750 + (dayOffset % 4) * 25, price: 268.75 },
    ];
    daySales.forEach(s => {
      transactions.push({
        seq: ++seq,
        id: `demo-hist-tx-${dayOffset}-${s.nozzleNumber}`,
        tankId: s.tankId,
        createdAt: dayISO,
        type: 'NOZZLE_SALE',
        nozzleNumber: s.nozzleNumber,
        nozzleId: `demo-nozzle-${s.nozzleNumber}`,
        shiftNumber: 1,
        quantity: -s.litres,
        stockBefore: 30000,
        stockAfter: 30000 - s.litres,
        reference: 'Shift 1 - Day',
        remarks: 'Historical shift meter sales',
        userName: DEMO_USER,
        unitPrice: s.price,
        saleAmount: roundLiters(s.litres * s.price),
      });
    });
  }

  const persisted = tank => {
    const tx = transactions[transactions.length - 1];
    return {
      transaction: { id: tx.id, quantity: tx.quantity, stockBefore: tx.stockBefore, stockAfter: tx.stockAfter },
      tank: { id: tank.id, name: tank.name, capacity: tank.capacity, currentStock: tank.stock }
    };
  };
  const findTank = id => {
    const tank = tanks.find(t => t.id === id);
    if (!tank) throw inventoryError('TANK_NOT_FOUND');
    return tank;
  };
  const guardMove = (tank, quantity, context) => {
    if (!tank.active) throw inventoryError('TANK_INACTIVE', { tank_name: tank.name }, context);
    const after = tank.stock + quantity;
    const bounds = checkStockBounds(after, tank.capacity);
    if (bounds.code === 'INSUFFICIENT_STOCK') {
      throw inventoryError('INSUFFICIENT_STOCK', { tank_name: tank.name, available: tank.stock, requested: Math.abs(quantity) }, context);
    }
    if (bounds.code === 'CAPACITY_EXCEEDED') {
      throw inventoryError('CAPACITY_EXCEEDED', { tank_name: tank.name, capacity: tank.capacity, space_available: tank.capacity - tank.stock }, context);
    }
  };
  const positive = (value, signed = false) => {
    if (!Number.isFinite(value) || value === 0 || (!signed && value < 0) || value !== roundLiters(value)) throw inventoryError('INVALID_QUANTITY');
  };

  return {
    mode: 'demo',

    auth: {
      // Only reachable when VITE_DEMO_MODE=true was set explicitly (see services/index.js).
      async getSession() { return signedOut ? null : DEMO_SESSION; },
      onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      async verify() { return true; },
      async signIn() { signedOut = false; listeners.forEach(cb => cb(DEMO_SESSION)); },
      async signOut() { signedOut = true; listeners.forEach(cb => cb(null)); },
      // Demo mode has no accounts or e-mail: the Forgot-password flow only exists for the live database.
      async requestPasswordReset() { },
      async updatePassword() { },
      recovery: { active: false, error: null, mark() { }, clear() { } },
    },

    async getOverview() {
      await delay();
      applyDue();
      return clone({
        viewer: { id: 'demo-user', name: 'Daud', role: 'owner' },
        permissions: { view_tanks: true, receive_fuel: true, close_shift: true, update_dip: true, stock_adjustment: true, view_history: true, enter_readings: true, view_sales: true, manage_prices: true },
        businessDate: getKarachiTodayISO(),
        openShift: { id: openShiftId, shiftNumber, openedAt },
        machines: clone(machines),
        tanks: tanks.map(t => {
          const sales = transactions.filter(x => x.tankId === t.id && x.type === 'NOZZLE_SALE' && isToday(x.createdAt));
          const lastDip = [...dips].reverse().find(d => d.tankId === t.id);
          return {
            id: t.id, name: t.name, active: t.active, fuelCode: t.fuelCode, fuelName: t.fuelName,
            capacity: t.capacity, currentStock: t.stock, calibration: t.calibration,
            dip: lastDip ? { mm: lastDip.dipMm, recordedAt: lastDip.recordedAt } : null,
            todayDispensed: roundLiters(-sales.reduce((s, x) => s + x.quantity, 0)),
            unitPrice: fuelOf(t).price,
            todayRevenue: roundLiters(sales.reduce((s, x) => s + (x.saleAmount || 0), 0)),
            nozzles: nozzles.filter(n => n.tankId === t.id).sort(nozzleOrder).map(n => ({
              id: n.id, nozzleNumber: n.number, machineNumber: n.machineNumber || `M${t.name.replace(/\D/g, '')}`, active: n.active, status: n.status || 'working', currentMeter: n.meter,
              todayDispensed: roundLiters(-sales.filter(x => x.nozzleId === n.id).reduce((s, x) => s + x.quantity, 0)),
              todayRevenue: roundLiters(sales.filter(x => x.nozzleId === n.id).reduce((s, x) => s + (x.saleAmount || 0), 0)),
            })),
          };
        }),
      });
    },

    async receiveFuel({ tankId, quantity, reference, remarks }) {
      await delay();
      positive(quantity);
      const tank = findTank(tankId);
      guardMove(tank, quantity, 'receive');
      post({ tank, type: 'FUEL_RECEIVED', quantity, reference: reference || null, remarks: remarks || null });
      return persisted(tank);
    },

    async openShift() {
      await delay();
    },

    async closeShift({ shiftId, readings }) {
      await delay(450);
      if (shiftId !== openShiftId) throw inventoryError('SHIFT_CLOSED', { shift_number: shiftNumber - 1 }, 'shift');
      applyDue(); // a price change whose time has come applies BEFORE this shift is valued
      const active = nozzles.filter(n => n.active && (n.status || 'working') === 'working').sort((a, b) => a.tankId.localeCompare(b.tankId) || nozzleOrder(a, b));
      const calc = [];
      for (const nozzle of active) {
        const reading = readings.find(r => r.nozzleId === nozzle.id);
        if (!reading || reading.closingMeter == null) throw inventoryError('MISSING_READING', { nozzle_number: nozzle.number }, 'shift');
        if (reading.expectedOpeningMeter != null && reading.expectedOpeningMeter !== nozzle.meter) {
          throw inventoryError('STALE_DATA', { nozzle_number: nozzle.number }, 'shift');
        }
        let dispensed;
        try { dispensed = calculateDispensedLiters(nozzle.meter, reading.closingMeter); } catch {
          throw inventoryError('INVALID_METER', { nozzle_number: nozzle.number, opening: nozzle.meter, closing: reading.closingMeter }, 'shift');
        }
        const fuel = fuelOf(tanks.find(t => t.id === nozzle.tankId));
        if (dispensed > 0 && !(fuel.price > 0)) throw inventoryError('PRICE_NOT_SET', { fuel_name: fuel.name }, 'shift');
        calc.push({ nozzle, closing: reading.closingMeter, dispensed, price: fuel.price });
      }
      // Validate every tank first so a failure never leaves a half-closed shift behind.
      for (const tank of tanks) {
        const need = calc.filter(c => c.nozzle.tankId === tank.id).reduce((s, c) => s + c.dispensed, 0);
        if (need > tank.stock) throw inventoryError('INSUFFICIENT_STOCK', { tank_name: tank.name, available: tank.stock, requested: need }, 'shift');
      }
      const closed = shiftNumber;
      let total = 0;
      let revenue = 0;
      for (const { nozzle, closing, dispensed, price } of calc) {
        nozzle.meter = closing;
        total += dispensed;
        const amount = calculateSaleAmount(dispensed, price);
        revenue += amount;
        // The price in force right now is stored on the sale and never changes afterwards.
        if (dispensed > 0) post({ tank: tanks.find(t => t.id === nozzle.tankId), type: 'NOZZLE_SALE', quantity: -dispensed, nozzle, shift: closed, reference: `Shift #${closed}`, unitPrice: price, saleAmount: amount });
      }
      // Strict 2-shift cycle: NEVER increment beyond Shift 2. Resets back to Shift 1 - Day.
      const nextShift = (closed % 2) + 1;
      shiftNumber = nextShift;
      openShiftId = `demo-shift-${shiftNumber}-${Date.now()}`;
      openedAt = new Date().toISOString();
      recordShiftClosing({ closedShiftNumber: closed, dispensed: roundLiters(total) });
      return { shiftNumber: closed, totalDispensed: roundLiters(total), totalRevenue: roundLiters(revenue), nextShiftNumber: shiftNumber };
    },

    async getFuelPrices() {
      await delay(150);
      applyDue();
      return clone(pricesView());
    },

    async setFuelPrice({ fuelTypeId, price, mode, effectiveAt }) {
      await delay();
      if (!Number.isFinite(price) || price <= 0 || price !== roundLiters(price) || price > 100000 || !['instant', 'scheduled'].includes(mode)) throw inventoryError('INVALID_PRICE', {}, 'price');
      applyDue();
      const fuel = fuels.find(f => f.id === fuelTypeId);
      if (!fuel) throw inventoryError('FUEL_NOT_FOUND', {}, 'price');
      if (mode === 'instant') {
        priceHistory.unshift({ id: `demo-ph-${++seq}`, fuelCode: fuel.code, fuelName: fuel.name, price, previousPrice: fuel.price, effectiveFrom: new Date().toISOString(), source: 'INSTANT', userName: DEMO_USER });
        fuel.price = price; fuel.effectiveFrom = new Date().toISOString();
      } else {
        const at = new Date(effectiveAt).getTime();
        if (!Number.isFinite(at) || at <= Date.now() || at > Date.now() + 366 * 86400000) throw inventoryError('SCHEDULE_IN_PAST', {}, 'price');
        schedule.filter(s => s.fuelId === fuel.id && s.status === 'PENDING').forEach(s => { s.status = 'CANCELLED'; });
        schedule.push({ id: `demo-sch-${++seq}`, fuelId: fuel.id, price, effectiveAt: at, status: 'PENDING' });
      }
      return clone(pricesView());
    },

    async cancelScheduledPrice(scheduleId) {
      await delay(150);
      applyDue();
      const item = schedule.find(s => s.id === scheduleId && s.status === 'PENDING');
      if (!item) throw inventoryError('SCHEDULE_NOT_FOUND', {}, 'price');
      item.status = 'CANCELLED';
      return clone(pricesView());
    },

    async applyDuePrices() { return applyDue(); },

    async getSalesSummary() {
      await delay(150);
      applyDue();
      const today = getKarachiTodayISO();
      const byDay = new Map();
      transactions.filter(x => x.type === 'NOZZLE_SALE').forEach(x => {
        const d = getKarachiTodayISO(new Date(x.createdAt));
        const cur = byDay.get(d) || { revenue: 0, litres: 0 };
        cur.revenue += x.saleAmount || 0; cur.litres += -x.quantity;
        byDay.set(d, cur);
      });
      const sum = (from, to) => { let revenue = 0; let litres = 0; byDay.forEach((v, d) => { if (d >= from && d <= to) { revenue += v.revenue; litres += v.litres; } }); return { revenue: roundLiters(revenue), litres: roundLiters(litres) }; };
      const period = (from, to, pFrom, pTo) => { const c = sum(from, to); const p = sum(pFrom, pTo); return { ...c, prevRevenue: p.revenue, prevLitres: p.litres }; };
      const wk = getKarachiWeekStartISO(today);
      const mo = getKarachiMonthStartISO(today);
      const prevMonthEnd = addDaysISO(mo, -1);                       // last day of previous month
      const prevMonthStart = `${prevMonthEnd.slice(0, 8)}01`;
      const sameSpan = addDaysISO(prevMonthStart, Number(today.slice(8)) - 1);
      // 24-hour dynamic interval (12:00 AM to 11:59 PM) for Daily sales graph
      const hourly = Array.from({ length: 24 }, (_, hour) => {
        const hLabel = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
        const txsInHour = transactions.filter(x => {
          if (x.type !== 'NOZZLE_SALE' || !isToday(x.createdAt)) return false;
          const d = new Date(x.createdAt);
          const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', hour12: false }).format(d));
          return h === hour;
        });
        const rev = roundLiters(txsInHour.reduce((s, x) => s + (x.saleAmount || 0), 0));
        const lit = roundLiters(txsInHour.reduce((s, x) => s + (-x.quantity || 0), 0));
        return { hour, time: hLabel, revenue: rev, litres: lit };
      });

      return {
        businessDate: today,
        daily: { ...period(today, today, addDaysISO(today, -1), addDaysISO(today, -1)), hourly },
        weekly: period(wk, today, addDaysISO(wk, -7), addDaysISO(today, -7)),
        monthly: period(mo, today, prevMonthStart, sameSpan < prevMonthEnd ? sameSpan : prevMonthEnd),
        series: Array.from({ length: 31 }, (_, i) => { const d = addDaysISO(today, i - 30); const v = byDay.get(d) || { revenue: 0, litres: 0 }; return { date: d, revenue: roundLiters(v.revenue), litres: roundLiters(v.litres) }; }),
      };
    },

    async recordDip({ tankId, dipMm, remarks }) {
      await delay();
      if (!Number.isFinite(dipMm) || dipMm < 0 || dipMm !== Math.round(dipMm * 10) / 10) throw inventoryError('INVALID_DIP');
      findTank(tankId);
      dips.push({ id: `demo-dip-${++seq}`, tankId, dipMm, recordedAt: new Date().toISOString(), remarks: remarks || null, userName: DEMO_USER });
    },

    async adjustStock({ tankId, adjustment, reason, approvalNote }) {
      await delay();
      positive(adjustment, true);
      if (!reason || reason.trim().length < 3) throw inventoryError('REASON_REQUIRED');
      const tank = findTank(tankId);
      guardMove(tank, adjustment, 'adjust');
      post({ tank, type: 'STOCK_ADJUSTMENT', quantity: adjustment, reason: reason.trim(), approvalNote: approvalNote || null });
      return persisted(tank);
    },

    async listTransactions({ tankId, dateFrom, dateTo, type, nozzleId, shiftNumber: shiftFilter, limit = 25, offset = 0 }) {
      await delay(200);
      const rows = transactions
        .filter(x => x.tankId === tankId)
        .filter(x => !dateFrom || getKarachiTodayISO(new Date(x.createdAt)) >= dateFrom)
        .filter(x => !dateTo || getKarachiTodayISO(new Date(x.createdAt)) <= dateTo)
        .filter(x => !type || x.type === type)
        .filter(x => !nozzleId || x.nozzleId === nozzleId)
        .filter(x => !shiftFilter || x.shiftNumber === Number(shiftFilter))
        .sort((a, b) => b.seq - a.seq);
      return clone({ total: rows.length, rows: rows.slice(offset, offset + limit) });
    },

    async listDips(tankId, limit = 20) {
      await delay(150);
      return clone(dips.filter(d => d.tankId === tankId).reverse().slice(0, limit));
    },

    // ---- Demo Operations (isolated to demo mode) ----
    async getExpenses() {
      await delay(100);
      return clone(demoExpensesList);
    },

    async saveExpense(expense) {
      await delay(100);
      const item = { ...expense, id: `demo-exp-${Date.now()}` };
      demoExpensesList.unshift(item);
      return item;
    },

    async getOtherIncome() {
      await delay(100);
      return clone(demoIncomeList);
    },

    async saveOtherIncome(item) {
      await delay(100);
      const record = { ...item, id: `demo-inc-${Date.now()}` };
      demoIncomeList.unshift(record);
      return record;
    },

    async getEmployees() {
      await delay(100);
      return clone(demoEmployeesList);
    },

    async saveEmployee({ name, designation, salary }) {
      await delay(100);
      const row = [name, designation || 'Pump attendant', 'General', 'Active', `PKR ${Number(salary || 0).toLocaleString('en-PK')}`];
      demoEmployeesList.unshift(row);
      return row;
    },

    async getShiftReconciliation() {
      await delay(100);
      return shiftRecords.map(s => [
        s.name,
        s.assignedTo || getStaffForShift(s.shiftNumber),
        s.hours,
        s.openingStock,
        s.purchases,
        s.totalStock,
        s.sales,
        s.closingStock,
        s.status,
      ]);
    },

    // ---- Module 2: Dispensing Machines & Nozzles ----
    async getMachines() {
      await delay(100);
      return clone(machines);
    },

    async addMachine({ machineNumber, name }) {
      await delay(120);
      const cleanNum = String(machineNumber || '').trim().toUpperCase();
      if (!cleanNum) throw inventoryError('INVALID_MACHINE', { reason: 'Machine number is required' });
      if (machines.some(m => m.machineNumber.toUpperCase() === cleanNum)) {
        throw new Error(`Machine ${cleanNum} already exists.`);
      }
      const newMachine = {
        id: `demo-machine-${Date.now()}`,
        machineNumber: cleanNum,
        name: name ? name.trim() : `Dispenser ${cleanNum}`,
        active: true,
        status: 'working',
        createdAt: new Date().toISOString(),
      };
      machines.push(newMachine);
      return clone(newMachine);
    },

    async updateMachine({ id, machineNumber, name, status, active }) {
      await delay(100);
      const cleanNum = String(machineNumber || id || '').replace(/^derived-/i, '').trim().toUpperCase();
      const m = machines.find(item => item.id === id || item.machineNumber.toUpperCase() === cleanNum);
      if (!m) return { id, machineNumber: cleanNum, name, status, active };
      if (name !== undefined) m.name = name;
      if (status !== undefined) m.status = status;
      if (active !== undefined) m.active = active;
      return clone(m);
    },

    async setMachineStatus({ id, machineNumber, status }) {
      await delay(100);
      const cleanNum = String(machineNumber || id || '').replace(/^derived-/i, '').trim().toUpperCase();
      const m = machines.find(item => item.id === id || item.machineNumber.toUpperCase() === cleanNum);
      if (!m) return { id, machineNumber: cleanNum, status };
      m.status = status === 'not_working' ? 'not_working' : 'working';
      return clone(m);
    },

    async toggleMachineActive({ id, machineNumber, active }) {
      await delay(100);
      const cleanNum = String(machineNumber || id || '').replace(/^derived-/i, '').trim().toUpperCase();
      const m = machines.find(item => item.id === id || item.machineNumber.toUpperCase() === cleanNum);
      if (!m) {
        const newM = {
          id: id || `demo-m-${cleanNum}`,
          machineNumber: cleanNum,
          name: `Dispenser ${cleanNum}`,
          active: Boolean(active),
          status: 'working',
        };
        machines.push(newM);
        return clone(newM);
      }
      m.active = Boolean(active);
      return clone(m);
    },

    async addNozzle({ machineNumber, nozzleNumber, tankId, currentMeterReading = 0 }) {
      await delay(120);
      const mNum = String(machineNumber || '').trim().toUpperCase();
      const nNum = String(nozzleNumber || '').trim();
      if (!mNum || !nNum) throw new Error('Machine number and nozzle number are required.');
      if (!tanks.some(t => t.id === tankId)) throw new Error('Valid tank is required.');
      if (nozzles.some(nz => nz.number === nNum && nz.machineNumber === mNum)) {
        throw new Error(`Nozzle ${nNum} already exists on machine ${mNum}.`);
      }
      const newNozzle = {
        id: `demo-nozzle-${Date.now()}`,
        number: nNum,
        tankId,
        meter: Number(currentMeterReading) || 0,
        machineNumber: mNum,
        active: true,
        status: 'working',
      };
      nozzles.push(newNozzle);
      return clone(newNozzle);
    },

    async updateNozzle({ id, nozzleNumber, status, active }) {
      await delay(100);
      const nz = nozzles.find(item => item.id === id || item.number === String(nozzleNumber || id));
      if (!nz) return { id, nozzleNumber, status, active };
      if (status !== undefined) nz.status = status;
      if (active !== undefined) nz.active = active;
      return clone(nz);
    },

    async setNozzleStatus({ id, nozzleNumber, status }) {
      await delay(100);
      const nz = nozzles.find(item => item.id === id || item.number === String(nozzleNumber || id));
      if (!nz) return { id, nozzleNumber, status };
      nz.status = status === 'not_working' ? 'not_working' : 'working';
      return clone(nz);
    },

    async toggleNozzleActive({ id, nozzleNumber, active }) {
      await delay(100);
      const nz = nozzles.find(item => item.id === id || item.number === String(nozzleNumber || id));
      if (!nz) return { id, nozzleNumber, active: Boolean(active) };
      nz.active = Boolean(active);
      return clone(nz);
    },
  };
}
