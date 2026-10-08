-- =====================================================================
-- FLOW OPS: Complete Database Reset (Empty All Tables)
-- Run in your Supabase SQL Editor.
-- This script safely empties all operational, master, and ledger tables,
-- handles foreign key hierarchies, temporarily bypasses immutability triggers,
-- resets all auto-increment identity counters to 1, and restores all guard triggers.
-- =====================================================================

DO $$
BEGIN
  -- -------------------------------------------------------------------
  -- 1. Temporarily drop application guard triggers
  -- -------------------------------------------------------------------
  -- In Supabase/PostgreSQL, custom triggers prevent deletion/truncation
  -- of audited tables (e.g. FLOW:LEDGER_IMMUTABLE, FLOW:SHIFT_CLOSED).
  -- We temporarily drop them to allow a clean reset without touching system triggers.
  DROP TRIGGER IF EXISTS fuel_transactions_immutable ON public.fuel_transactions;
  DROP TRIGGER IF EXISTS fuel_transactions_no_truncate ON public.fuel_transactions;
  DROP TRIGGER IF EXISTS dip_readings_immutable ON public.dip_readings;
  DROP TRIGGER IF EXISTS fuel_price_history_immutable ON public.fuel_price_history;
  DROP TRIGGER IF EXISTS shift_closings_guard_closed ON public.shift_closings;
  DROP TRIGGER IF EXISTS meter_readings_guard_closed ON public.meter_readings;
  DROP TRIGGER IF EXISTS tanks_guard_stock ON public.tanks;

  -- -------------------------------------------------------------------
  -- 2. Delete all records in strict child-to-parent dependency order
  -- -------------------------------------------------------------------

  -- A. Shift Meter Readings & Salary Payments (depend on shifts/employees)
  IF to_regclass('public.meter_readings') IS NOT NULL THEN
    DELETE FROM public.meter_readings;
  END IF;

  IF to_regclass('public.salary_payments') IS NOT NULL THEN
    DELETE FROM public.salary_payments;
  END IF;

  -- B. Fuel Transactions & Dip Readings (depend on tanks/nozzles/shifts)
  IF to_regclass('public.fuel_transactions') IS NOT NULL THEN
    DELETE FROM public.fuel_transactions;
    EXECUTE 'ALTER TABLE public.fuel_transactions ALTER COLUMN seq RESTART WITH 1';
  END IF;

  IF to_regclass('public.dip_readings') IS NOT NULL THEN
    DELETE FROM public.dip_readings;
    EXECUTE 'ALTER TABLE public.dip_readings ALTER COLUMN seq RESTART WITH 1';
  END IF;

  -- C. Fuel Price History & Price Schedules (depend on fuel_types)
  IF to_regclass('public.fuel_price_history') IS NOT NULL THEN
    DELETE FROM public.fuel_price_history;
    EXECUTE 'ALTER TABLE public.fuel_price_history ALTER COLUMN seq RESTART WITH 1';
  END IF;

  IF to_regclass('public.fuel_price_schedule') IS NOT NULL THEN
    DELETE FROM public.fuel_price_schedule;
  END IF;

  -- D. Operational Expenses & Other Non-Fuel Revenues
  IF to_regclass('public.expenses') IS NOT NULL THEN
    DELETE FROM public.expenses;
  END IF;

  IF to_regclass('public.other_income') IS NOT NULL THEN
    DELETE FROM public.other_income;
  END IF;

  -- E. Shift Closings (depend on shifts/profiles)
  IF to_regclass('public.shift_closings') IS NOT NULL THEN
    DELETE FROM public.shift_closings;
  END IF;

  -- F. Nozzles, Dispensing Machines & Tanks (depend on fuel_types)
  IF to_regclass('public.nozzles') IS NOT NULL THEN
    DELETE FROM public.nozzles;
  END IF;

  IF to_regclass('public.dispensing_machines') IS NOT NULL THEN
    DELETE FROM public.dispensing_machines;
  END IF;

  IF to_regclass('public.tanks') IS NOT NULL THEN
    DELETE FROM public.tanks;
  END IF;

  -- G. Employees (depend on shifts)
  IF to_regclass('public.employees') IS NOT NULL THEN
    DELETE FROM public.employees;
  END IF;

  -- H. Shifts Master & Fuel Types Master
  IF to_regclass('public.shifts') IS NOT NULL THEN
    DELETE FROM public.shifts;
  END IF;

  IF to_regclass('public.fuel_types') IS NOT NULL THEN
    DELETE FROM public.fuel_types;
  END IF;

  -- I. Station Profiles (linked to auth.users)
  -- Preserve or re-sync active profiles from auth.users so you are never locked out
  IF to_regclass('public.profiles') IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, role, active)
    SELECT 
      id,
      COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
      'owner',
      true
    FROM auth.users
    ON CONFLICT (id) DO UPDATE SET active = true, role = 'owner';
  END IF;

  -- -------------------------------------------------------------------
  -- 3. Re-create all application guard triggers & protections
  -- -------------------------------------------------------------------
  IF to_regclass('public.fuel_transactions') IS NOT NULL THEN
    CREATE TRIGGER fuel_transactions_immutable BEFORE UPDATE OR DELETE ON public.fuel_transactions
      FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_immutable();

    CREATE TRIGGER fuel_transactions_no_truncate BEFORE TRUNCATE ON public.fuel_transactions
      FOR EACH STATEMENT EXECUTE FUNCTION public.guard_ledger_immutable();
  END IF;

  IF to_regclass('public.dip_readings') IS NOT NULL THEN
    CREATE TRIGGER dip_readings_immutable BEFORE UPDATE OR DELETE ON public.dip_readings
      FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_immutable();
  END IF;

  IF to_regclass('public.fuel_price_history') IS NOT NULL THEN
    CREATE TRIGGER fuel_price_history_immutable BEFORE UPDATE OR DELETE ON public.fuel_price_history
      FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_immutable();
  END IF;

  IF to_regclass('public.shift_closings') IS NOT NULL THEN
    CREATE TRIGGER shift_closings_guard_closed BEFORE UPDATE OR DELETE ON public.shift_closings
      FOR EACH ROW EXECUTE FUNCTION public.guard_closed_shift();
  END IF;

  IF to_regclass('public.meter_readings') IS NOT NULL THEN
    CREATE TRIGGER meter_readings_guard_closed BEFORE UPDATE OR DELETE ON public.meter_readings
      FOR EACH ROW EXECUTE FUNCTION public.guard_closed_shift_readings();
  END IF;

  IF to_regclass('public.tanks') IS NOT NULL THEN
    CREATE TRIGGER tanks_guard_stock BEFORE UPDATE ON public.tanks
      FOR EACH ROW EXECUTE FUNCTION public.guard_tank_stock();
  END IF;

  RAISE NOTICE 'Flow Pump: All station database tables have been successfully emptied and reset.';
