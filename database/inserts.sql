-- =====================================================================
-- FLOW OPS: Complete Starter & Operational Sample Data Inserts
-- Run AFTER database/schema.sql in your Supabase SQL Editor.
-- This script is idempotent and populates complete sample data for:
--  1. Fuel Types & Current Rates
--  2. Fuel Price History & Price Trends
--  3. Scheduled Future Price Adjustments
--  4. Shift Templates (Day & Night)
--  5. Employee Staff Directory & Roles
--  6. Salary Payments & Payroll Disbursements
--  7. Operational Expenses Ledger (Multi-Category)
--  8. Other Non-Fuel Revenues (Car Wash, Mart, Lubricants)
--  9. Storage Tanks, Physical Capacities & Calibrations
-- 10. Dispenser Nozzles & Totalizer Meters
-- 11. Historical Shift Closings & Audited Meter Readings
-- 12. Fuel Inventory Ledger (Receipts, Sales, Adjustments)
-- 13. Physical Dip Measurement History
-- 14. Active Live Operational Shift (Shift #1)
-- ---------------------------------------------------------------------
-- Ensure shift uniqueness is per-date (Strict repeating 2-shift cycle)
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS public.shift_closings_shift_number_key;
ALTER TABLE public.shift_closings DROP CONSTRAINT IF EXISTS shift_closings_shift_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS shift_closings_date_shift_key ON public.shift_closings (business_date, shift_number);

DO $$
DECLARE
  r RECORD;
  v_fuel_hsd UUID;
  v_fuel_pmg UUID;
  v_fuel_hobc UUID;
  v_tank1 UUID;
  v_tank2 UUID;
  v_tank3 UUID;
  v_noz1 UUID;
  v_noz2 UUID;
  v_noz3 UUID;
  v_noz4 UUID;
  v_noz5 UUID;
  v_noz6 UUID;
  v_day_shift UUID;
  v_night_shift UUID;
  v_closed_shift_1 UUID;
  v_closed_shift_2 UUID;
  v_emp RECORD;
BEGIN
  -- -------------------------------------------------------------------
  -- 1. Fuel Types & Pricing
  -- -------------------------------------------------------------------
  INSERT INTO public.fuel_types (code, name, current_rate, active) VALUES
    ('HSD',  'Diesel / HSD',     280.00, true),
    ('PMG',  'Petrol / PMG',     270.00, true),
    ('HOBC', 'High Octane / 97', 315.00, true)
  ON CONFLICT (code) DO UPDATE
    SET current_rate = EXCLUDED.current_rate,
        active = true;

  SELECT id INTO v_fuel_hsd  FROM public.fuel_types WHERE code = 'HSD';
  SELECT id INTO v_fuel_pmg  FROM public.fuel_types WHERE code = 'PMG';
  SELECT id INTO v_fuel_hobc FROM public.fuel_types WHERE code = 'HOBC';

  -- -------------------------------------------------------------------
  -- 2. Fuel Price History (Baseline & Historical Price Changes)
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.fuel_price_history WHERE fuel_type_id = v_fuel_hsd) THEN
    INSERT INTO public.fuel_price_history (fuel_type_id, price, previous_price, effective_from, source) VALUES
      (v_fuel_hsd, 275.00, 270.00, now() - INTERVAL '30 days', 'INITIAL'),
      (v_fuel_hsd, 280.00, 275.00, now() - INTERVAL '14 days', 'INSTANT'),
      (v_fuel_pmg, 262.50, 258.00, now() - INTERVAL '30 days', 'INITIAL'),
      (v_fuel_pmg, 270.00, 262.50, now() - INTERVAL '14 days', 'INSTANT'),
      (v_fuel_hobc, 305.00, 300.00, now() - INTERVAL '30 days', 'INITIAL'),
      (v_fuel_hobc, 315.00, 305.00, now() - INTERVAL '14 days', 'INSTANT');
  END IF;

  -- -------------------------------------------------------------------
  -- 3. Scheduled Fuel Price Transitions (Pending Future Price Changes)
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.fuel_price_schedule WHERE status = 'PENDING') THEN
    INSERT INTO public.fuel_price_schedule (fuel_type_id, new_price, effective_at, status) VALUES
      (v_fuel_pmg, 273.50, ((now() AT TIME ZONE 'Asia/Karachi')::date + 1)::timestamp AT TIME ZONE 'Asia/Karachi', 'PENDING');
  END IF;

  -- -------------------------------------------------------------------
  -- 4. Shift Templates (Day & Night Operations)
  -- -------------------------------------------------------------------
  INSERT INTO public.shifts (name, start_time, end_time, active)
  SELECT 'Shift 1 - Day', '07:00:00'::time, '19:00:00'::time, true
  WHERE NOT EXISTS (SELECT 1 FROM public.shifts WHERE name = 'Shift 1 - Day');

  INSERT INTO public.shifts (name, start_time, end_time, active)
  SELECT 'Shift 2 - Night', '19:00:00'::time, '07:00:00'::time, true
  WHERE NOT EXISTS (SELECT 1 FROM public.shifts WHERE name = 'Shift 2 - Night');

  SELECT id INTO v_day_shift FROM public.shifts WHERE name = 'Shift 1 - Day' LIMIT 1;
  SELECT id INTO v_night_shift FROM public.shifts WHERE name = 'Shift 2 - Night' LIMIT 1;

  -- -------------------------------------------------------------------
  -- 5. Staff Directory & Employees
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.employees LIMIT 1) THEN
    INSERT INTO public.employees (full_name, phone, identity_number, designation, shift_id, monthly_salary, active, joining_date) VALUES
      ('Imran Shah',    '0300-1234561', '42101-1234567-1', 'Pump attendant',    v_day_shift,   38000, true, current_date - 180),
      ('Hamza Raza',    '0300-1234562', '42101-1234567-2', 'Senior Cashier',    v_day_shift,   42000, true, current_date - 120),
      ('Fahad Iqbal',   '0300-1234563', '42101-1234567-3', 'Pump attendant',    v_night_shift, 40000, true, current_date - 90),
      ('Noman Tariq',   '0300-1234564', '42101-1234567-4', 'Pump attendant',    v_night_shift, 37000, true, current_date - 60),
      ('Bilal Ahmed',   '0300-1234565', '42101-1234567-5', 'Shift Supervisor',  v_day_shift,   55000, true, current_date - 240),
      ('Usman Ali',     '0300-1234566', '42101-1234567-6', 'Shift Supervisor',  v_night_shift, 55000, true, current_date - 210),
      ('Rizwan Ahmed',  '0300-1234567', '42101-1234567-7', 'Station Cleaner',   null,          30000, true, current_date - 300);
  END IF;

  -- -------------------------------------------------------------------
  -- 6. Salary Payments (Payroll Disbursements)
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.salary_payments LIMIT 1) THEN
    FOR v_emp IN SELECT id, monthly_salary FROM public.employees LOOP
      INSERT INTO public.salary_payments (employee_id, salary_month, gross_salary, advance, deduction, overtime, paid_at) VALUES
        (v_emp.id, date_trunc('month', current_date - INTERVAL '1 month')::date, v_emp.monthly_salary, 0, 0, 2500, current_date - 5);
    END LOOP;
  END IF;

  -- -------------------------------------------------------------------
  -- 7. Operating Expenses Ledger (Multi-Category)
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.expenses LIMIT 1) THEN
    INSERT INTO public.expenses (name, category, description, amount, payment_method, expense_date, approved) VALUES
      ('Fuel replenishment (HSD Tanker)',  'Inventory',    'Bulk delivery of High Speed Diesel from supply depot.', 1450000, 'online', current_date - 1, true),
      ('Fuel replenishment (PMG Tanker)',  'Inventory',    'Bulk delivery of Premier Motor Gasoline (Petrol).',     980000,  'online', current_date - 3, true),
      ('Equipment maintenance & nozzles',  'Maintenance',  'Preventive service for digital meters & nozzles.',       48000,   'cash',   current_date - 2, true),
      ('Station electricity bill (K-Elec)','Utilities',    'Electricity and utility bill for pumps and lighting.',   68500,   'online', current_date - 4, true),
      ('Generator backup diesel',          'Utilities',    'Fuel for on-site standby power generator.',              42000,   'cash',   current_date - 2, true),
      ('Staff refreshments & tea',         'Refreshments', 'Mineral water cans and monthly staff tea service.',      14200,   'cash',   current_date - 1, true),
      ('Security transit service',         'Security',     'Armoured cash collection and bank deposit transit.',     35000,   'online', current_date - 5, true),
      ('Station uniforms & safety gear',   'Operations',   'Reflective vest uniforms and safety gloves for staff.',  22000,   'cash',   current_date - 6, true),
      ('Cleaning & sanitation supplies',   'Cleaning',     'Floor degreaser, detergent, and station wash items.',     8500,   'cash',   current_date - 3, true);
  END IF;

  -- -------------------------------------------------------------------
  -- 8. Other Non-Fuel Revenues (Car Wash, Mart, Lubricants)
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.other_income LIMIT 1) THEN
    INSERT INTO public.other_income (source, category, amount, payment_method, income_date, notes) VALUES
      ('Vehicle wash service',             'Services',    48500,  'cash',   current_date,     'Customer automated and manual wash payments.'),
      ('Tyre air & nitrogen service',      'Services',     9400,  'cash',   current_date,     'Digital tyre inflation service fees.'),
      ('Engine lubricants & coolant sales','Lubricants',  64200,  'cash',   current_date - 1, 'Sale of synthetic engine oils and fluids.'),
      ('Convenience mart lease rent',      'Lease',      125000,  'online', current_date - 2, 'Monthly commercial rent from mart tenant.'),
      ('Interior vacuum service',          'Services',    18600,  'cash',   current_date - 2, 'Vehicle interior cleaning fees.'),
      ('Tyre puncture repair commission',  'Services',    12000,  'cash',   current_date - 3, 'Station service booth operator commission.');
  END IF;

  -- -------------------------------------------------------------------
  -- 9. Tanks, Calibrations & Initial Stock
  -- -------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      -- tank       fuel   capacity  mm->L   opening  dip_mm  nozzle_a  meter_a    nozzle_b  meter_b
      ('Tank 1', 'HSD', 45000::numeric, 24.5::numeric, 28400::numeric, 1840::numeric, '1', 84500::numeric,  '2', 91250::numeric),
      ('Tank 2', 'PMG', 42750::numeric, 23.8::numeric, 24750::numeric, 1625::numeric, '3', 125000::numeric, '4', 210000::numeric),
      ('Tank 3', 'PMG', 42750::numeric, 23.8::numeric, 21900::numeric, 1438::numeric, '5', 133400::numeric, '6', 118900::numeric)
    ) AS v(tank_name, fuel_code, capacity, calibration, opening_stock, dip_mm, nozzle_a, meter_a, nozzle_b, meter_b)
  LOOP
    SELECT id INTO v_fuel_hsd FROM public.fuel_types WHERE code = r.fuel_code;

    -- Only insert tank if it doesn't already exist
    IF NOT EXISTS (SELECT 1 FROM public.tanks WHERE lower(name) = lower(r.tank_name)) THEN
      INSERT INTO public.tanks (name, fuel_type_id, capacity_litres, current_stock_litres, calibration_litres_per_mm, active)
      VALUES (r.tank_name, v_fuel_hsd, r.capacity, 0, r.calibration, true)
      RETURNING id INTO v_tank1;

      -- Apply initial opening stock through the audited inventory routine
      PERFORM public._apply_stock_movement(v_tank1, 'OPENING_STOCK', r.opening_stock,
        NULL, NULL, 'OPENING', 'Opening balance (seed initialization)');

      -- Record initial calibration dip reading
      INSERT INTO public.dip_readings (tank_id, dip_mm, remarks)
      VALUES (v_tank1, r.dip_mm, 'Initial physical dip measurement');
    ELSE
      SELECT id INTO v_tank1 FROM public.tanks WHERE lower(name) = lower(r.tank_name);
    END IF;

    -- Ensure dispensing machine exists
    INSERT INTO public.dispensing_machines (machine_number, name, active, status)
    VALUES ('M' || regexp_replace(r.tank_name, '\D', '', 'g'), 'Dispenser ' || regexp_replace(r.tank_name, '\D', '', 'g'), true, 'working')
    ON CONFLICT (machine_number) DO UPDATE SET active = true, status = 'working';

    -- Create nozzles with initial totalizer meter readings
    INSERT INTO public.nozzles (machine_number, nozzle_number, tank_id, current_meter_reading, active, status) VALUES
      ('M' || regexp_replace(r.tank_name, '\D', '', 'g'), r.nozzle_a, v_tank1, r.meter_a, true, 'working'),
      ('M' || regexp_replace(r.tank_name, '\D', '', 'g'), r.nozzle_b, v_tank1, r.meter_b, true, 'working')
    ON CONFLICT (machine_number, nozzle_number) DO UPDATE
      SET active = true, status = 'working';
  END LOOP;

  SELECT id INTO v_tank1 FROM public.tanks WHERE lower(name) = 'tank 1';
  SELECT id INTO v_tank2 FROM public.tanks WHERE lower(name) = 'tank 2';
  SELECT id INTO v_tank3 FROM public.tanks WHERE lower(name) = 'tank 3';

  SELECT id INTO v_noz1 FROM public.nozzles WHERE nozzle_number = '1';
  SELECT id INTO v_noz2 FROM public.nozzles WHERE nozzle_number = '2';
  SELECT id INTO v_noz3 FROM public.nozzles WHERE nozzle_number = '3';
  SELECT id INTO v_noz4 FROM public.nozzles WHERE nozzle_number = '4';
  SELECT id INTO v_noz5 FROM public.nozzles WHERE nozzle_number = '5';
  SELECT id INTO v_noz6 FROM public.nozzles WHERE nozzle_number = '6';

  -- -------------------------------------------------------------------
  -- 10. Historical Dip Readings (Physical Dip Calibration Audit Trail)
  -- -------------------------------------------------------------------
  IF (SELECT count(*) FROM public.dip_readings) <= 3 THEN
    INSERT INTO public.dip_readings (tank_id, dip_mm, remarks, recorded_at) VALUES
      (v_tank1, 1835.0, 'Daily morning calibration dip', now() - INTERVAL '1 day'),
      (v_tank2, 1618.0, 'Daily morning calibration dip', now() - INTERVAL '1 day'),
      (v_tank3, 1432.0, 'Daily morning calibration dip', now() - INTERVAL '1 day'),
      (v_tank1, 1840.0, 'Routine physical dip audit',    now() - INTERVAL '2 days'),
      (v_tank2, 1625.0, 'Routine physical dip audit',    now() - INTERVAL '2 days'),
      (v_tank3, 1438.0, 'Routine physical dip audit',    now() - INTERVAL '2 days');
  END IF;

  -- -------------------------------------------------------------------
  -- 11. Historical Shift Closings & Audited Meter Readings
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.shift_closings WHERE status = 'closed') THEN
    -- A. Yesterday Day Shift (Shift #1, closed)
    INSERT INTO public.shift_closings (
      shift_id, shift_number, business_date, opened_at, closed_at,
      opening_cash, closing_cash, expected_cash, status
    ) VALUES (
      v_day_shift, 1, current_date - 1,
      (current_date - 1 + '07:00:00'::time)::timestamptz,
      (current_date - 1 + '19:00:00'::time)::timestamptz,
      15000, 1845000, 1845000, 'closed'
    ) RETURNING id INTO v_closed_shift_1;

    -- Meter readings for yesterday Day Shift (all 6 nozzles)
    INSERT INTO public.meter_readings (shift_closing_id, nozzle_id, previous_reading, current_reading, rate) VALUES
      (v_closed_shift_1, v_noz1, 82500, 83500, 280.00), -- 1000 L HSD
      (v_closed_shift_1, v_noz2, 89250, 90250, 280.00), -- 1000 L HSD
      (v_closed_shift_1, v_noz3, 122000, 123500, 270.00),-- 1500 L PMG
      (v_closed_shift_1, v_noz4, 207000, 208500, 270.00),-- 1500 L PMG
      (v_closed_shift_1, v_noz5, 131400, 132400, 270.00),-- 1000 L PMG
      (v_closed_shift_1, v_noz6, 117900, 118400, 270.00);-- 500 L PMG

    -- Corresponding ledger transactions for yesterday Day Shift
    PERFORM public._apply_stock_movement(v_tank1, 'NOZZLE_SALE', -1000, v_noz1, v_closed_shift_1, 'Shift #1', 'Day shift sales', null, null, null, 280.00, 280000.00);
    PERFORM public._apply_stock_movement(v_tank1, 'NOZZLE_SALE', -1000, v_noz2, v_closed_shift_1, 'Shift #1', 'Day shift sales', null, null, null, 280.00, 280000.00);
    PERFORM public._apply_stock_movement(v_tank2, 'NOZZLE_SALE', -1500, v_noz3, v_closed_shift_1, 'Shift #1', 'Day shift sales', null, null, null, 270.00, 405000.00);
    PERFORM public._apply_stock_movement(v_tank2, 'NOZZLE_SALE', -1500, v_noz4, v_closed_shift_1, 'Shift #1', 'Day shift sales', null, null, null, 270.00, 405000.00);
    PERFORM public._apply_stock_movement(v_tank3, 'NOZZLE_SALE', -1000, v_noz5, v_closed_shift_1, 'Shift #1', 'Day shift sales', null, null, null, 270.00, 270000.00);
    PERFORM public._apply_stock_movement(v_tank3, 'NOZZLE_SALE', -500,  v_noz6, v_closed_shift_1, 'Shift #1', 'Day shift sales', null, null, null, 270.00, 135000.00);

    -- B. Yesterday Night Shift (Shift #2, closed)
    INSERT INTO public.shift_closings (
      shift_id, shift_number, business_date, opened_at, closed_at,
      opening_cash, closing_cash, expected_cash, status
    ) VALUES (
      v_night_shift, 2, current_date - 1,
      (current_date - 1 + '19:00:00'::time)::timestamptz,
      (current_date + '07:00:00'::time)::timestamptz,
      15000, 1070000, 1070000, 'closed'
    ) RETURNING id INTO v_closed_shift_2;

    -- Meter readings for yesterday Night Shift
    INSERT INTO public.meter_readings (shift_closing_id, nozzle_id, previous_reading, current_reading, rate) VALUES
      (v_closed_shift_2, v_noz1, 83500, 84500, 280.00), -- 1000 L HSD
      (v_closed_shift_2, v_noz2, 90250, 91250, 280.00), -- 1000 L HSD
      (v_closed_shift_2, v_noz3, 123500, 125000, 270.00),-- 1500 L PMG
      (v_closed_shift_2, v_noz4, 208500, 210000, 270.00),-- 1500 L PMG
      (v_closed_shift_2, v_noz5, 132400, 133400, 270.00),-- 1000 L PMG
      (v_closed_shift_2, v_noz6, 118400, 118900, 270.00);-- 500 L PMG

    -- Corresponding ledger transactions for yesterday Night Shift
    PERFORM public._apply_stock_movement(v_tank1, 'NOZZLE_SALE', -1000, v_noz1, v_closed_shift_2, 'Shift #2', 'Night shift sales', null, null, null, 280.00, 280000.00);
    PERFORM public._apply_stock_movement(v_tank1, 'NOZZLE_SALE', -1000, v_noz2, v_closed_shift_2, 'Shift #2', 'Night shift sales', null, null, null, 280.00, 280000.00);
    PERFORM public._apply_stock_movement(v_tank2, 'NOZZLE_SALE', -1500, v_noz3, v_closed_shift_2, 'Shift #2', 'Night shift sales', null, null, null, 270.00, 405000.00);
    PERFORM public._apply_stock_movement(v_tank2, 'NOZZLE_SALE', -1500, v_noz4, v_closed_shift_2, 'Shift #2', 'Night shift sales', null, null, null, 270.00, 405000.00);
    PERFORM public._apply_stock_movement(v_tank3, 'NOZZLE_SALE', -1000, v_noz5, v_closed_shift_2, 'Shift #2', 'Night shift sales', null, null, null, 270.00, 270000.00);
    PERFORM public._apply_stock_movement(v_tank3, 'NOZZLE_SALE', -500,  v_noz6, v_closed_shift_2, 'Shift #2', 'Night shift sales', null, null, null, 270.00, 135000.00);

    -- C. Fuel Replenishment Tanker Delivery (FUEL_RECEIVED)
    PERFORM public._apply_stock_movement(v_tank1, 'FUEL_RECEIVED', 5000, null, null, 'DEL-HSD-8812', 'Replenishment tanker unload 5,000 L HSD');
    PERFORM public._apply_stock_movement(v_tank2, 'FUEL_RECEIVED', 5000, null, null, 'DEL-PMG-8813', 'Replenishment tanker unload 5,000 L PMG');

    -- D. Stock Adjustment Audit Record
    PERFORM public._apply_stock_movement(v_tank1, 'STOCK_ADJUSTMENT', 50, null, null, null, null, 'Calibration dip temperature volume calibration');
  END IF;

  -- -------------------------------------------------------------------
  -- 12. Ensure Station Has An Active Open Shift (Shift #1)
  -- -------------------------------------------------------------------
  PERFORM public._open_shift(null);

  RAISE NOTICE 'Flow Pump: Complete sample data inserted across all 15 operational tables. Station is ready on Shift #1.';
END $$;
