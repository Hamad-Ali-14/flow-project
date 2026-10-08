-- =====================================================================
-- FLOW OPS: Module 2 Database Migration
-- Dynamic Dispensing Machines, Nozzles Management & Shift Closing Rule
-- =====================================================================

-- 1. Create Dispensing Machines table
CREATE TABLE IF NOT EXISTS public.dispensing_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_number text NOT NULL UNIQUE,
  name text,
  active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'working',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT dispensing_machines_status_check CHECK (status IN ('working', 'not_working'))
);

-- 2. Add status column to public.nozzles
ALTER TABLE public.nozzles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'working';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nozzles_status_check'
  ) THEN
    ALTER TABLE public.nozzles
      ADD CONSTRAINT nozzles_status_check CHECK (status IN ('working', 'not_working'));
  END IF;
END $$;

-- 3. Backfill dispensing_machines from existing nozzles
INSERT INTO public.dispensing_machines (machine_number, name, active, status)
SELECT DISTINCT machine_number, 'Dispenser ' || machine_number, true, 'working'
FROM public.nozzles
ON CONFLICT (machine_number) DO NOTHING;

-- If no machines exist yet, seed standard dispensers
INSERT INTO public.dispensing_machines (machine_number, name, active, status)
VALUES
  ('M1', 'Dispenser 1 (Diesel)', true, 'working'),
  ('M2', 'Dispenser 2 (Petrol)', true, 'working'),
  ('M3', 'Dispenser 3 (Petrol)', true, 'working')
ON CONFLICT (machine_number) DO NOTHING;

-- 4. Enable RLS and setup policies
ALTER TABLE public.dispensing_machines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispensing_machines_select" ON public.dispensing_machines;
CREATE POLICY "dispensing_machines_select"
  ON public.dispensing_machines FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "dispensing_machines_insert" ON public.dispensing_machines;
CREATE POLICY "dispensing_machines_insert"
  ON public.dispensing_machines FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "dispensing_machines_update" ON public.dispensing_machines;
CREATE POLICY "dispensing_machines_update"
  ON public.dispensing_machines FOR UPDATE
  TO authenticated USING (true);

-- Also allow anon read if demo / unauthenticated access is allowed in environment
DROP POLICY IF EXISTS "dispensing_machines_anon_select" ON public.dispensing_machines;
CREATE POLICY "dispensing_machines_anon_select"
  ON public.dispensing_machines FOR SELECT
  TO anon USING (true);

-- 5. Update get_tank_overview to return machines & nozzle status
CREATE OR REPLACE FUNCTION public.get_tank_overview() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_money boolean;
  v_now timestamptz := now();
  v_pkt timestamptz := v_now AT TIME ZONE 'Asia/Karachi';
  v_day date := v_pkt::date;
  v_from timestamptz := (v_day::text || ' 00:00:00+05')::timestamptz;
  v_to timestamptz := v_from + INTERVAL '1 day';
BEGIN
  PERFORM public._apply_due_prices();
  v_money := public.inventory_can('view_sales');
  RETURN jsonb_build_object(
    'viewer', (SELECT jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.role::text)
               FROM public.profiles p WHERE p.id = v_user),
    'permissions', (SELECT jsonb_object_agg(a, public.inventory_can(a)) FROM unnest(array[
      'view_tanks','receive_fuel','close_shift','update_dip','stock_adjustment','view_history','enter_readings','view_sales','manage_prices']) a),
    'business_date', v_day,
    'open_shift', (SELECT jsonb_build_object('id', s.id, 'shift_number', s.shift_number, 'opened_at', s.opened_at)
                   FROM public.shift_closings s WHERE s.status = 'open'),
    'machines', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'machine_number', m.machine_number, 'name', m.name,
        'active', m.active, 'status', m.status, 'created_at', m.created_at
      ) ORDER BY nullif(regexp_replace(m.machine_number, '\D', '', 'g'), '')::int NULLS LAST, m.machine_number)
      FROM public.dispensing_machines m
    ), '[]'::jsonb),
    'tanks', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'active', t.active,
        'fuel_code', f.code, 'fuel_name', f.name,
        'capacity', t.capacity_litres, 'current_stock', t.current_stock_litres,
        'unit_price', CASE WHEN v_money THEN f.current_rate END,
        'today_revenue', CASE WHEN v_money THEN coalesce((SELECT sum(x.sale_amount) FROM public.fuel_transactions x
                WHERE x.tank_id = t.id AND x.transaction_type = 'NOZZLE_SALE'
                  AND x.created_at >= v_from AND x.created_at < v_to), 0) END,
        'calibration_litres_per_mm', t.calibration_litres_per_mm,
        'dip', (SELECT jsonb_build_object('dip_mm', d.dip_mm, 'recorded_at', d.recorded_at)
                FROM public.dip_readings d WHERE d.tank_id = t.id ORDER BY d.seq DESC LIMIT 1),
        'today_dispensed', coalesce((SELECT -sum(x.quantity_litres) FROM public.fuel_transactions x
                WHERE x.tank_id = t.id AND x.transaction_type = 'NOZZLE_SALE'
                  AND x.created_at >= v_from AND x.created_at < v_to), 0),
        'nozzles', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', n.id, 'nozzle_number', n.nozzle_number, 'machine_number', n.machine_number,
            'active', n.active, 'status', coalesce(n.status, 'working'),
            'current_meter', n.current_meter_reading,
            'today_revenue', CASE WHEN v_money THEN coalesce((SELECT sum(x.sale_amount) FROM public.fuel_transactions x
                WHERE x.nozzle_id = n.id AND x.transaction_type = 'NOZZLE_SALE'
                  AND x.created_at >= v_from AND x.created_at < v_to), 0) END,
            'today_dispensed', coalesce((SELECT -sum(x.quantity_litres) FROM public.fuel_transactions x
                WHERE x.nozzle_id = n.id AND x.transaction_type = 'NOZZLE_SALE'
                  AND x.created_at >= v_from AND x.created_at < v_to), 0))
            ORDER BY nullif(regexp_replace(n.nozzle_number, '\D', '', 'g'), '')::int NULLS LAST, n.nozzle_number)
          FROM public.nozzles n WHERE n.tank_id = t.id), '[]'::jsonb)
      ) ORDER BY t.name)
      FROM public.tanks t JOIN public.fuel_types f ON f.id = t.fuel_type_id), '[]'::jsonb)
  );