END $$;

-- ---------------------------------------------------------------------
-- 4. Verification Check: Count of remaining rows across all tables (all should be 0)
-- ---------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.fuel_types)          AS fuel_types_count,
  (SELECT count(*) FROM public.tanks)               AS tanks_count,
  (SELECT count(*) FROM public.nozzles)             AS nozzles_count,
  (SELECT count(*) FROM public.shifts)              AS shifts_count,
  (SELECT count(*) FROM public.shift_closings)      AS shift_closings_count,
  (SELECT count(*) FROM public.meter_readings)      AS meter_readings_count,
  (SELECT count(*) FROM public.fuel_transactions)   AS fuel_transactions_count,
  (SELECT count(*) FROM public.dip_readings)        AS dip_readings_count,
  (SELECT count(*) FROM public.fuel_price_history)  AS price_history_count,
  (SELECT count(*) FROM public.fuel_price_schedule) AS price_schedule_count,
  (SELECT count(*) FROM public.employees)           AS employees_count,
  (SELECT count(*) FROM public.salary_payments)     AS salary_payments_count,
  (SELECT count(*) FROM public.expenses)            AS expenses_count,
  (SELECT count(*) FROM public.other_income)        AS other_income_count,
  (SELECT count(*) FROM public.profiles)            AS profiles_count;
