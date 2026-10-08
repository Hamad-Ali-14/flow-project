-- =====================================================================
-- FLOW OPS: Complete Sample Data (2 MONTHS / 60 DAYS OF HISTORY)
-- Run AFTER database/schema.sql in your Supabase SQL Editor.
-- Best run on a fresh database: every section is guarded with
-- IF NOT EXISTS, so it skips tables that already hold data.
--
--  1. Fuel Types & Current Rates
--  2. Fuel Price History (4 fortnightly price changes over 60 days)
--  3. Scheduled Future Price Adjustments
--  4. Shift Templates (Day & Night)
--  5. Employee Staff Directory
--  6. Salary Payments (last 2 months)
--  7. Operational Expenses (60 days, incl. tanker purchases)
--  8. Other Non-Fuel Revenues (60 days)
--  9. Tanks, Calibrations, Nozzles
-- 10. 60 days x 2 shifts: closings, meter readings, ledger sales
-- 11. Tanker deliveries (auto-triggered when stock runs low)
-- 12. Daily dip readings + periodic stock adjustments
-- 13. Active live shift (Shift #1 today)
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS public.shift_closings_shift_number_key;

ALTER TABLE public.shift_closings
DROP CONSTRAINT IF EXISTS shift_closings_shift_number_key;

DROP INDEX IF EXISTS public.shift_closings_date_shift_key;

ALTER TABLE public.shift_closings
DROP CONSTRAINT IF EXISTS shift_closings_date_shift_key;

CREATE INDEX IF NOT EXISTS shift_closings_date_shift_idx ON public.shift_closings (business_date, shift_number);

DO $$
DECLARE
  c_days      CONSTANT INT := 60;               -- history length
  r           RECORD;
  v_emp       RECORD;
  v_fuel_hsd  UUID;
  v_fuel_pmg  UUID;
  v_fuel_hobc UUID;
  v_fuel_tmp  UUID;
  v_tank_id   UUID;
  v_day_shift UUID;
  v_night_shift UUID;
  v_closing   UUID;
  v_shift_id  UUID;

  -- simulation state (index 1..3 = tanks, 1..6 = nozzles)
  v_tanks   UUID[]    := ARRAY[NULL,NULL,NULL]::UUID[];
  v_noz     UUID[]    := ARRAY[NULL,NULL,NULL,NULL,NULL,NULL]::UUID[];
  v_stock   NUMERIC[] := ARRAY[0,0,0]::NUMERIC[];
  v_cap     NUMERIC[] := ARRAY[0,0,0]::NUMERIC[];
  v_cal     NUMERIC[] := ARRAY[1,1,1]::NUMERIC[];
  v_meter   NUMERIC[] := ARRAY[0,0,0,0,0,0]::NUMERIC[];
  v_litres  NUMERIC[] := ARRAY[0,0,0,0,0,0]::NUMERIC[];
  v_base    NUMERIC[] := ARRAY[1000,1000,1500,1500,1000,500]::NUMERIC[];
  v_tank_of INT[]     := ARRAY[1,1,2,2,3,3];
  v_thresh  NUMERIC[] := ARRAY[12000,16000,14000]::NUMERIC[];

  -- price tiers (index 1 = oldest ... 4 = current)
  v_p_hsd   NUMERIC[] := ARRAY[262.00,270.00,275.00,280.00]::NUMERIC[];
  v_p_pmg   NUMERIC[] := ARRAY[252.00,258.00,262.50,270.00]::NUMERIC[];

  ago INT; d DATE; s INT; i INT; t INT; m INT;
  v_tier INT; v_dow INT;
  v_rate NUMERIC; v_factor NUMERIC; v_sales NUMERIC; q NUMERIC; v_var NUMERIC;
  v_del_no INT := 8800;
  v_open_ts TIMESTAMPTZ; v_close_ts TIMESTAMPTZ;
  v_label TEXT; v_fuel_code TEXT;
  v_pay DATE;
BEGIN
  -- -------------------------------------------------------------------
  -- 1. Fuel Types & Pricing
  -- -------------------------------------------------------------------
  INSERT INTO public.fuel_types (code, name, current_rate, active) VALUES
    ('HSD',  'Diesel / HSD',     280.00, true),
    ('PMG',  'Petrol / PMG',     270.00, true),
    ('HOBC', 'High Octane / 97', 315.00, true)
  ON CONFLICT (code) DO UPDATE
    SET current_rate = EXCLUDED.current_rate, active = true;

  SELECT id INTO v_fuel_hsd  FROM public.fuel_types WHERE code = 'HSD';
  SELECT id INTO v_fuel_pmg  FROM public.fuel_types WHERE code = 'PMG';
  SELECT id INTO v_fuel_hobc FROM public.fuel_types WHERE code = 'HOBC';

  -- -------------------------------------------------------------------
  -- 2. Fuel Price History: 4 price points across the 60 days
  --    (60 -> 45 -> 30 -> 14 days ago), matches the shift-level rates below
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.fuel_price_history WHERE fuel_type_id = v_fuel_hsd) THEN
    INSERT INTO public.fuel_price_history (fuel_type_id, price, previous_price, effective_from, source) VALUES
      (v_fuel_hsd,  262.00, 258.00, now() - INTERVAL '60 days', 'INITIAL'),
      (v_fuel_hsd,  270.00, 262.00, now() - INTERVAL '45 days', 'INSTANT'),
      (v_fuel_hsd,  275.00, 270.00, now() - INTERVAL '30 days', 'INSTANT'),
      (v_fuel_hsd,  280.00, 275.00, now() - INTERVAL '14 days', 'INSTANT'),
      (v_fuel_pmg,  252.00, 248.00, now() - INTERVAL '60 days', 'INITIAL'),
      (v_fuel_pmg,  258.00, 252.00, now() - INTERVAL '45 days', 'INSTANT'),
      (v_fuel_pmg,  262.50, 258.00, now() - INTERVAL '30 days', 'INSTANT'),
      (v_fuel_pmg,  270.00, 262.50, now() - INTERVAL '14 days', 'INSTANT'),
      (v_fuel_hobc, 292.00, 288.00, now() - INTERVAL '60 days', 'INITIAL'),
      (v_fuel_hobc, 300.00, 292.00, now() - INTERVAL '45 days', 'INSTANT'),
      (v_fuel_hobc, 305.00, 300.00, now() - INTERVAL '30 days', 'INSTANT'),
      (v_fuel_hobc, 315.00, 305.00, now() - INTERVAL '14 days', 'INSTANT');
  END IF;

  -- -------------------------------------------------------------------
  -- 3. Scheduled Fuel Price Transition (pending, tomorrow)
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.fuel_price_schedule WHERE status = 'PENDING') THEN
    INSERT INTO public.fuel_price_schedule (fuel_type_id, new_price, effective_at, status) VALUES
      (v_fuel_pmg, 273.50, ((now() AT TIME ZONE 'Asia/Karachi')::date + 1)::timestamp AT TIME ZONE 'Asia/Karachi', 'PENDING');
  END IF;

  -- -------------------------------------------------------------------
  -- 4. Shift Templates
  -- -------------------------------------------------------------------
  INSERT INTO public.shifts (name, start_time, end_time, active)
  SELECT 'Shift 1 - Day', '07:00:00'::time, '19:00:00'::time, true
  WHERE NOT EXISTS (SELECT 1 FROM public.shifts WHERE name = 'Shift 1 - Day');

  INSERT INTO public.shifts (name, start_time, end_time, active)
  SELECT 'Shift 2 - Night', '19:00:00'::time, '07:00:00'::time, true
  WHERE NOT EXISTS (SELECT 1 FROM public.shifts WHERE name = 'Shift 2 - Night');

  SELECT id INTO v_day_shift   FROM public.shifts WHERE name = 'Shift 1 - Day'   LIMIT 1;
  SELECT id INTO v_night_shift FROM public.shifts WHERE name = 'Shift 2 - Night' LIMIT 1;

  -- -------------------------------------------------------------------
  -- 5. Staff Directory
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.employees LIMIT 1) THEN
    INSERT INTO public.employees (full_name, phone, identity_number, designation, shift_id, monthly_salary, active, joining_date) VALUES
      ('Imran Shah',    '0300-1234561', '42101-1234567-1', 'Pump attendant',    v_day_shift,   38000, true, current_date - 180),
      ('Hamza Raza',    '0300-1234562', '42101-1234567-2', 'Senior Cashier',    v_day_shift,   42000, true, current_date - 120),
      ('Fahad Iqbal',   '0300-1234563', '42101-1234567-3', 'Pump attendant',    v_night_shift, 40000, true, current_date - 90),
      ('Noman Tariq',   '0300-1234564', '42101-1234567-4', 'Pump attendant',    v_night_shift, 37000, true, current_date - 75),
      ('Bilal Ahmed',   '0300-1234565', '42101-1234567-5', 'Shift Supervisor',  v_day_shift,   55000, true, current_date - 240),
      ('Usman Ali',     '0300-1234566', '42101-1234567-6', 'Shift Supervisor',  v_night_shift, 55000, true, current_date - 210),
      ('Rizwan Ahmed',  '0300-1234567', '42101-1234567-7', 'Station Cleaner',   null,          30000, true, current_date - 300);
  END IF;

  -- -------------------------------------------------------------------
  -- 6. Salary Payments: last 2 full months
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.salary_payments LIMIT 1) THEN
    FOR m IN 1..2 LOOP
      v_pay := LEAST(
        (date_trunc('month', current_date - make_interval(months => m)) + INTERVAL '1 month' + INTERVAL '4 days')::date,
        current_date);
      FOR v_emp IN SELECT id, monthly_salary FROM public.employees LOOP
        INSERT INTO public.salary_payments (employee_id, salary_month, gross_salary, advance, deduction, overtime, paid_at)
        VALUES (
          v_emp.id,
          date_trunc('month', current_date - make_interval(months => m))::date,
          v_emp.monthly_salary,
          CASE WHEN random() < 0.25 THEN 5000 ELSE 0 END,
          CASE WHEN random() < 0.10 THEN 1500 ELSE 0 END,
          1500 + round(random() * 6) * 500,
          v_pay
        );
      END LOOP;
    END LOOP;
  END IF;

  -- -------------------------------------------------------------------
  -- 7. Operating Expenses (60 days; tanker purchases are added in step 10)
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.expenses LIMIT 1) THEN
    -- Electricity: two monthly bills
    INSERT INTO public.expenses (name, category, description, amount, payment_method, expense_date, approved)
    SELECT 'Station electricity bill (K-Elec)', 'Utilities',
           'Electricity and utility bill for pumps and lighting.',
           62000 + round(random() * 90) * 100, 'online', current_date - (4 + 30 * g), true
    FROM generate_series(0, 1) g;

    -- Security transit: weekly
    INSERT INTO public.expenses (name, category, description, amount, payment_method, expense_date, approved)
    SELECT 'Security transit service', 'Security',
           'Armoured cash collection and bank deposit transit.',
           35000, 'online', current_date - g, true
    FROM generate_series(5, c_days, 7) g;

    -- Generator diesel: every 10 days
    INSERT INTO public.expenses (name, category, description, amount, payment_method, expense_date, approved)
    SELECT 'Generator backup diesel', 'Utilities',
           'Fuel for on-site standby power generator.',
           38000 + round(random() * 80) * 100, 'cash', current_date - g, true
    FROM generate_series(2, c_days, 10) g;

    -- Cleaning supplies: every 2 weeks
    INSERT INTO public.expenses (name, category, description, amount, payment_method, expense_date, approved)
    SELECT 'Cleaning & sanitation supplies', 'Cleaning',
           'Floor degreaser, detergent, and station wash items.',
           7500 + round(random() * 20) * 100, 'cash', current_date - g, true
    FROM generate_series(3, c_days, 14) g;

    -- Staff refreshments: monthly
    INSERT INTO public.expenses (name, category, description, amount, payment_method, expense_date, approved)
    SELECT 'Staff refreshments & tea', 'Refreshments',
           'Mineral water cans and monthly staff tea service.',
           13000 + round(random() * 30) * 100, 'cash', current_date - g, true
    FROM generate_series(1, c_days, 30) g;

    -- Maintenance: twice
    INSERT INTO public.expenses (name, category, description, amount, payment_method, expense_date, approved) VALUES
      ('Equipment maintenance & nozzles', 'Maintenance', 'Preventive service for digital meters & nozzles.', 48000, 'cash', current_date - 2,  true),
      ('Dispenser hose & filter change',  'Maintenance', 'Quarterly hose and filter replacement.',          36500, 'cash', current_date - 33, true);

    -- Uniforms: twice
    INSERT INTO public.expenses (name, category, description, amount, payment_method, expense_date, approved) VALUES
      ('Station uniforms & safety gear', 'Operations', 'Reflective vest uniforms and safety gloves for staff.', 22000, 'cash', current_date - 6,  true),
      ('Fire extinguisher refill',       'Operations', 'Annual fire safety equipment refill and inspection.',   18500, 'cash', current_date - 47, true);
  END IF;

  -- -------------------------------------------------------------------
  -- 8. Other Non-Fuel Revenues (60 days)
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.other_income LIMIT 1) THEN
    -- Car wash: daily
    INSERT INTO public.other_income (source, category, amount, payment_method, income_date, notes)
    SELECT 'Vehicle wash service', 'Services',
           40000 + round(random() * 200) * 100, 'cash', current_date - g,
           'Customer automated and manual wash payments.'
    FROM generate_series(0, c_days) g;

    -- Tyre air & nitrogen: daily
    INSERT INTO public.other_income (source, category, amount, payment_method, income_date, notes)
    SELECT 'Tyre air & nitrogen service', 'Services',
           7000 + round(random() * 40) * 100, 'cash', current_date - g,
           'Digital tyre inflation service fees.'
    FROM generate_series(0, c_days) g;

    -- Lubricants: every 2 days
    INSERT INTO public.other_income (source, category, amount, payment_method, income_date, notes)
    SELECT 'Engine lubricants & coolant sales', 'Lubricants',
           45000 + round(random() * 300) * 100, 'cash', current_date - g,
           'Sale of synthetic engine oils and fluids.'
    FROM generate_series(1, c_days, 2) g;

    -- Interior vacuum: every 3 days
    INSERT INTO public.other_income (source, category, amount, payment_method, income_date, notes)
    SELECT 'Interior vacuum service', 'Services',
           14000 + round(random() * 90) * 100, 'cash', current_date - g,
           'Vehicle interior cleaning fees.'
    FROM generate_series(2, c_days, 3) g;

    -- Puncture repair commission: weekly
    INSERT INTO public.other_income (source, category, amount, payment_method, income_date, notes)
    SELECT 'Tyre puncture repair commission', 'Services',
           10000 + round(random() * 50) * 100, 'cash', current_date - g,
           'Station service booth operator commission.'
    FROM generate_series(3, c_days, 7) g;

    -- Mart lease rent: monthly
    INSERT INTO public.other_income (source, category, amount, payment_method, income_date, notes)
    SELECT 'Convenience mart lease rent', 'Lease', 125000, 'online', current_date - g,
           'Monthly commercial rent from mart tenant.'
    FROM generate_series(2, c_days, 30) g;
  END IF;

  -- -------------------------------------------------------------------
  -- 9. Tanks, Calibrations & Nozzles
  --    Opening balances / meters are as of the START of the 60-day window.
  -- -------------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      -- tank      fuel   capacity  L/mm    opening   nozzle_a meter_a    nozzle_b meter_b
      ('Tank 1', 'HSD', 45000::numeric, 24.5::numeric, 40000::numeric, '1', 20000::numeric, '2', 26500::numeric),
      ('Tank 2', 'PMG', 42750::numeric, 23.8::numeric, 38000::numeric, '3', 48000::numeric, '4', 95000::numeric),
      ('Tank 3', 'PMG', 42750::numeric, 23.8::numeric, 36000::numeric, '5', 52000::numeric, '6', 41000::numeric)
    ) AS v(tank_name, fuel_code, capacity, calibration, opening_stock, nozzle_a, meter_a, nozzle_b, meter_b)
  LOOP
    SELECT id INTO v_fuel_tmp FROM public.fuel_types WHERE code = r.fuel_code;

    IF NOT EXISTS (SELECT 1 FROM public.tanks WHERE lower(name) = lower(r.tank_name)) THEN
      INSERT INTO public.tanks (name, fuel_type_id, capacity_litres, current_stock_litres, calibration_litres_per_mm, active)
      VALUES (r.tank_name, v_fuel_tmp, r.capacity, 0, r.calibration, true)
      RETURNING id INTO v_tank_id;

      PERFORM public._apply_stock_movement(v_tank_id, 'OPENING_STOCK', r.opening_stock,
        NULL, NULL, 'OPENING', 'Opening balance (seed initialization)');

      INSERT INTO public.dip_readings (tank_id, dip_mm, remarks, recorded_at)
      VALUES (v_tank_id, round(r.opening_stock / r.calibration, 1), 'Initial physical dip measurement',
              ((current_date - c_days) + TIME '06:30') AT TIME ZONE 'Asia/Karachi');
    ELSE
      SELECT id INTO v_tank_id FROM public.tanks WHERE lower(name) = lower(r.tank_name);
    END IF;

    INSERT INTO public.dispensing_machines (machine_number, name, active, status)
    VALUES ('M' || regexp_replace(r.tank_name, '\D', '', 'g'), 'Dispenser ' || regexp_replace(r.tank_name, '\D', '', 'g'), true, 'working')
    ON CONFLICT (machine_number) DO UPDATE SET active = true, status = 'working';

    INSERT INTO public.nozzles (machine_number, nozzle_number, tank_id, current_meter_reading, active, status) VALUES
      ('M' || regexp_replace(r.tank_name, '\D', '', 'g'), r.nozzle_a, v_tank_id, r.meter_a, true, 'working'),
      ('M' || regexp_replace(r.tank_name, '\D', '', 'g'), r.nozzle_b, v_tank_id, r.meter_b, true, 'working')
    ON CONFLICT (machine_number, nozzle_number) DO UPDATE
      SET active = true, status = 'working';
  END LOOP;

  -- Load simulation state from the database
  FOR t IN 1..3 LOOP
    SELECT id, capacity_litres, calibration_litres_per_mm, current_stock_litres
      INTO v_tanks[t], v_cap[t], v_cal[t], v_stock[t]
      FROM public.tanks WHERE lower(name) = 'tank ' || t;
  END LOOP;

  FOR i IN 1..6 LOOP
    SELECT id, current_meter_reading INTO v_noz[i], v_meter[i]
      FROM public.nozzles WHERE nozzle_number = i::text;
  END LOOP;

  -- -------------------------------------------------------------------
  -- 10. 60 days x 2 shifts of history
  -- -------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.shift_closings WHERE status = 'closed') THEN

    FOR ago IN REVERSE c_days..1 LOOP
      d     := current_date - ago;
      v_dow := EXTRACT(DOW FROM d)::int;

      -- price tier for this date
      v_tier := CASE WHEN ago <= 14 THEN 4 WHEN ago <= 30 THEN 3 WHEN ago <= 45 THEN 2 ELSE 1 END;

      -- ---- Tanker deliveries when a tank is running low (before day's sales)
      FOR t IN 1..3 LOOP
        IF v_stock[t] < v_thresh[t] THEN
          q := LEAST(20000, floor((v_cap[t] * 0.90 - v_stock[t]) / 1000) * 1000);
          v_del_no := v_del_no + 1;
          v_fuel_code := CASE WHEN t = 1 THEN 'HSD' ELSE 'PMG' END;
          v_rate := CASE WHEN t = 1 THEN v_p_hsd[v_tier] ELSE v_p_pmg[v_tier] END;

          PERFORM public._apply_stock_movement(v_tanks[t], 'FUEL_RECEIVED', q, null, null,
            'DEL-' || v_fuel_code || '-' || v_del_no,
            'Replenishment tanker unload ' || q::bigint || ' L ' || v_fuel_code);
          v_stock[t] := v_stock[t] + q;

          INSERT INTO public.expenses (name, category, description, amount, payment_method, expense_date, approved)
          VALUES ('Fuel replenishment (' || v_fuel_code || ' Tanker)', 'Inventory',
                  'Bulk delivery of ' || q::bigint || ' L ' || v_fuel_code || ' (ref DEL-' || v_fuel_code || '-' || v_del_no || ').',
                  round(q * v_rate * 0.94), 'online', d, true);
        END IF;

        -- ---- Morning physical dip (consistent with ledger stock)
        INSERT INTO public.dip_readings (tank_id, dip_mm, remarks, recorded_at)
        VALUES (v_tanks[t],
                round(v_stock[t] / v_cal[t] + (random() - 0.5) * 2, 1),
                'Daily morning calibration dip',
                (d + TIME '06:45') AT TIME ZONE 'Asia/Karachi');
      END LOOP;

      -- ---- Occasional small stock adjustment (every 15 days)
      IF ago % 15 = 0 THEN
        t := ((ago / 15) % 3) + 1;
        q := CASE WHEN (ago / 15) % 2 = 0 THEN 40 ELSE -35 END;
        PERFORM public._apply_stock_movement(v_tanks[t], 'STOCK_ADJUSTMENT', q, null, null, null, null,
          'Calibration dip temperature volume calibration');
        v_stock[t] := v_stock[t] + q;
      END IF;

      -- ---- Two shifts per day
      FOR s IN 1..2 LOOP
        v_shift_id := CASE WHEN s = 1 THEN v_day_shift ELSE v_night_shift END;
        v_label    := CASE WHEN s = 1 THEN 'Day shift sales' ELSE 'Night shift sales' END;
        v_open_ts  := (d + CASE WHEN s = 1 THEN TIME '07:00' ELSE TIME '19:00' END) AT TIME ZONE 'Asia/Karachi';
        v_close_ts := (CASE WHEN s = 1 THEN d + TIME '19:00' ELSE d + 1 + TIME '07:00' END) AT TIME ZONE 'Asia/Karachi';

        -- weekend uplift, night slightly quieter
        v_factor := (CASE WHEN v_dow IN (0, 6) THEN 1.15 ELSE 1.0 END)
                  * (CASE WHEN s = 2 THEN 0.80 ELSE 1.0 END);

        -- compute litres + shift sales first
        v_sales := 0;
        FOR i IN 1..6 LOOP
          v_litres[i] := round(v_base[i] * v_factor * (0.85 + random() * 0.30) / 10) * 10;
          v_rate := CASE WHEN i <= 2 THEN v_p_hsd[v_tier] ELSE v_p_pmg[v_tier] END;
          v_sales := v_sales + v_litres[i] * v_rate;
        END LOOP;

        -- ~12% of shifts are a few hundred rupees short
        v_var := CASE WHEN random() < 0.12 THEN -(1 + floor(random() * 5)) * 100 ELSE 0 END;

        INSERT INTO public.shift_closings (
          shift_id, shift_number, business_date, opened_at, closed_at,
          opening_cash, closing_cash, expected_cash, status
        ) VALUES (
          v_shift_id, s, d, v_open_ts, v_close_ts,
          15000, 15000 + v_sales + v_var, 15000 + v_sales, 'closed'
        ) RETURNING id INTO v_closing;

        FOR i IN 1..6 LOOP
          v_rate := CASE WHEN i <= 2 THEN v_p_hsd[v_tier] ELSE v_p_pmg[v_tier] END;
          t := v_tank_of[i];

          INSERT INTO public.meter_readings (shift_closing_id, nozzle_id, previous_reading, current_reading, rate)
          VALUES (v_closing, v_noz[i], v_meter[i], v_meter[i] + v_litres[i], v_rate);

          PERFORM public._apply_stock_movement(v_tanks[t], 'NOZZLE_SALE', -v_litres[i], v_noz[i], v_closing,
            'Shift #' || s, v_label, null, null, null, v_rate, v_litres[i] * v_rate);

          v_meter[i] := v_meter[i] + v_litres[i];
          v_stock[t] := v_stock[t] - v_litres[i];
        END LOOP;
      END LOOP;
    END LOOP;

    -- Bring nozzle totalizers up to the final simulated readings
    FOR i IN 1..6 LOOP
      UPDATE public.nozzles SET current_meter_reading = v_meter[i] WHERE id = v_noz[i];
    END LOOP;
  END IF;

  -- -------------------------------------------------------------------
  -- 11. Ensure Station Has An Active Open Shift (Shift #1 today)
  -- -------------------------------------------------------------------
  PERFORM public._open_shift(null);

  RAISE NOTICE 'Flow Pump: % days of sample data inserted. Station is ready on Shift #1.', c_days;
END $$;