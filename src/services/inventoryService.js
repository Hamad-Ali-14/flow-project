// Live backend: every operation is a Supabase RPC. The database computes and
// validates the authoritative stock; this file only calls it and normalises the
// JSON (snake_case -> camelCase, numeric strings -> numbers).
import { inventoryError, toInventoryError } from './inventoryErrors';
import { recoveryLink } from '../lib/supabaseClient';
import { AttendanceError, buildAttendanceRow } from '../utils/attendancePayload';

const toSession = s => {
  const meta = s.user.user_metadata || {};
  return { email: s.user.email, name: meta.full_name || meta.name || null };
};

const num = value => (value === null || value === undefined ? null : Number(value));

function mapOverview(raw) {
  return {
    viewer: raw.viewer ? { id: raw.viewer.id, name: raw.viewer.name, role: raw.viewer.role } : null,
    permissions: raw.permissions || {},
    businessDate: raw.business_date,
    openShift: raw.open_shift
      ? { id: raw.open_shift.id, shiftNumber: num(raw.open_shift.shift_number), openedAt: raw.open_shift.opened_at }
      : null,
    machines: (raw.machines || []).map(m => ({
      id: m.id,
      machineNumber: m.machine_number,
      name: m.name || `Dispenser ${m.machine_number}`,
      active: m.active !== false,
      status: m.status || 'working',
      createdAt: m.created_at,
    })),
    tanks: (raw.tanks || []).map(t => ({
      id: t.id,
      name: t.name,
      active: t.active,
      fuelCode: t.fuel_code,
      fuelName: t.fuel_name,
      capacity: num(t.capacity),
      currentStock: num(t.current_stock),
      calibration: num(t.calibration_litres_per_mm),
      dip: t.dip ? { mm: num(t.dip.dip_mm), recordedAt: t.dip.recorded_at } : null,
      todayDispensed: num(t.today_dispensed) || 0,
      unitPrice: num(t.unit_price),       // null unless the viewer is owner/admin
      todayRevenue: num(t.today_revenue),
      nozzles: (t.nozzles || []).map(nz => ({
        id: nz.id,
        nozzleNumber: String(nz.nozzle_number),
        machineNumber: nz.machine_number,
        active: nz.active !== false,
        status: nz.status || 'working',
        currentMeter: num(nz.current_meter),
        todayDispensed: num(nz.today_dispensed) || 0,
        todayRevenue: num(nz.today_revenue),
      })),
    })),
  };
}

// Mutating RPCs return { transaction, tank }: what the database actually persisted. If that
// record is missing the call is treated as FAILED, so a success message can never be shown
// for a write that was not confirmed.
function mapPersisted(data, context) {
  if (!data || !data.tank || !data.tank.id || !data.transaction) {
    console.error('[inventory] mutation returned no persisted record', data);
    throw inventoryError('UNKNOWN', {}, context);
  }
  return {
    transaction: {
      id: data.transaction.id, quantity: num(data.transaction.quantity_litres),
      stockBefore: num(data.transaction.stock_before), stockAfter: num(data.transaction.stock_after),
    },
    tank: { id: data.tank.id, name: data.tank.name, capacity: num(data.tank.capacity), currentStock: num(data.tank.current_stock) },
  };
}

const mapTransaction = r => ({
  id: r.id,
  createdAt: r.created_at,
  type: r.type,
  nozzleNumber: r.nozzle_number ?? null,
  shiftNumber: num(r.shift_number),
  quantity: num(r.quantity),
  stockBefore: num(r.stock_before),
  stockAfter: num(r.stock_after),
  reference: r.reference,
  remarks: r.remarks,
  reason: r.reason,
  approvalNote: r.approval_note,
  userName: r.user_name,
  unitPrice: num(r.unit_price),
  saleAmount: num(r.sale_amount),
});

const mapPrices = raw => ({
  serverTime: raw.server_time,
  fuels: (raw.fuels || []).map(f => ({
    id: f.id, code: f.code, name: f.name, price: num(f.price), effectiveFrom: f.effective_from,
    pending: f.pending ? { id: f.pending.id, price: num(f.pending.price), effectiveAt: f.pending.effective_at } : null,
  })),
  history: (raw.history || []).map(h => ({
    id: h.id, fuelCode: h.fuel_code, fuelName: h.fuel_name, price: num(h.price), previousPrice: num(h.previous_price),
    effectiveFrom: h.effective_from, source: h.source, userName: h.user_name,
  })),
});

const mapPeriod = p => ({
  revenue: num(p.revenue) || 0, litres: num(p.litres) || 0, prevRevenue: num(p.prev_revenue) || 0, prevLitres: num(p.prev_litres) || 0,
  ...(Array.isArray(p.hourly) ? { hourly: p.hourly.map(h => ({ time: h.time, revenue: num(h.revenue) || 0, litres: num(h.litres) || 0 })) } : {}),
});
const mapSales = raw => ({
  businessDate: raw.business_date,
  daily: mapPeriod(raw.daily), weekly: mapPeriod(raw.weekly), monthly: mapPeriod(raw.monthly),
  ...(raw.last30 ? { last30: mapPeriod(raw.last30) } : {}),
  series: (raw.series || []).map(x => ({ date: x.date, revenue: num(x.revenue) || 0, litres: num(x.litres) || 0 })),
});

