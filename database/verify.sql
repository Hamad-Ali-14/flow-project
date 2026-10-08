-- =====================================================================
-- FLOW OPS: Verification Audit Script
-- READ-ONLY: changes nothing. Paste into the Supabase SQL editor and run.
-- Every row says PASS or FAIL and, for FAIL, what to run to fix it.
-- =====================================================================
CREATE OR REPLACE FUNCTION pg_temp.flow_verify()
RETURNS TABLE (ord int, item text, status text, detail text)
LANGUAGE plpgsql AS $fn$
DECLARE
  n int := 0;
  r record;
  v bigint;
  v_text text;
  procedure_names text[] := array['get_tank_overview','receive_fuel','close_shift','open_shift',
                                  'adjust_stock','record_dip_reading','list_tank_transactions','list_dip_readings',
                                  'get_fuel_prices','set_fuel_price','cancel_scheduled_price','apply_due_prices','get_sales_summary'];
  tbl text;
  fn text;
BEGIN
  -- 1. Tables -----------------------------------------------------------
  FOREACH tbl IN ARRAY array['fuel_types','tanks','dispensing_machines','nozzles','profiles','shifts','shift_closings','meter_readings','fuel_transactions','dip_readings','expenses','other_income','employees','salary_payments','attendance','fuel_price_history','fuel_price_schedule'] LOOP
    n := n + 1; ord := n; item := 'table public.' || tbl;
    IF to_regclass('public.' || tbl) IS NOT NULL THEN status := 'PASS'; detail := '';
    ELSE status := 'FAIL'; detail := 'Run database/schema.sql'; END IF;
    RETURN NEXT;
  END LOOP;

  -- 2. Core RPC Functions ------------------------------------------------
  FOREACH fn IN ARRAY procedure_names LOOP
    n := n + 1; ord := n; item := 'function public.' || fn;
    SELECT p.oid INTO v FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public' AND p.proname = fn LIMIT 1;
    IF v IS NULL THEN status := 'FAIL'; detail := 'Run database/schema.sql';
    ELSE
      status := 'PASS';
      detail := 'signed-in: ' || has_function_privilege('authenticated', v::oid, 'execute')::text
                || '; anon: ' || has_function_privilege('anon', v::oid, 'execute')::text;
      IF NOT has_function_privilege('authenticated', v::oid, 'execute') THEN status := 'FAIL'; detail := 'authenticated role lacks EXECUTE: re-run database/schema.sql';
      ELSIF has_function_privilege('anon', v::oid, 'execute') THEN status := 'FAIL'; detail := 'anon can call this function: re-run database/schema.sql'; END IF;
    END IF;
    RETURN NEXT;
  END LOOP;

  -- 3. Data Integrity & Operational Records ------------------------------
  BEGIN
    SELECT count(*) FROM public.tanks INTO v;
    n := n + 1; ord := n; item := 'tanks configured'; status := CASE WHEN v > 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := v || ' tank(s)' || CASE WHEN v = 0 THEN '. Run database/inserts.sql' ELSE '' END; RETURN NEXT;

    SELECT count(*) FROM public.nozzles INTO v;
    n := n + 1; ord := n; item := 'nozzles configured'; status := CASE WHEN v > 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := v || ' nozzle(s)'; RETURN NEXT;

    SELECT count(*) FROM public.shift_closings WHERE status = 'open' INTO v;
    n := n + 1; ord := n; item := 'exactly one open shift'; status := CASE WHEN v = 1 THEN 'PASS' ELSE 'FAIL' END;
    detail := v || ' open shift(s)'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    n := n + 1; ord := n; item := 'data checks'; status := 'FAIL'; detail := 'skipped: ' || sqlerrm; RETURN NEXT;
  END;

  -- 4. Auth & Staff Profiles ---------------------------------------------
  BEGIN
    SELECT count(*) FROM auth.users INTO v;
    n := n + 1; ord := n; item := 'Supabase Auth users'; status := CASE WHEN v > 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := v || ' user(s)' || CASE WHEN v = 0 THEN '. Create one under Supabase Authentication > Users' ELSE '' END; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    SELECT count(*) FROM public.profiles WHERE active INTO v;
    n := n + 1; ord := n; item := 'active staff profiles'; status := CASE WHEN v > 0 THEN 'PASS' ELSE 'FAIL' END;
    detail := v || ' profile(s)' || CASE WHEN v = 0 THEN '. Run database/create_profile.sql' ELSE '' END; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN NULL; END;
END
$fn$;

SELECT item, status, detail FROM pg_temp.flow_verify() ORDER BY ord;