END $$;

-- 6. Update close_shift to only require nozzles where active = true AND status = 'working'
CREATE OR REPLACE FUNCTION public.close_shift(p_shift_id uuid, p_readings jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public._inventory_require('close_shift');
  v_shift public.shift_closings;
  v_next public.shift_closings;
  v_calc jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_row record;
  v_total numeric := 0;
  v_rate numeric;
  v_tx public.fuel_transactions;
  v_ref text;
  v_dispensed numeric;
  v_revenue numeric := 0;
  v_amount numeric;
BEGIN
  PERFORM public._apply_due_prices();

  IF p_readings IS NULL OR jsonb_typeof(p_readings) <> 'array' OR jsonb_array_length(p_readings) = 0 THEN
    PERFORM public.flow_error('INVALID_READINGS');
  END IF;

  SELECT * INTO v_shift FROM public.shift_closings WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.flow_error('SHIFT_NOT_FOUND'); END IF;
  IF v_shift.status <> 'open' THEN
    PERFORM public.flow_error('SHIFT_CLOSED', jsonb_build_object('shift_number', v_shift.shift_number));
  END IF;
  v_ref := 'Shift #' || coalesce(v_shift.shift_number::text, '?');

  PERFORM 1 FROM public.tanks t WHERE t.id IN (SELECT n.tank_id FROM public.nozzles n WHERE n.active) ORDER BY t.id FOR UPDATE;
  PERFORM 1 FROM public.nozzles n WHERE n.active ORDER BY n.id FOR UPDATE;

  BEGIN
    PERFORM 1 FROM jsonb_to_recordset(p_readings) AS x(nozzle_id uuid, closing_meter numeric, expected_opening_meter numeric);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.flow_error('INVALID_READINGS');
  END;

  IF (SELECT count(*) FROM jsonb_to_recordset(p_readings) AS x(nozzle_id uuid))
     <> (SELECT count(distinct x.nozzle_id) FROM jsonb_to_recordset(p_readings) AS x(nozzle_id uuid)) THEN
    PERFORM public.flow_error('INVALID_READINGS', jsonb_build_object('reason', 'duplicate nozzle'));
  END IF;

  FOR v_row IN
    SELECT x.nozzle_id FROM jsonb_to_recordset(p_readings) AS x(nozzle_id uuid)
    LEFT JOIN public.nozzles n ON n.id = x.nozzle_id AND n.active
    WHERE n.id IS NULL
  LOOP
    PERFORM public.flow_error('INVALID_NOZZLE', jsonb_build_object('nozzle_id', v_row.nozzle_id));
  END LOOP;

  -- Only nozzles that are BOTH active AND status = 'working' require readings
  FOR v_row IN
    SELECT n.nozzle_number FROM public.nozzles n
    WHERE n.active AND coalesce(n.status, 'working') = 'working' AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_readings) AS x(nozzle_id uuid) WHERE x.nozzle_id = n.id)
    ORDER BY nullif(regexp_replace(n.nozzle_number, '\D', '', 'g'), '')::int NULLS LAST LIMIT 1
  LOOP
    PERFORM public.flow_error('MISSING_READING', jsonb_build_object('nozzle_number', v_row.nozzle_number));
  END LOOP;

  -- Validate readings and calculate totals
  FOR v_row IN
    SELECT n.id as nozzle_id, n.nozzle_number, n.tank_id, n.current_meter_reading as opening,
           t.active as tank_active, t.name as tank_name, x.closing_meter, x.expected_opening_meter,
           ft.current_rate as unit_price, ft.name as fuel_name
    FROM public.nozzles n
    JOIN public.tanks t ON t.id = n.tank_id
    JOIN public.fuel_types ft ON ft.id = t.fuel_type_id
    JOIN jsonb_to_recordset(p_readings) as x(nozzle_id uuid, closing_meter numeric, expected_opening_meter numeric)
      ON x.nozzle_id = n.id
    WHERE n.active
    ORDER BY n.tank_id, nullif(regexp_replace(n.nozzle_number, '\D', '', 'g'), '')::int NULLS LAST, n.nozzle_number
  LOOP
    IF NOT v_row.tank_active THEN
      PERFORM public.flow_error('TANK_INACTIVE', jsonb_build_object('tank_name', v_row.tank_name));
    END IF;
    IF v_row.closing_meter IS NULL THEN
      PERFORM public.flow_error('MISSING_READING', jsonb_build_object('nozzle_number', v_row.nozzle_number));
    END IF;
    IF v_row.closing_meter < 0 OR v_row.closing_meter <> round(v_row.closing_meter, 2) THEN
      PERFORM public.flow_error('INVALID_METER', jsonb_build_object('nozzle_number', v_row.nozzle_number,
        'opening', v_row.opening, 'closing', v_row.closing_meter));
    END IF;
    IF v_row.closing_meter < v_row.opening THEN
      PERFORM public.flow_error('METER_REGRESSED', jsonb_build_object('nozzle_number', v_row.nozzle_number,
        'opening', v_row.opening, 'closing', v_row.closing_meter));
    END IF;
    IF v_row.expected_opening_meter IS NOT NULL AND v_row.expected_opening_meter <> v_row.opening THEN
      PERFORM public.flow_error('STALE_DATA', jsonb_build_object('nozzle_number', v_row.nozzle_number));
    END IF;

    v_dispensed := round(v_row.closing_meter - v_row.opening, 2);
    IF v_dispensed > 0 AND (v_row.unit_price IS NULL OR v_row.unit_price <= 0) THEN
      PERFORM public.flow_error('PRICE_NOT_SET', jsonb_build_object('fuel_name', v_row.fuel_name));
    END IF;
    v_rate := coalesce(v_row.unit_price, 0);
    v_amount := round(v_dispensed * v_rate, 2);

    v_calc := v_calc || jsonb_build_object(
      'nozzle_id', v_row.nozzle_id, 'tank_id', v_row.tank_id,
      'opening', v_row.opening, 'closing', v_row.closing_meter,
      'dispensed', v_dispensed, 'rate', v_rate, 'amount', v_amount
    );
  END LOOP;

  -- Validate sufficient stock in each tank
  FOR v_row IN
    SELECT t.id, t.name, t.current_stock_litres, coalesce(sum((c->>'dispensed')::numeric), 0) as need
    FROM public.tanks t
    LEFT JOIN jsonb_array_elements(v_calc) c ON (c->>'tank_id')::uuid = t.id
    WHERE t.id IN (SELECT DISTINCT (c2->>'tank_id')::uuid FROM jsonb_array_elements(v_calc) c2)
    GROUP BY t.id, t.name, t.current_stock_litres
  LOOP
    IF v_row.need > v_row.current_stock_litres THEN
      PERFORM public.flow_error('INSUFFICIENT_STOCK', jsonb_build_object(
        'tank_name', v_row.name, 'available', v_row.current_stock_litres, 'requested', v_row.need));
    END IF;
  END LOOP;

  -- Persist meter readings and nozzle transactions
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_calc)
  LOOP
    v_dispensed := (v_row.value->>'dispensed')::numeric;
    v_rate := (v_row.value->>'rate')::numeric;
    v_amount := (v_row.value->>'amount')::numeric;

    INSERT INTO public.meter_readings (shift_closing_id, nozzle_id, previous_reading, current_reading, rate)
    VALUES (v_shift.id, (v_row.value->>'nozzle_id')::uuid, (v_row.value->>'opening')::numeric,
            (v_row.value->>'closing')::numeric, v_rate);

    UPDATE public.nozzles
    SET current_meter_reading = (v_row.value->>'closing')::numeric
    WHERE id = (v_row.value->>'nozzle_id')::uuid;

    IF v_dispensed > 0 THEN
      v_tx := public._apply_stock_movement(
        (v_row.value->>'tank_id')::uuid, 'NOZZLE_SALE', -v_dispensed,
        (v_row.value->>'nozzle_id')::uuid, v_shift.shift_number,
        v_ref, null, v_rate, v_amount, v_user);
    END IF;

    v_total := v_total + v_dispensed;
    v_revenue := v_revenue + v_amount;
  END LOOP;

  UPDATE public.shift_closings
  SET status = 'closed', closed_at = now(), closed_by = v_user
  WHERE id = v_shift.id;

  v_next := public._open_shift(v_user);

  RETURN jsonb_build_object(
    'shift_number', v_shift.shift_number,
    'total_dispensed', v_total,
    'total_revenue', v_revenue,
    'next_shift', jsonb_build_object('id', v_next.id, 'shift_number', v_next.shift_number, 'opened_at', v_next.opened_at)
  );
END $$;