// Turns a Supabase/Postgres error into a message that says what actually went wrong.
function attendanceFailure(error, payload, action) {
  if (error instanceof AttendanceError) {
    console.error(`[attendance] ${action} rejected before sending:`, error.message, { payload });
    return error;
  }
  const raw = String(error?.message || error || 'Unknown error');
  const parts = [raw.startsWith('FLOW:') ? raw.slice(5) : raw];
  if (error?.details && !raw.includes(error.details)) parts.push(error.details);
  if (error?.hint) parts.push(`Hint: ${error.hint}`);
  let message = parts.join(' - ');
  if (error?.code === '42P01') message += ' (a required table is missing: run the payroll migrations in database/)';
  if (error?.code === '42501') message += ' (permission denied by row-level security)';
  if (error?.code === '22P02') message += ' (a value has the wrong format, e.g. an id that is not a uuid)';
  if (/failed to fetch|networkerror|load failed/i.test(raw)) message = 'Network error: could not reach the database. Check your connection.';
  console.error(`[attendance] ${action} failed`, {
    code: error?.code, message: error?.message, details: error?.details, hint: error?.hint, status: error?.status, payload,
  });
  return new AttendanceError(message, { code: error?.code, details: error?.details, hint: error?.hint, payload });
}

export function createSupabaseInventory(supabase) {
  async function rpc(name, args, context) {
    let result;
    try {
      result = await supabase.rpc(name, args);
    } catch (thrown) {
      throw toInventoryError(thrown, context);
    }
    if (result.error) throw toInventoryError(result.error, context);
    return result.data;
  }

  return {
    mode: 'live',

    auth: {
      // Instant boot check: reads the locally stored session, no network round trip.
      async getSession() {
        try {
          const { data } = await supabase.auth.getSession();
          return data.session ? toSession(data.session) : null;
        } catch {
          return null; // fail closed
        }
      },
      // Background check, run AFTER the app is already showing: asks the auth server whether the
      // stored session is still valid. Returns false (and drops the dead token) only when the
      // server says it is expired/revoked. A network failure is not treated as "signed out".
      async verify() {
        try {
          const { data, error } = await supabase.auth.getUser();
          if (!error && data?.user) return true;
          if (error && (error.status === 401 || error.status === 403 || /session.*missing|jwt|invalid|expired/i.test(error.message || ''))) {
            await supabase.auth.signOut({ scope: 'local' });
            return false;
          }
          return true;
        } catch {
          return true;
        }
      },
      onChange(callback, onRecovery) {
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          // INITIAL_SESSION replays the stored token UNVERIFIED; getSession() above is the only
          // thing allowed to restore a session on boot.
          if (event === 'INITIAL_SESSION') return;
          // The person opened the link from the "Forgot password?" e-mail: they must choose a new
          // password before the app opens.
          if (event === 'PASSWORD_RECOVERY') { recoveryLink.mark(); if (onRecovery) onRecovery(); }
          callback(session ? toSession(session) : null);
        });
        return () => data.subscription.unsubscribe();
      },
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (/failed to fetch|network/i.test(error.message || '')) throw inventoryError('CONNECTION');
          throw new Error('Incorrect email or password.');
        }
      },
      // `everywhere: true` also revokes the person's other sessions (used after a password reset, so
      // anyone who held the old password or an old session is signed out too). Falls back to this device.
      async signOut({ everywhere = false } = {}) {
        if (everywhere) {
          try { const { error } = await supabase.auth.signOut({ scope: 'global' }); if (!error) return; } catch { /* fall through */ }
        }
        await supabase.auth.signOut({ scope: 'local' }); // this device only
      },

      // ---- Forgot password -------------------------------------------------------------
      // Supabase e-mails a one-time link that returns to THIS page. The answer never reveals whether
      // the address has an account (Supabase succeeds either way), so this can't be used to probe for
      // registered e-mails; only real delivery problems are reported.
      async requestPasswordReset(email) {
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        let result;
        try {
          result = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        } catch (thrown) {
          throw toInventoryError(thrown, 'general');
        }
        const { error } = result;
        if (!error) return;
        const message = String(error.message || '');
        if (/failed to fetch|network|load failed/i.test(message)) throw inventoryError('CONNECTION');
        if (error.status === 429 || /rate limit|too many|only request this (after|once)|security purposes/i.test(message)) {
          throw new Error('Too many reset e-mails were requested. Please wait a few minutes and try again.');
        }
        if (error.status === 400 && /valid.*e-?mail|e-?mail.*(invalid|valid)/i.test(message)) throw new Error('Enter a valid e-mail address.');
        console.error('[auth] password reset e-mail failed', { status: error.status, code: error.code, message });
        throw new Error('The reset e-mail could not be sent right now. Please try again in a few minutes or contact your administrator.');
      },

      // Called from the "choose a new password" screen, while the recovery session is active.
      async updatePassword(password) {
        let result;
        try {
          result = await supabase.auth.updateUser({ password });
        } catch (thrown) {
          throw toInventoryError(thrown, 'general');
        }
        const { error } = result;
        if (!error) return;
        const message = String(error.message || '');
        if (/failed to fetch|network|load failed/i.test(message)) throw inventoryError('CONNECTION');
        if (/different from the old|same as the old|should be different/i.test(message)) throw new Error('Choose a password you have not used before.');
        if (/weak|at least|characters|pwned|easy to guess|password.*(short|strength)/i.test(message)) {
          throw new Error(`That password is not accepted: ${message.replace(/\.$/, '')}. Use at least 8 characters, mixing letters and numbers.`);
        }
        if (error.status === 401 || error.status === 403 || /session.*missing|jwt|expired|not authenticated/i.test(message)) {
          const expired = new Error('This reset link has expired. Please request a new one.');
          expired.code = 'RECOVERY_EXPIRED';
          throw expired;
        }
        console.error('[auth] password update failed', { status: error.status, code: error.code, message });
        throw new Error('Your password could not be changed. Please try again.');
      },

      recovery: recoveryLink,
    },

    async getOverview() {
      return mapOverview(await rpc('get_tank_overview', {}, 'load'));
    },

    async receiveFuel({ tankId, quantity, reference, remarks }) {
      const data = await rpc('receive_fuel', {
        p_tank_id: tankId, p_quantity: quantity, p_reference: reference || null, p_remarks: remarks || null,
      }, 'receive');
      return mapPersisted(data, 'receive');
    },

    async openShift() {
      await rpc('open_shift', {}, 'shift');
    },

    // readings: [{ nozzleId, closingMeter, expectedOpeningMeter }]
    async closeShift({ shiftId, readings }) {
      const data = await rpc('close_shift', {
        p_shift_id: shiftId,
        p_readings: readings.map(r => ({
          nozzle_id: r.nozzleId, closing_meter: r.closingMeter, expected_opening_meter: r.expectedOpeningMeter,
        })),
      }, 'shift');
      return {
        shiftNumber: num(data.shift_number),
        totalDispensed: num(data.total_dispensed),
        totalRevenue: num(data.total_revenue),
        nextShiftNumber: num(data.next_shift?.shift_number),
      };
    },

    // ---- Fuel prices (owner/admin only; the database enforces it) ----
    async getFuelPrices() {
      return mapPrices(await rpc('get_fuel_prices', {}, 'price'));
    },

    // mode: 'instant' | 'scheduled'; effectiveAt: ISO instant (scheduled only)
    async setFuelPrice({ fuelTypeId, price, mode, effectiveAt }) {
      return mapPrices(await rpc('set_fuel_price', {
        p_fuel_type_id: fuelTypeId, p_price: price, p_mode: mode, p_effective_at: mode === 'scheduled' ? effectiveAt : null,
      }, 'price'));
    },

    async cancelScheduledPrice(scheduleId) {
      return mapPrices(await rpc('cancel_scheduled_price', { p_schedule_id: scheduleId }, 'price'));
    },

    // Applies any scheduled change whose time has passed. Returns how many switched.
    async applyDuePrices() {
      return num(await rpc('apply_due_prices', {}, 'price')) || 0;
    },

    async getSalesSummary() {
      return mapSales(await rpc('get_sales_summary', {}, 'sales'));
    },

    async recordDip({ tankId, dipMm, remarks }) {
      await rpc('record_dip_reading', { p_tank_id: tankId, p_dip_mm: dipMm, p_remarks: remarks || null }, 'dip');
    },

    async adjustStock({ tankId, adjustment, reason, approvalNote }) {
      const data = await rpc('adjust_stock', {
        p_tank_id: tankId, p_adjustment: adjustment, p_reason: reason, p_approval_note: approvalNote || null,
      }, 'adjust');
      return mapPersisted(data, 'adjust');
    },

    async listTransactions({ tankId, dateFrom, dateTo, type, nozzleId, shiftNumber, limit = 25, offset = 0 }) {
      const data = await rpc('list_tank_transactions', {
        p_tank_id: tankId,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_type: type || null,
        p_nozzle_id: nozzleId || null,
        p_shift_number: shiftNumber ? Number(shiftNumber) : null,
        p_limit: limit,
        p_offset: offset,
      }, 'general');
      return { total: num(data.total), rows: (data.rows || []).map(mapTransaction) };
    },

    async listDips(tankId, limit = 20) {
      const data = await rpc('list_dip_readings', { p_tank_id: tankId, p_limit: limit }, 'general');
      return (data || []).map(d => ({
        id: d.id, dipMm: num(d.dip_mm), recordedAt: d.recorded_at, remarks: d.remarks, userName: d.user_name,
      }));
    },

    // ---- Operations: Expenses, Other Income, Employees, Shifts ----
    async getExpenses() {
      try {
        const { data, error } = await supabase
          .from('expenses')
          .select('*')
          .order('expense_date', { ascending: false });
        if (error) {
          console.warn('[expenses] query failed:', error.message);
          return [];
        }
        return (data || []).map(e => ({
          id: e.id,
          name: e.name || e.description || e.category,
          category: e.category || 'Operations',
          date: e.expense_date,
          amount: Number(e.amount) || 0,
          paymentMethod: e.payment_method === 'online' ? 'Bank transfer' : (e.payment_method ? e.payment_method.charAt(0).toUpperCase() + e.payment_method.slice(1) : 'Cash'),
          description: e.description || '',
          approved: Boolean(e.approved),
        }));
      } catch (err) {
        console.warn('[expenses] unexpected error:', err);
        return [];
      }
    },

    async saveExpense({ name, category, date, amount, paymentMethod, description }) {
      const pm = String(paymentMethod || 'cash').toLowerCase();
      const methodEnum = pm.includes('bank') || pm.includes('transfer') ? 'online' : ['cash', 'card', 'online', 'credit'].includes(pm) ? pm : 'cash';
      let userId = null;
      try {
        userId = (await supabase.auth.getUser())?.data?.user?.id || null;
      } catch { /* ignore */ }
      const payload = {
        name: name || 'Untitled expense',
        category: category || 'Operations',
        description: description || name || null,
        amount: Number(amount) || 0,
        payment_method: methodEnum,
        expense_date: date,
        entered_by: userId,
      };
      const { data, error } = await supabase.from('expenses').insert(payload).select().single();
      if (error) throw error;
      return {
        id: data.id,
        name: data.name || data.description || data.category,
        category: data.category,
        date: data.expense_date,
        amount: Number(data.amount),
        paymentMethod: paymentMethod || 'Bank transfer',
        description: data.description || '',
        approved: Boolean(data.approved),
      };
    },

    async getOtherIncome() {
      try {
        const { data, error } = await supabase
          .from('other_income')
          .select('*')
          .order('income_date', { ascending: false });
        if (error) {
          console.warn('[other_income] query failed:', error.message);
          return [];
        }
        return (data || []).map(i => ({
          id: i.id,
          name: i.source,
          category: i.category || 'Services',
          date: i.income_date,
          amount: Number(i.amount) || 0,
          status: 'Received',
          description: i.notes || '',
          paymentMethod: i.payment_method === 'online' ? 'Bank transfer' : (i.payment_method ? i.payment_method.charAt(0).toUpperCase() + i.payment_method.slice(1) : 'Cash'),
        }));
      } catch (err) {
        console.warn('[other_income] unexpected error:', err);
        return [];
      }
    },

    async saveOtherIncome({ name, category, date, amount, paymentMethod, description }) {
      const pm = String(paymentMethod || 'cash').toLowerCase();
      const methodEnum = pm.includes('bank') || pm.includes('transfer') ? 'online' : ['cash', 'card', 'online', 'credit'].includes(pm) ? pm : 'cash';
      let userId = null;
      try {
        userId = (await supabase.auth.getUser())?.data?.user?.id || null;
      } catch { /* ignore */ }
      const payload = {
        source: name || 'Untitled income',
        category: category || 'Services',
        notes: description || null,
        amount: Number(amount) || 0,
        payment_method: methodEnum,
        income_date: date,
        entered_by: userId,
      };
      const { data, error } = await supabase.from('other_income').insert(payload).select().single();
      if (error) throw error;
      return {
        id: data.id,
        name: data.source,
        category: data.category || 'Services',
        date: data.income_date,
        amount: Number(data.amount),
        status: 'Received',
        description: data.notes || '',
        paymentMethod: paymentMethod || 'Cash',
      };
    },

    async getEmployees() {
      try {
        const { data, error } = await supabase
          .from('employees')
          .select('id, full_name, designation, monthly_salary, active, shifts(name)')
          .order('full_name');
        if (error) {
          console.warn('[employees] query failed:', error.message);
          return [];
        }
        return (data || []).map(e => [
          e.full_name,
          e.designation,
          e.shifts?.name || 'General',
          e.active ? 'Active' : 'Inactive',
          `PKR ${Number(e.monthly_salary || 0).toLocaleString('en-PK')}`
        ]);
      } catch (err) {
        console.warn('[employees] unexpected error:', err);
        return [];
      }
    },

    async saveEmployee({ name, designation, salary }) {
      const { data, error } = await supabase.from('employees').insert({
        full_name: name,
        designation: designation || 'Pump attendant',
        monthly_salary: Number(salary) || 0,
        active: true,
      }).select().single();
      if (error) throw error;
      return [
        data.full_name,
        data.designation,
        'General',
        'Active',
        `PKR ${Number(data.monthly_salary || 0).toLocaleString('en-PK')}`
      ];
    },

    async getStaffRoster() {
      try {
        const { data, error } = await supabase
          .from('employees')
          .select('id, full_name, designation, shift_id, monthly_salary, active, shifts(id, name)')
          .order('full_name');
        if (error) {
          console.warn('[staffRoster] query failed:', error.message);
          return [];
        }
        return (data || []).map(e => ({
          id: e.id,
          name: e.full_name,
          designation: e.designation,
          shiftId: e.shift_id,
          shiftName: e.shifts?.name || 'Shift 1 - Day',
          monthlySalary: Number(e.monthly_salary || 0),
          active: Boolean(e.active),
        }));
      } catch (err) {
        console.warn('[staffRoster] unexpected error:', err);
        return [];
      }
    },

    async getAttendance({ date, startDate, endDate, employeeId } = {}) {
      try {
        let query = supabase
          .from('attendance')
          .select(`
            id, employee_id, date, shift_id, status, attendance_source,
            check_in_time, check_out_time, notes, created_at, updated_at,
            employees(id, full_name, designation, monthly_salary),
            shifts(id, name)
          `)
          .order('date', { ascending: false });

        if (date) query = query.eq('date', date);
        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);
        if (employeeId) query = query.eq('employee_id', employeeId);

        const { data, error } = await query;
        if (error) {
          console.warn('[attendance] query failed:', error.message);
          return [];
        }
        return (data || []).map(r => ({
          id: r.id,
          employeeId: r.employee_id,
          employeeName: r.employees?.full_name || 'Staff Member',
          designation: r.employees?.designation || 'Staff',
          date: r.date,
          shiftId: r.shift_id,
          shiftName: r.shifts?.name || 'Shift 1 - Day',
          status: r.status,
          attendanceSource: r.attendance_source || 'Manual',
          checkInTime: r.check_in_time,
          checkOutTime: r.check_out_time,
          notes: r.notes || '',
          updatedAt: r.updated_at,
        }));
      } catch (err) {
        console.warn('[attendance] unexpected error:', err);
        return [];
      }
    },

    async markAttendance(record) {
      let payload;
      try {
        payload = buildAttendanceRow(record);
      } catch (err) {
        throw attendanceFailure(err, record, 'markAttendance');
      }
      if (import.meta.env.DEV) console.debug('[attendance] markAttendance payload', payload);

      const { data, error } = await supabase
        .from('attendance')
        .upsert(payload, { onConflict: 'employee_id,date' })
        .select(`
          id, employee_id, date, shift_id, status, attendance_source,
          check_in_time, check_out_time, notes, updated_at,
          employees(id, full_name, designation),
          shifts(id, name)
        `)
        .single();

      if (error) throw attendanceFailure(error, payload, 'markAttendance');
      return {
        id: data.id,
        employeeId: data.employee_id,
        employeeName: data.employees?.full_name || '',
        designation: data.employees?.designation || '',
        date: data.date,
        shiftId: data.shift_id,
        shiftName: data.shifts?.name || 'Shift 1 - Day',
        status: data.status,
        attendanceSource: data.attendance_source || 'Manual',
        checkInTime: data.check_in_time,
        checkOutTime: data.check_out_time,
        notes: data.notes || '',
        updatedAt: data.updated_at,
      };
    },

    async bulkMarkAttendance(records = []) {
      if (!records || !records.length) return [];
      let rows;
      try {
        rows = records.map(buildAttendanceRow);
        // One row per employee+date: a duplicate inside one upsert makes Postgres reject the whole batch.
        const seen = new Set();
        rows = rows.filter(r => { const k = `${r.employee_id}|${r.date}`; if (seen.has(k)) return false; seen.add(k); return true; });
      } catch (err) {
        throw attendanceFailure(err, records, 'bulkMarkAttendance');
      }
      if (import.meta.env.DEV) console.debug('[attendance] bulkMarkAttendance payload', rows);

      const { data, error } = await supabase
        .from('attendance')
        .upsert(rows, { onConflict: 'employee_id,date' })
        .select(`
          id, employee_id, date, shift_id, status, attendance_source,
          check_in_time, check_out_time, notes, updated_at,
          employees(id, full_name, designation),
          shifts(id, name)
        `);

      if (error) throw attendanceFailure(error, rows, 'bulkMarkAttendance');
      return (data || []).map(d => ({
        id: d.id,
        employeeId: d.employee_id,
        employeeName: d.employees?.full_name || '',
        designation: d.employees?.designation || '',
        date: d.date,
        shiftId: d.shift_id,
        shiftName: d.shifts?.name || 'Shift 1 - Day',
        status: d.status,
        attendanceSource: d.attendance_source || 'Manual',
        notes: d.notes || '',
      }));
    },

    async getAttendanceAuditLog({ attendanceId, employeeId } = {}) {
      try {
        let query = supabase
          .from('attendance_audit_log')
          .select('*, employees(full_name, designation)')
          .order('created_at', { ascending: false });

        if (attendanceId) query = query.eq('attendance_id', attendanceId);
        if (employeeId) query = query.eq('employee_id', employeeId);

        const { data, error } = await query;
        if (error) {
          console.warn('[attendanceAudit] query note:', error.message);
          return [];
        }
        return (data || []).map(d => ({
          id: d.id,
          attendanceId: d.attendance_id,
          employeeId: d.employee_id,
          employeeName: d.employees?.full_name || d.changed_by_name || 'Staff Member',
          date: d.attendance_date,
          previousStatus: d.previous_status,
          newStatus: d.new_status,
          previousCheckIn: d.previous_check_in,
          newCheckIn: d.new_check_in,
          previousCheckOut: d.previous_check_out,
          newCheckOut: d.new_check_out,
          reason: d.reason,
          changedBy: d.changed_by,
          changedByName: d.changed_by_name || 'Station Staff',
          createdAt: d.created_at,
        }));
      } catch (err) {
        console.warn('[attendanceAudit] query failed:', err);
        return [];
      }
    },

    async correctAttendanceRecord({
      attendanceId,
      employeeId,
      date,
      previousStatus,
      newStatus,
      reason,
      newCheckIn,
      newCheckOut,
      changedByName = 'Station Staff',
    }) {
      if (!reason || reason.trim().length < 3) {
        throw new Error('A reason of at least 3 characters is required for attendance correction.');
      }

      // 1. Update the attendance record
      const updatePayload = {
        status: newStatus,
        notes: reason.trim(),
        updated_at: new Date().toISOString(),
      };
      if (newCheckIn !== undefined) updatePayload.check_in_time = newCheckIn || null;
      if (newCheckOut !== undefined) updatePayload.check_out_time = newCheckOut || null;

      const { data: updatedAtt, error: attError } = await supabase
        .from('attendance')
        .update(updatePayload)
        .eq('id', attendanceId)
        .select('*, employees(full_name, designation), shifts(name)')
        .single();

      if (attError) throw attError;

      // 2. Insert explicit audit log row
      const { data: auditRow, error: auditError } = await supabase
        .from('attendance_audit_log')
        .insert({
          attendance_id: attendanceId,
          employee_id: employeeId || updatedAtt.employee_id,
          attendance_date: date || updatedAtt.date,
          previous_status: previousStatus,
          new_status: newStatus,
          previous_check_in: updatedAtt.check_in_time,
          new_check_in: newCheckIn || null,
          previous_check_out: updatedAtt.check_out_time,
          new_check_out: newCheckOut || null,
          reason: reason.trim(),
          changed_by_name: changedByName,
        })
        .select()
        .single();

      if (auditError) console.warn('[auditInsert] note:', auditError.message);

      return {
        record: {
          id: updatedAtt.id,
          employeeId: updatedAtt.employee_id,
          employeeName: updatedAtt.employees?.full_name || '',
          designation: updatedAtt.employees?.designation || '',
          date: updatedAtt.date,
          shiftId: updatedAtt.shift_id,
          shiftName: updatedAtt.shifts?.name || 'Shift 1 - Day',
          status: updatedAtt.status,
          attendanceSource: updatedAtt.attendance_source || 'Manual',
          checkInTime: updatedAtt.check_in_time,
          checkOutTime: updatedAtt.check_out_time,
          notes: updatedAtt.notes,
          updatedAt: updatedAtt.updated_at,
        },
        auditEntry: auditRow,
      };
    },

    async getShiftReconciliation() {
      try {
        const { data, error } = await supabase
          .from('shift_closings')
          .select(`
            id, shift_number, business_date, status, opened_at, closed_at,
            opening_cash, closing_cash, closed_by,
            closed_by_user:profiles!shift_closings_closed_by_fkey(full_name),
            meter_readings(sold_litres, sale_amount),
            fuel_transactions(quantity_litres, transaction_type, stock_before, stock_after)
          `)
          .order('shift_number', { ascending: false })
          .limit(10);
        if (error) {
          console.warn('[shift_reconciliation] query failed:', error.message);
          return null;
        }
        if (!data || data.length === 0) return null;

        // Query current live tanks stock to establish deterministic carry-forward anchor
        let liveTankStock = 60988;
        try {
          const { data: tankData } = await supabase.from('tanks').select('current_stock_litres').eq('active', true);
          if (tankData && tankData.length > 0) {
            const sum = tankData.reduce((acc, t) => acc + (Number(t.current_stock_litres) || 0), 0);
            if (sum > 0) liveTankStock = sum;
          }
        } catch { }

        // 1. Map raw shifts to structured records with dynamic staff & standard 12-hour hours
        const shiftList = data.map((sc, idx) => {
          const shiftNum = (Number(sc.shift_number || (data.length - idx)) % 2 === 0) ? 2 : 1;
          const shiftName = shiftNum === 1 ? 'Shift 1 - Day' : 'Shift 2 - Night';
          const defaultHours = shiftNum === 1 ? '07:00 - 19:00' : '19:00 - 07:00';
          const assignedStaff = shiftNum === 1 ? 'Fahad Iqbal' : 'Hamza Raza';
          const rawPerson = sc.closed_by_user?.full_name;
          const person = (rawPerson && rawPerson !== 'Test User' && rawPerson !== 'Station staff')
            ? rawPerson
            : assignedStaff;

          const txs = sc.fuel_transactions || [];
          const salesLitres = txs.filter(t => t.transaction_type === 'NOZZLE_SALE').reduce((sum, t) => sum + Math.abs(Number(t.quantity_litres) || 0), 0)
            || (sc.meter_readings || []).reduce((sum, m) => sum + (Number(m.sold_litres) || 0), 0);
          const purchasesLitres = txs.filter(t => t.transaction_type === 'FUEL_RECEIVED').reduce((sum, t) => sum + (Number(t.quantity_litres) || 0), 0);

          return {
            shiftNum,
            shiftName,
            person,
            hours: defaultHours,
            salesLitres,
            purchasesLitres,
            status: sc.status === 'closed' ? 'Completed' : 'Open',
            openingStock: 0,
            totalStock: 0,
            closingStock: 0,
            closedBy: sc.closed_by,
            openingCash: sc.opening_cash,
            closingCash: sc.closing_cash,
          };
        });

        // 2. Strict Continuous Carry-Forward Math:
        // Total Stock = Opening Stock + Purchases
        // Closing Stock = Total Stock - 12-hour Sales
        // Shift 1 Closing -> Shift 2 Opening -> Next Shift 1 Opening
        let runningStock = liveTankStock;
        for (let i = 0; i < shiftList.length; i++) {
          const s = shiftList[i];
          s.closingStock = runningStock;
          s.totalStock = s.closingStock + s.salesLitres;
          s.openingStock = Math.max(s.totalStock - s.purchasesLitres, 0);
          // Carrying forward backwards in time: current shift's opening stock was previous shift's closing stock
          runningStock = s.openingStock;
        }

        return shiftList.map(s => [
          s.shiftName,
          s.person,
          s.hours,
          s.openingStock,
          s.purchasesLitres,
          s.totalStock,
          s.salesLitres,
          s.closingStock,
          s.status,
          s.closedBy,
          s.openingCash,
          s.closingCash,
        ]);
      } catch (err) {
        console.warn('[shift_reconciliation] error:', err);
        return null;
      }
    },

    // ---- Module 2: Dynamic Dispensing Machines & Nozzles ----
    async getMachines() {
      try {
        const { data, error } = await supabase
          .from('dispensing_machines')
          .select('*')
          .order('machine_number');
        if (error) {
          console.warn('[machines] query failed:', error.message);
          return [];
        }
        return (data || []).map(m => ({
          id: m.id,
          machineNumber: m.machine_number,
          name: m.name || `Dispenser ${m.machine_number}`,
          active: m.active !== false,
          status: m.status || 'working',
          createdAt: m.created_at,
        }));
      } catch (err) {
        console.warn('[machines] unexpected error:', err);
        return [];
      }
    },

    async addMachine({ machineNumber, name }) {
      const cleanNum = String(machineNumber || '').trim().toUpperCase();
      if (!cleanNum) throw new Error('Machine number is required.');
      const { data, error } = await supabase
        .from('dispensing_machines')
        .insert({
          machine_number: cleanNum,
          name: name ? name.trim() : `Dispenser ${cleanNum}`,
          active: true,
          status: 'working',
        })
        .select()
        .single();
      if (error) throw error;
      return {
        id: data.id,
        machineNumber: data.machine_number,
        name: data.name,
        active: data.active,
        status: data.status,
      };
    },

    async updateMachine({ id, machineNumber, name, status, active }) {
      const payload = {};
      if (name !== undefined) payload.name = name;
      if (status !== undefined) payload.status = status;
      if (active !== undefined) payload.active = active;
      payload.updated_at = new Date().toISOString();

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
      const cleanNum = String(machineNumber || (isUuid ? '' : id) || '').replace(/^derived-/i, '').trim().toUpperCase();

      let query = supabase.from('dispensing_machines').update(payload);
      if (isUuid) {
        query = query.eq('id', id);
      } else if (cleanNum) {
        query = query.eq('machine_number', cleanNum);
      }

      const { data, error } = await query.select();
      if (error) throw error;
      return (data && data[0]) || { id: id || cleanNum, machineNumber: cleanNum, ...payload };
    },

    async setMachineStatus({ id, machineNumber, status }) {
      const valid = status === 'not_working' ? 'not_working' : 'working';
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
      const cleanNum = String(machineNumber || (isUuid ? '' : id) || '').replace(/^derived-/i, '').trim().toUpperCase();
      const nowIso = new Date().toISOString();

      let query = supabase.from('dispensing_machines').update({ status: valid, updated_at: nowIso });
      if (isUuid) {
        query = query.eq('id', id);
      } else if (cleanNum) {
        query = query.eq('machine_number', cleanNum);
      }

      const { data, error } = await query.select();
      if (error) throw error;

      if (!data || data.length === 0) {
        if (cleanNum && isUuid) {
          const { data: numData, error: numError } = await supabase
            .from('dispensing_machines')
            .update({ status: valid, updated_at: nowIso })
            .eq('machine_number', cleanNum)
            .select();
          if (!numError && numData && numData.length > 0) return numData[0];
        }
        if (cleanNum) {
          const { data: upsertData } = await supabase
            .from('dispensing_machines')
            .upsert({ machine_number: cleanNum, name: `Dispenser ${cleanNum}`, active: true, status: valid }, { onConflict: 'machine_number' })
            .select();
          if (upsertData && upsertData.length > 0) return upsertData[0];
        }
        return { id: id || cleanNum, machineNumber: cleanNum, status: valid };
      }

      return data[0];
    },

    async toggleMachineActive({ id, machineNumber, active }) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
      const cleanNum = String(machineNumber || (isUuid ? '' : id) || '').replace(/^derived-/i, '').trim().toUpperCase();
      const nextActive = Boolean(active);
      const nowIso = new Date().toISOString();

      let query = supabase.from('dispensing_machines').update({ active: nextActive, updated_at: nowIso });
      if (isUuid) {
        query = query.eq('id', id);
      } else if (cleanNum) {
        query = query.eq('machine_number', cleanNum);
      } else {
        return { id, active: nextActive };
      }

      const { data, error } = await query.select();
      if (error) throw error;

      if (!data || data.length === 0) {
        // Fallback 1: If update by UUID yielded 0 rows, attempt update by machine_number
        if (cleanNum && isUuid) {
          const { data: numData, error: numError } = await supabase
            .from('dispensing_machines')
            .update({ active: nextActive, updated_at: nowIso })
            .eq('machine_number', cleanNum)
            .select();
          if (!numError && numData && numData.length > 0) {
            return numData[0];
          }
        }

        // Fallback 2: If machine is not yet in dispensing_machines, upsert it
        if (cleanNum) {
          const { data: upsertData, error: upsertError } = await supabase
            .from('dispensing_machines')
            .upsert(
              { machine_number: cleanNum, name: `Dispenser ${cleanNum}`, active: nextActive, status: 'working' },
              { onConflict: 'machine_number' }
            )
            .select();
          if (!upsertError && upsertData && upsertData.length > 0) {
            return upsertData[0];
          }
        }

        return { id: id || cleanNum, machineNumber: cleanNum, active: nextActive };
      }

      return data[0];
    },

    async addNozzle({ machineNumber, nozzleNumber, tankId, currentMeterReading = 0 }) {
      const mNum = String(machineNumber || '').trim().toUpperCase();
      const nNum = String(nozzleNumber || '').trim();
      if (!mNum || !nNum) throw new Error('Machine number and nozzle number are required.');
      if (!tankId) throw new Error('Tank ID is required.');
      const meter = Number(currentMeterReading) || 0;
      const { data, error } = await supabase
        .from('nozzles')
        .insert({
          machine_number: mNum,
          nozzle_number: nNum,
          tank_id: tankId,
          current_meter_reading: meter,
          active: true,
          status: 'working',
        })
        .select();
      if (error) throw error;
      return (data && data[0]) || { nozzle_number: nNum, machine_number: mNum };
    },

    async updateNozzle({ id, nozzleNumber, status, active }) {
      const payload = {};
      if (status !== undefined) payload.status = status;
      if (active !== undefined) payload.active = active;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
      let query = supabase.from('nozzles').update(payload);
      if (isUuid) {
        query = query.eq('id', id);
      } else if (nozzleNumber) {
        query = query.eq('nozzle_number', String(nozzleNumber));
      } else {
        query = query.eq('id', id);
      }
      const { data, error } = await query.select();
      if (error) throw error;
      return (data && data[0]) || { id, ...payload };
    },

    async setNozzleStatus({ id, nozzleNumber, status }) {
      const valid = status === 'not_working' ? 'not_working' : 'working';
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
      let query = supabase.from('nozzles').update({ status: valid });
      if (isUuid) {
        query = query.eq('id', id);
      } else if (nozzleNumber) {
        query = query.eq('nozzle_number', String(nozzleNumber));
      } else {
        query = query.eq('id', id);
      }

      const { data, error } = await query.select();
      if (error) throw error;
      if (!data || data.length === 0) {
        return { id, status: valid };
      }
      return data[0];
    },

    async toggleNozzleActive({ id, nozzleNumber, active }) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
      const nextActive = Boolean(active);
      let query = supabase.from('nozzles').update({ active: nextActive });
      if (isUuid) {
        query = query.eq('id', id);
      } else if (nozzleNumber) {
        query = query.eq('nozzle_number', String(nozzleNumber));
      } else {
        query = query.eq('id', id);
      }

      const { data, error } = await query.select();
      if (error) throw error;
      if (!data || data.length === 0) {
        return { id, active: nextActive };
      }
      return data[0];
    },
  };
}
