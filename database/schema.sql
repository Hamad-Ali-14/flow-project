-- =====================================================================
-- FLOW OPS: Complete Consolidated Database Schema
-- Single source of truth containing all tables, constraints, indexes,
-- RLS policies, triggers, and RPC stored procedures.
-- Run in Supabase SQL Editor.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Custom Enums
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'manager', 'supervisor', 'attendant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ensure all enum roles exist if the type was created with fewer values previously
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'attendant';

DO $$ BEGIN
  CREATE TYPE public.shift_status AS ENUM ('open', 'closed', 'review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'online', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 2. Core Tables
-- ---------------------------------------------------------------------

-- Profiles (staff members linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'manager',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Shift Templates (e.g. Day Shift, Night Shift definition)
CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  manager_id uuid REFERENCES public.profiles(id),
  active boolean NOT NULL DEFAULT true
);

-- Fuel Types (HSD, PMG, etc.)
CREATE TABLE IF NOT EXISTS public.fuel_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  current_rate numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

-- Tanks (storage tanks with physical calibration & capacity)
CREATE TABLE IF NOT EXISTS public.tanks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  fuel_type_id uuid NOT NULL REFERENCES public.fuel_types(id),
  capacity_litres numeric(12,2) NOT NULL,
  current_stock_litres numeric(12,2) NOT NULL DEFAULT 0,
  calibration_litres_per_mm numeric(10,3),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tanks_capacity_positive CHECK (capacity_litres > 0),
  CONSTRAINT tanks_stock_non_negative CHECK (current_stock_litres >= 0),
  CONSTRAINT tanks_stock_within_capacity CHECK (current_stock_litres <= capacity_litres),
  CONSTRAINT tanks_calibration_positive CHECK (calibration_litres_per_mm IS NULL OR calibration_litres_per_mm > 0)
);

-- Dispensing Machines (pump dispensers)
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

-- Nozzles (dispenser nozzles connected to tanks)
CREATE TABLE IF NOT EXISTS public.nozzles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_number text NOT NULL,
  nozzle_number text NOT NULL,
  tank_id uuid NOT NULL REFERENCES public.tanks(id),
  current_meter_reading numeric(14,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'working',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(machine_number, nozzle_number),
  CONSTRAINT nozzles_meter_non_negative CHECK (current_meter_reading >= 0),
  CONSTRAINT nozzles_status_check CHECK (status IN ('working', 'not_working'))
);

-- Shift Closings (operational shift instances)
CREATE TABLE IF NOT EXISTS public.shift_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid REFERENCES public.shifts(id),
  shift_number bigint,
  business_date date NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by uuid REFERENCES public.profiles(id),
  closed_at timestamptz,
  opening_cash numeric(14,2) NOT NULL DEFAULT 0,
  closing_cash numeric(14,2) NOT NULL DEFAULT 0,
  expected_cash numeric(14,2) NOT NULL DEFAULT 0,
  cash_difference numeric(14,2) GENERATED ALWAYS AS (closing_cash - expected_cash) STORED,
  status public.shift_status NOT NULL DEFAULT 'open',
  closed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Meter Readings (dispenser totalizer readings recorded at shift closing)
CREATE TABLE IF NOT EXISTS public.meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_closing_id uuid NOT NULL REFERENCES public.shift_closings(id) ON DELETE CASCADE,
  nozzle_id uuid NOT NULL REFERENCES public.nozzles(id),
  previous_reading numeric(14,2) NOT NULL,
  current_reading numeric(14,2) NOT NULL,
  sold_litres numeric(14,2) GENERATED ALWAYS AS (current_reading - previous_reading) STORED,
  rate numeric(12,2) NOT NULL,
  sale_amount numeric(14,2) GENERATED ALWAYS AS ((current_reading - previous_reading) * rate) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (current_reading >= previous_reading)
);

-- ---------------------------------------------------------------------
-- Backward-compatible table migrations (safe if tables pre-existed)
-- ---------------------------------------------------------------------
ALTER TABLE public.tanks
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS calibration_litres_per_mm numeric(10,3),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.nozzles
  ADD COLUMN IF NOT EXISTS current_meter_reading numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'working',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nozzles_status_check'
  ) THEN
    ALTER TABLE public.nozzles
      ADD CONSTRAINT nozzles_status_check CHECK (status IN ('working', 'not_working'));
  END IF;
END $$;

ALTER TABLE public.shift_closings ALTER COLUMN shift_id DROP NOT NULL;
ALTER TABLE public.shift_closings
  ADD COLUMN IF NOT EXISTS shift_number bigint,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS opened_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expected_cash numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_cash numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status public.shift_status NOT NULL DEFAULT 'open';

ALTER TABLE public.meter_readings
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Ensure at most one shift is open before enforcing partial unique index
UPDATE public.shift_closings
   SET status = 'closed', closed_at = now()
 WHERE status = 'open'
   AND id NOT IN (
     SELECT id FROM public.shift_closings
      WHERE status = 'open'
      ORDER BY coalesce(opened_at, created_at) DESC
      LIMIT 1
   );

CREATE UNIQUE INDEX IF NOT EXISTS tanks_name_key ON public.tanks (lower(name));
DROP INDEX IF EXISTS public.shift_closings_shift_number_key;
ALTER TABLE public.shift_closings DROP CONSTRAINT IF EXISTS shift_closings_shift_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS shift_closings_date_shift_key ON public.shift_closings (business_date, shift_number);
CREATE UNIQUE INDEX IF NOT EXISTS shift_closings_one_open ON public.shift_closings ((true)) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS meter_readings_shift_nozzle_key ON public.meter_readings (shift_closing_id, nozzle_id);

-- Backfill dispensing_machines from existing nozzles
INSERT INTO public.dispensing_machines (machine_number, name, active, status)
SELECT DISTINCT machine_number, 'Dispenser ' || machine_number, true, 'working'
FROM public.nozzles
ON CONFLICT (machine_number) DO NOTHING;

-- Seed standard dispensers if not already present
INSERT INTO public.dispensing_machines (machine_number, name, active, status)
VALUES
  ('M1', 'Dispenser 1 (Diesel)', true, 'working'),
  ('M2', 'Dispenser 2 (Petrol)', true, 'working'),
  ('M3', 'Dispenser 3 (Petrol)', true, 'working')
ON CONFLICT (machine_number) DO NOTHING;

-- Fuel Transactions (append-only ledger for all physical stock movements)
CREATE TABLE IF NOT EXISTS public.fuel_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  tank_id uuid NOT NULL REFERENCES public.tanks(id),
  nozzle_id uuid REFERENCES public.nozzles(id),
  shift_closing_id uuid REFERENCES public.shift_closings(id),
  transaction_type text NOT NULL,
  quantity_litres numeric(14,2) NOT NULL,
  stock_before numeric(14,2) NOT NULL,
  stock_after numeric(14,2) NOT NULL,
  reference text,
  remarks text,
  reason text,
  approval_note text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  unit_price numeric(12,2),
  sale_amount numeric(14,2),
  CONSTRAINT fuel_tx_type_valid CHECK (transaction_type IN ('OPENING_STOCK','FUEL_RECEIVED','NOZZLE_SALE','STOCK_ADJUSTMENT')),
  CONSTRAINT fuel_tx_sign_valid CHECK (
    (transaction_type = 'FUEL_RECEIVED'    AND quantity_litres > 0) OR
    (transaction_type = 'NOZZLE_SALE'      AND quantity_litres < 0) OR
    (transaction_type = 'OPENING_STOCK'    AND quantity_litres >= 0) OR
    (transaction_type = 'STOCK_ADJUSTMENT' AND quantity_litres <> 0)
  ),
  CONSTRAINT fuel_tx_math CHECK (stock_after = stock_before + quantity_litres),
  CONSTRAINT fuel_tx_stock_non_negative CHECK (stock_before >= 0 AND stock_after >= 0),
  CONSTRAINT fuel_tx_sale_links CHECK (transaction_type <> 'NOZZLE_SALE' OR (nozzle_id IS NOT NULL AND shift_closing_id IS NOT NULL)),
  CONSTRAINT fuel_tx_adjustment_reason CHECK (transaction_type <> 'STOCK_ADJUSTMENT' OR length(btrim(coalesce(reason, ''))) >= 3),
  CONSTRAINT fuel_tx_sale_priced CHECK (
    unit_price IS NULL OR (transaction_type = 'NOZZLE_SALE' AND unit_price > 0 AND sale_amount = round(-quantity_litres * unit_price, 2))
  )
);
CREATE INDEX IF NOT EXISTS fuel_tx_tank_seq_idx ON public.fuel_transactions (tank_id, seq DESC);
CREATE INDEX IF NOT EXISTS fuel_tx_tank_type_time_idx ON public.fuel_transactions (tank_id, transaction_type, created_at);
CREATE INDEX IF NOT EXISTS fuel_tx_shift_idx ON public.fuel_transactions (shift_closing_id);
CREATE INDEX IF NOT EXISTS fuel_tx_nozzle_idx ON public.fuel_transactions (nozzle_id);

-- Dip Readings (physical tank dip measurements)
CREATE TABLE IF NOT EXISTS public.dip_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  tank_id uuid NOT NULL REFERENCES public.tanks(id),
  dip_mm numeric(10,1) NOT NULL CHECK (dip_mm >= 0),
  remarks text,
  recorded_by uuid REFERENCES public.profiles(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dip_readings_tank_seq_idx ON public.dip_readings (tank_id, seq DESC);

-- Fuel Price History (append-only ledger of historical price changes)
CREATE TABLE IF NOT EXISTS public.fuel_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  fuel_type_id uuid NOT NULL REFERENCES public.fuel_types(id),
  price numeric(12,2) NOT NULL CHECK (price > 0),
  previous_price numeric(12,2),
  effective_from timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('INITIAL','INSTANT','SCHEDULED')),
  set_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fuel_price_history_fuel_idx ON public.fuel_price_history (fuel_type_id, seq DESC);

-- Fuel Price Schedule (future scheduled price transitions)
CREATE TABLE IF NOT EXISTS public.fuel_price_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_type_id uuid NOT NULL REFERENCES public.fuel_types(id),
  new_price numeric(12,2) NOT NULL CHECK (new_price > 0),
  effective_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPLIED','CANCELLED')),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS fuel_price_schedule_one_pending ON public.fuel_price_schedule (fuel_type_id) WHERE status = 'PENDING';

-- Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  category text NOT NULL,
  description text,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  expense_date date NOT NULL DEFAULT current_date,
  receipt_url text,
  entered_by uuid REFERENCES public.profiles(id),
  approved boolean NOT NULL DEFAULT false
);

-- Employees
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  identity_number text,
  designation text NOT NULL,
  shift_id uuid REFERENCES public.shifts(id),
  monthly_salary numeric(14,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  joining_date date
);

-- Salary Payments
CREATE TABLE IF NOT EXISTS public.salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  salary_month date NOT NULL,
  gross_salary numeric(14,2) NOT NULL,
  advance numeric(14,2) NOT NULL DEFAULT 0,
  deduction numeric(14,2) NOT NULL DEFAULT 0,
  overtime numeric(14,2) NOT NULL DEFAULT 0,
  net_salary numeric(14,2) GENERATED ALWAYS AS (gross_salary + overtime - advance - deduction) STORED,
  paid_at date
);

-- Attendance (Module 1, 2, 3: Manual Attendance & History, Biometric-Ready)
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('Present', 'Absent', 'Leave')),
  attendance_source text NOT NULL DEFAULT 'Manual' CHECK (attendance_source IN ('Manual', 'Biometric', 'System')),
  check_in_time time,
  check_out_time time,
  notes text,
  marked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  biometric_device_id text,
  biometric_log_id text,
  CONSTRAINT unique_employee_date UNIQUE (employee_id, date)
);
CREATE INDEX IF NOT EXISTS attendance_date_idx ON public.attendance (date);
CREATE INDEX IF NOT EXISTS attendance_employee_date_idx ON public.attendance (employee_id, date);
CREATE INDEX IF NOT EXISTS attendance_shift_idx ON public.attendance (shift_id);
CREATE INDEX IF NOT EXISTS attendance_status_idx ON public.attendance (status);

-- Other Non-Fuel Income
CREATE TABLE IF NOT EXISTS public.other_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  category text DEFAULT 'Services',
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  income_date date NOT NULL DEFAULT current_date,
  notes text,
  entered_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.other_income ADD COLUMN IF NOT EXISTS category text DEFAULT 'Services';

-- ---------------------------------------------------------------------
-- 3. Row Level Security (RLS) & Policies
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensing_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nozzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.other_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dip_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_price_schedule ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated staff
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'authenticated staff can read profiles') THEN
    CREATE POLICY "authenticated staff can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fuel_types' AND policyname = 'authenticated staff can read fuel_types') THEN
    CREATE POLICY "authenticated staff can read fuel_types" ON public.fuel_types FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tanks' AND policyname = 'authenticated staff can read tanks') THEN
    CREATE POLICY "authenticated staff can read tanks" ON public.tanks FOR SELECT TO authenticated USING (true);
  END IF;

  -- Dispensing machines policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispensing_machines' AND policyname IN ('dispensing_machines_select', 'authenticated staff can read dispensing_machines')) THEN
    CREATE POLICY "dispensing_machines_select" ON public.dispensing_machines FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispensing_machines' AND policyname IN ('dispensing_machines_insert', 'authorized staff can insert dispensing_machines')) THEN
    CREATE POLICY "dispensing_machines_insert" ON public.dispensing_machines FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispensing_machines' AND policyname IN ('dispensing_machines_update', 'authorized staff can update dispensing_machines')) THEN
    CREATE POLICY "dispensing_machines_update" ON public.dispensing_machines FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispensing_machines' AND policyname IN ('dispensing_machines_anon_select', 'anon can read dispensing_machines')) THEN
    CREATE POLICY "dispensing_machines_anon_select" ON public.dispensing_machines FOR SELECT TO anon USING (true);
  END IF;

  -- Nozzles policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nozzles' AND policyname = 'authenticated staff can read nozzles') THEN
    CREATE POLICY "authenticated staff can read nozzles" ON public.nozzles FOR SELECT TO authenticated USING (true);
  END IF;
  DROP POLICY IF EXISTS "nozzles_insert" ON public.nozzles;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nozzles' AND policyname = 'authorized staff can insert nozzles') THEN
    CREATE POLICY "authorized staff can insert nozzles" ON public.nozzles FOR INSERT TO authenticated WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND coalesce(p.active, true) = true
          AND p.role::text IN ('owner', 'admin', 'manager')
      )
      AND machine_number IS NOT NULL AND length(trim(machine_number)) > 0
      AND nozzle_number IS NOT NULL AND length(trim(nozzle_number)) > 0
      AND tank_id IS NOT NULL
      AND coalesce(current_meter_reading, 0) >= 0
      AND coalesce(status, 'working') IN ('working', 'not_working')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nozzles' AND policyname = 'authorized staff can update nozzles') THEN
    CREATE POLICY "authorized staff can update nozzles" ON public.nozzles FOR UPDATE TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND coalesce(p.active, true) = true
          AND p.role::text IN ('owner', 'admin', 'manager')
      )
    ) WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND coalesce(p.active, true) = true
          AND p.role::text IN ('owner', 'admin', 'manager')
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shifts' AND policyname = 'authenticated staff can read shifts') THEN
    CREATE POLICY "authenticated staff can read shifts" ON public.shifts FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shift_closings' AND policyname = 'authenticated staff can read shift_closings') THEN
    CREATE POLICY "authenticated staff can read shift_closings" ON public.shift_closings FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'meter_readings' AND policyname = 'authenticated staff can read meter_readings') THEN
    CREATE POLICY "authenticated staff can read meter_readings" ON public.meter_readings FOR SELECT TO authenticated USING (true);
  END IF;

  -- Operational CRUD policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'authenticated staff can read expenses') THEN
    CREATE POLICY "authenticated staff can read expenses" ON public.expenses FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'authenticated staff can insert expenses') THEN
    CREATE POLICY "authenticated staff can insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'authenticated staff can update expenses') THEN
    CREATE POLICY "authenticated staff can update expenses" ON public.expenses FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'authenticated staff can delete expenses') THEN
    CREATE POLICY "authenticated staff can delete expenses" ON public.expenses FOR DELETE TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'other_income' AND policyname = 'authenticated staff can read other_income') THEN
    CREATE POLICY "authenticated staff can read other_income" ON public.other_income FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'other_income' AND policyname = 'authenticated staff can insert other_income') THEN
    CREATE POLICY "authenticated staff can insert other_income" ON public.other_income FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'other_income' AND policyname = 'authenticated staff can update other_income') THEN
    CREATE POLICY "authenticated staff can update other_income" ON public.other_income FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'other_income' AND policyname = 'authenticated staff can delete other_income') THEN
    CREATE POLICY "authenticated staff can delete other_income" ON public.other_income FOR DELETE TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employees' AND policyname = 'authenticated staff can read employees') THEN
    CREATE POLICY "authenticated staff can read employees" ON public.employees FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employees' AND policyname = 'authenticated staff can insert employees') THEN
    CREATE POLICY "authenticated staff can insert employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employees' AND policyname = 'authenticated staff can update employees') THEN
    CREATE POLICY "authenticated staff can update employees" ON public.employees FOR UPDATE TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'salary_payments' AND policyname = 'authenticated staff can read salary_payments') THEN
    CREATE POLICY "authenticated staff can read salary_payments" ON public.salary_payments FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attendance' AND policyname = 'authenticated staff can read attendance') THEN
    CREATE POLICY "authenticated staff can read attendance" ON public.attendance FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attendance' AND policyname = 'authenticated staff can insert attendance') THEN
    CREATE POLICY "authenticated staff can insert attendance" ON public.attendance FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attendance' AND policyname = 'authenticated staff can update attendance') THEN
    CREATE POLICY "authenticated staff can update attendance" ON public.attendance FOR UPDATE TO authenticated USING (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. Triggers & Guard Functions (Audit & Immutability)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_ledger_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'FLOW:LEDGER_IMMUTABLE' USING detail = 'Inventory history cannot be edited or deleted. Post a correcting adjustment instead.';
END $$;

DROP TRIGGER IF EXISTS fuel_transactions_immutable ON public.fuel_transactions;
CREATE TRIGGER fuel_transactions_immutable BEFORE UPDATE OR DELETE ON public.fuel_transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_immutable();

DROP TRIGGER IF EXISTS fuel_transactions_no_truncate ON public.fuel_transactions;
CREATE TRIGGER fuel_transactions_no_truncate BEFORE TRUNCATE ON public.fuel_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_ledger_immutable();

DROP TRIGGER IF EXISTS dip_readings_immutable ON public.dip_readings;
CREATE TRIGGER dip_readings_immutable BEFORE UPDATE OR DELETE ON public.dip_readings
  FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_immutable();

DROP TRIGGER IF EXISTS fuel_price_history_immutable ON public.fuel_price_history;
CREATE TRIGGER fuel_price_history_immutable BEFORE UPDATE OR DELETE ON public.fuel_price_history
  FOR EACH ROW EXECUTE FUNCTION public.guard_ledger_immutable();

CREATE OR REPLACE FUNCTION public.guard_closed_shift() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF old.status = 'closed' THEN
    RAISE EXCEPTION 'FLOW:SHIFT_CLOSED' USING detail = 'A closed shift cannot be edited.';
  END IF;
  IF tg_op = 'DELETE' THEN RETURN old; END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS shift_closings_guard_closed ON public.shift_closings;
CREATE TRIGGER shift_closings_guard_closed BEFORE UPDATE OR DELETE ON public.shift_closings
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_shift();

CREATE OR REPLACE FUNCTION public.guard_closed_shift_readings() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.shift_closings s WHERE s.id = old.shift_closing_id AND s.status = 'closed') THEN
    RAISE EXCEPTION 'FLOW:SHIFT_CLOSED' USING detail = 'Readings of a closed shift cannot be edited.';
  END IF;
  IF tg_op = 'DELETE' THEN RETURN old; END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS meter_readings_guard_closed ON public.meter_readings;
CREATE TRIGGER meter_readings_guard_closed BEFORE UPDATE OR DELETE ON public.meter_readings
  FOR EACH ROW EXECUTE FUNCTION public.guard_closed_shift_readings();

CREATE OR REPLACE FUNCTION public.guard_tank_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF new.current_stock_litres IS DISTINCT FROM old.current_stock_litres
     AND coalesce(current_setting('flow.inventory_op', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'FLOW:STOCK_DIRECT_UPDATE'
      USING detail = 'Tank stock can only change through a recorded inventory transaction.';
  END IF;
  new.updated_at := now();
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS tanks_guard_stock ON public.tanks;
CREATE TRIGGER tanks_guard_stock BEFORE UPDATE ON public.tanks
  FOR EACH ROW EXECUTE FUNCTION public.guard_tank_stock();

-- ---------------------------------------------------------------------
-- 5. Business Logic & Helper Functions
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.flow_error(p_code text, p_detail jsonb default null) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'FLOW:%', p_code USING detail = coalesce(p_detail::text, '{}');
END $$;

CREATE OR REPLACE FUNCTION public.inventory_can(p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.active AND (
      p.role::text IN ('owner', 'admin')
      OR (p.role::text = 'manager'    AND p_action IN ('view_tanks','receive_fuel','stock_adjustment','view_history','close_shift','update_dip','enter_readings','manage_prices'))
      OR (p.role::text = 'supervisor' AND p_action IN ('view_tanks','close_shift','view_history','update_dip','enter_readings'))
      OR (p.role::text = 'attendant'  AND p_action IN ('view_tanks','enter_readings'))
    )
  );
$$;

CREATE OR REPLACE FUNCTION public._inventory_require(p_action text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN PERFORM public.flow_error('NOT_SIGNED_IN'); END IF;
  IF NOT public.inventory_can(p_action) THEN
    PERFORM public.flow_error('NOT_AUTHORIZED', jsonb_build_object('action', p_action));
  END IF;
  RETURN auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public._validate_litres(p_value numeric, p_signed boolean default false) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_value IS NULL OR p_value = 0 OR (NOT p_signed AND p_value < 0)
     OR p_value <> round(p_value, 2) OR abs(p_value) > 99999999 THEN
    PERFORM public.flow_error('INVALID_QUANTITY');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._clean_text(p_text text, p_max integer) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v text := nullif(btrim(coalesce(p_text, '')), '');
BEGIN
  IF v IS NOT NULL AND length(v) > p_max THEN
    PERFORM public.flow_error('INVALID_INPUT', jsonb_build_object('max_length', p_max));
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public._tank_snapshot(p_tank_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', t.id, 'name', t.name, 'fuel_name', f.name,
    'capacity', t.capacity_litres, 'current_stock', t.current_stock_litres
  )
  FROM public.tanks t JOIN public.fuel_types f ON f.id = t.fuel_type_id
  WHERE t.id = p_tank_id;
$$;

DROP FUNCTION IF EXISTS public._apply_stock_movement(uuid, text, numeric, uuid, uuid, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public._apply_stock_movement(
  p_tank_id uuid, p_type text, p_quantity numeric,
  p_nozzle_id uuid default null, p_shift_id uuid default null,
  p_reference text default null, p_remarks text default null,
  p_reason text default null, p_approval_note text default null, p_user uuid default null,
  p_unit_price numeric default null, p_sale_amount numeric default null
) RETURNS public.fuel_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.tanks;
  v_after numeric;
  r public.fuel_transactions;
BEGIN
  SELECT * INTO t FROM public.tanks WHERE id = p_tank_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.flow_error('TANK_NOT_FOUND'); END IF;
  IF NOT t.active THEN
    PERFORM public.flow_error('TANK_INACTIVE', jsonb_build_object('tank_name', t.name));
  END IF;

  v_after := t.current_stock_litres + p_quantity;
  IF v_after < 0 THEN
    PERFORM public.flow_error('INSUFFICIENT_STOCK', jsonb_build_object(
      'tank_name', t.name, 'available', t.current_stock_litres, 'requested', abs(p_quantity)));
  END IF;
  IF v_after > t.capacity_litres THEN
    PERFORM public.flow_error('CAPACITY_EXCEEDED', jsonb_build_object(
      'tank_name', t.name, 'capacity', t.capacity_litres, 'current', t.current_stock_litres,
      'requested', p_quantity, 'space_available', t.capacity_litres - t.current_stock_litres));
  END IF;

  PERFORM set_config('flow.inventory_op', 'on', true);
  UPDATE public.tanks SET current_stock_litres = v_after WHERE id = t.id;
  PERFORM set_config('flow.inventory_op', 'off', true);

  INSERT INTO public.fuel_transactions (
    tank_id, nozzle_id, shift_closing_id, transaction_type, quantity_litres, stock_before, stock_after,
    reference, remarks, reason, approval_note, created_by, unit_price, sale_amount)
  VALUES (
    t.id, p_nozzle_id, p_shift_id, p_type, p_quantity, t.current_stock_litres, v_after,
    p_reference, p_remarks, p_reason, p_approval_note, p_user, p_unit_price, p_sale_amount)
  RETURNING * INTO r;

  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public._apply_due_prices() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  v_prev numeric;
  n integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('flow.apply_prices'));
  FOR s IN
    SELECT * FROM public.fuel_price_schedule
    WHERE status = 'PENDING' AND effective_at <= now()
    ORDER BY effective_at, created_at
  LOOP
    SELECT current_rate INTO v_prev FROM public.fuel_types WHERE id = s.fuel_type_id FOR UPDATE;
    UPDATE public.fuel_types SET current_rate = s.new_price WHERE id = s.fuel_type_id;
    INSERT INTO public.fuel_price_history (fuel_type_id, price, previous_price, effective_from, source, set_by)
    VALUES (s.fuel_type_id, s.new_price, v_prev, s.effective_at, 'SCHEDULED', s.created_by);
    UPDATE public.fuel_price_schedule SET status = 'APPLIED', applied_at = now() WHERE id = s.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public._open_shift(p_user uuid) RETURNS public.shift_closings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.shift_closings;
  v_next bigint;
  v_local time := (now() AT TIME ZONE 'Asia/Karachi')::time;
  v_template uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('flow.open_shift'));
  SELECT * INTO r FROM public.shift_closings WHERE status = 'open';
  IF FOUND THEN RETURN r; END IF;

  -- Strict 2-shift cycle: NEVER increment beyond Shift 2. Resets back to Shift 1.
  SELECT (coalesce((SELECT shift_number FROM public.shift_closings ORDER BY coalesce(closed_at, opened_at, created_at) DESC LIMIT 1), 0) % 2) + 1 INTO v_next;
  SELECT s.id INTO v_template FROM public.shifts s
   WHERE s.active AND (CASE WHEN s.start_time < s.end_time
                            THEN v_local >= s.start_time AND v_local < s.end_time
                            ELSE v_local >= s.start_time OR v_local < s.end_time END)
   ORDER BY s.start_time LIMIT 1;

  INSERT INTO public.shift_closings (shift_id, business_date, shift_number, opened_by, status)
  VALUES (v_template, (now() AT TIME ZONE 'Asia/Karachi')::date, v_next, p_user, 'open')
  RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public._fuel_prices_json() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'server_time', now(),
    'fuels', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'code', f.code, 'name', f.name, 'price', f.current_rate,
        'effective_from', (SELECT h.effective_from FROM public.fuel_price_history h WHERE h.fuel_type_id = f.id ORDER BY h.seq DESC LIMIT 1),
        'pending', (SELECT jsonb_build_object('id', s.id, 'price', s.new_price, 'effective_at', s.effective_at)
                    FROM public.fuel_price_schedule s WHERE s.fuel_type_id = f.id AND s.status = 'PENDING')
      ) ORDER BY f.name)
      FROM public.fuel_types f WHERE f.active), '[]'::jsonb),
    'history', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'fuel_code', x.code, 'fuel_name', x.name, 'price', x.price, 'previous_price', x.previous_price,
        'effective_from', x.effective_from, 'source', x.source, 'user_name', x.user_name) ORDER BY x.seq DESC)
      FROM (SELECT h.*, f.code, f.name, p.full_name as user_name
            FROM public.fuel_price_history h
            JOIN public.fuel_types f ON f.id = h.fuel_type_id
            LEFT JOIN public.profiles p ON p.id = h.set_by
            ORDER BY h.seq DESC LIMIT 12) x), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- 6. Public Client RPCs
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_tank_overview() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public._inventory_require('view_tanks');
  v_day date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_from timestamptz := (v_day::timestamp) AT TIME ZONE 'Asia/Karachi';
  v_to timestamptz := ((v_day + 1)::timestamp) AT TIME ZONE 'Asia/Karachi';
  v_money boolean;
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

CREATE OR REPLACE FUNCTION public.receive_fuel(
  p_tank_id uuid, p_quantity numeric, p_reference text default null, p_remarks text default null
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public._inventory_require('receive_fuel');
  r public.fuel_transactions;
BEGIN
  PERFORM public._validate_litres(p_quantity);
  r := public._apply_stock_movement(p_tank_id, 'FUEL_RECEIVED', p_quantity, null, null,
         public._clean_text(p_reference, 120), public._clean_text(p_remarks, 500), null, null, v_user);
  RETURN jsonb_build_object('transaction', to_jsonb(r), 'tank', public._tank_snapshot(p_tank_id));
END $$;

CREATE OR REPLACE FUNCTION public.open_shift() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public._inventory_require('close_shift');
  r public.shift_closings;
BEGIN
  r := public._open_shift(v_user);
  RETURN jsonb_build_object('id', r.id, 'shift_number', r.shift_number, 'opened_at', r.opened_at);
END $$;

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
      PERFORM public.flow_error('INVALID_METER', jsonb_build_object('nozzle_number', v_row.nozzle_number,
        'opening', v_row.opening, 'closing', v_row.closing_meter));
    END IF;
    IF v_row.expected_opening_meter IS NOT NULL AND v_row.expected_opening_meter <> v_row.opening THEN
      PERFORM public.flow_error('STALE_DATA', jsonb_build_object('nozzle_number', v_row.nozzle_number));
    END IF;
    IF v_row.closing_meter > v_row.opening AND coalesce(v_row.unit_price, 0) <= 0 THEN
      PERFORM public.flow_error('PRICE_NOT_SET', jsonb_build_object('fuel_name', v_row.fuel_name));
    END IF;

    v_dispensed := v_row.closing_meter - v_row.opening;
    v_total := v_total + v_dispensed;
    v_rate := coalesce(v_row.unit_price, 0);
    v_amount := round(v_dispensed * v_rate, 2);
    v_revenue := v_revenue + v_amount;

    v_calc := v_calc || jsonb_build_object(
      'nozzle_id', v_row.nozzle_id, 'tank_id', v_row.tank_id, 'tank_name', v_row.tank_name,
      'nozzle_number', v_row.nozzle_number, 'opening', v_row.opening,
      'closing', v_row.closing_meter, 'dispensed', v_dispensed, 'rate', v_rate, 'amount', v_amount);
  END LOOP;

  -- Apply nozzle sales to tanks
  FOR v_row IN
    SELECT (e->>'tank_id')::uuid as tank_id, sum((e->>'dispensed')::numeric) as tank_dispensed,
           max(e->>'tank_name') as tank_name
    FROM jsonb_array_elements(v_calc) e
    GROUP BY 1
    HAVING sum((e->>'dispensed')::numeric) > 0
  LOOP
    IF (SELECT current_stock_litres FROM public.tanks WHERE id = v_row.tank_id) < v_row.tank_dispensed THEN
      PERFORM public.flow_error('INSUFFICIENT_STOCK', jsonb_build_object(
        'tank_name', v_row.tank_name,
        'available', (SELECT current_stock_litres FROM public.tanks WHERE id = v_row.tank_id),
        'requested', v_row.tank_dispensed));
    END IF;
  END LOOP;

  -- Post meter readings, update nozzles, and write transaction records
  FOR v_row IN SELECT * FROM jsonb_to_recordset(v_calc) AS (
    nozzle_id uuid, tank_id uuid, tank_name text, nozzle_number text,
    opening numeric, closing numeric, dispensed numeric, rate numeric, amount numeric)
  LOOP
    INSERT INTO public.meter_readings (shift_closing_id, nozzle_id, previous_reading, current_reading, rate)
    VALUES (v_shift.id, v_row.nozzle_id, v_row.opening, v_row.closing, v_row.rate);

    UPDATE public.nozzles SET current_meter_reading = v_row.closing WHERE id = v_row.nozzle_id;

    IF v_row.dispensed > 0 THEN
      v_tx := public._apply_stock_movement(
        v_row.tank_id, 'NOZZLE_SALE', -v_row.dispensed,
        v_row.nozzle_id, v_shift.id, v_ref,
        'Sold from nozzle ' || v_row.nozzle_number || ' (' || v_row.dispensed || ' L @ Rs ' || v_row.rate || ')',
        null, null, v_user, v_row.rate, v_row.amount);
    END IF;

    v_lines := v_lines || jsonb_build_object(
      'nozzle_number', v_row.nozzle_number, 'opening_meter', v_row.opening,
      'closing_meter', v_row.closing, 'litres_sold', v_row.dispensed,
      'rate', v_row.rate, 'sale_amount', v_row.amount);
  END LOOP;

  -- Close current shift
  UPDATE public.shift_closings
     SET status = 'closed', closed_by = v_user, closed_at = now(),
         expected_cash = v_revenue, closing_cash = v_revenue
   WHERE id = v_shift.id;

  -- Auto-open next shift
  v_next := public._open_shift(v_user);

  RETURN jsonb_build_object(
    'closed_shift', jsonb_build_object(
      'id', v_shift.id, 'shift_number', v_shift.shift_number, 'closed_at', now(),
      'total_litres_sold', v_total, 'total_revenue', v_revenue, 'lines', v_lines),
    'next_shift', jsonb_build_object(
      'id', v_next.id, 'shift_number', v_next.shift_number, 'opened_at', v_next.opened_at),
    'overview', public.get_tank_overview()
  );
END $$;

CREATE OR REPLACE FUNCTION public.record_dip_reading(
  p_tank_id uuid, p_dip_mm numeric, p_remarks text default null
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public._inventory_require('update_dip');
  r public.dip_readings;
BEGIN
  IF p_dip_mm IS NULL OR p_dip_mm < 0 OR p_dip_mm <> round(p_dip_mm, 1) OR p_dip_mm > 99999 THEN
    PERFORM public.flow_error('INVALID_DIP');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tanks WHERE id = p_tank_id) THEN
    PERFORM public.flow_error('TANK_NOT_FOUND');
  END IF;
  INSERT INTO public.dip_readings (tank_id, dip_mm, remarks, recorded_by)
  VALUES (p_tank_id, p_dip_mm, public._clean_text(p_remarks, 500), v_user)
  RETURNING * INTO r;
  RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_tank_id uuid, p_adjustment numeric, p_reason text, p_approval_note text default null
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public._inventory_require('stock_adjustment');
  v_reason text := public._clean_text(p_reason, 300);
  r public.fuel_transactions;
BEGIN
  PERFORM public._validate_litres(p_adjustment, true);
  IF v_reason IS NULL OR length(v_reason) < 3 THEN PERFORM public.flow_error('REASON_REQUIRED'); END IF;
  r := public._apply_stock_movement(p_tank_id, 'STOCK_ADJUSTMENT', p_adjustment, null, null,
         null, null, v_reason, public._clean_text(p_approval_note, 300), v_user);
  RETURN jsonb_build_object('transaction', to_jsonb(r), 'tank', public._tank_snapshot(p_tank_id));
END $$;

CREATE OR REPLACE FUNCTION public.list_tank_transactions(
  p_tank_id uuid, p_date_from date default null, p_date_to date default null,
  p_type text default null, p_nozzle_id uuid default null, p_shift_number bigint default null,
  p_limit integer default 50, p_offset integer default 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public._inventory_require('view_history');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_from timestamptz := CASE WHEN p_date_from IS NULL THEN NULL ELSE (p_date_from::timestamp) AT TIME ZONE 'Asia/Karachi' END;
  v_to timestamptz := CASE WHEN p_date_to IS NULL THEN NULL ELSE ((p_date_to + 1)::timestamp) AT TIME ZONE 'Asia/Karachi' END;
BEGIN
  RETURN (
    WITH filtered AS (
      SELECT f.*, n.nozzle_number, s.shift_number, p.full_name as user_name
      FROM public.fuel_transactions f
      LEFT JOIN public.nozzles n ON n.id = f.nozzle_id
      LEFT JOIN public.shift_closings s ON s.id = f.shift_closing_id
      LEFT JOIN public.profiles p ON p.id = f.created_by
      WHERE f.tank_id = p_tank_id
        AND (v_from IS NULL OR f.created_at >= v_from)
        AND (v_to IS NULL OR f.created_at < v_to)
        AND (p_type IS NULL OR f.transaction_type = p_type)
        AND (p_nozzle_id IS NULL OR f.nozzle_id = p_nozzle_id)
        AND (p_shift_number IS NULL OR s.shift_number = p_shift_number)
    ),
    page AS (SELECT * FROM filtered ORDER BY seq DESC LIMIT v_limit OFFSET v_offset)
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM filtered),
      'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'created_at', created_at, 'type', transaction_type,
          'nozzle_number', nozzle_number, 'shift_number', shift_number,
          'quantity', quantity_litres, 'stock_before', stock_before, 'stock_after', stock_after,
          'reference', reference, 'remarks', remarks, 'reason', reason,
          'approval_note', approval_note, 'user_name', user_name,
          'unit_price', CASE WHEN public.inventory_can('view_sales') THEN unit_price END,
          'sale_amount', CASE WHEN public.inventory_can('view_sales') THEN sale_amount END) ORDER BY seq DESC) FROM page), '[]'::jsonb)
    )
  );
END $$;

CREATE OR REPLACE FUNCTION public.list_dip_readings(p_tank_id uuid, p_limit integer default 20) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public._inventory_require('view_tanks');
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', d.id, 'dip_mm', d.dip_mm, 'recorded_at', d.recorded_at,
      'remarks', d.remarks, 'user_name', p.full_name) ORDER BY d.seq DESC)
    FROM (SELECT * FROM public.dip_readings WHERE tank_id = p_tank_id
          ORDER BY seq DESC LIMIT least(greatest(coalesce(p_limit, 20), 1), 200)) d
    LEFT JOIN public.profiles p ON p.id = d.recorded_by), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.get_fuel_prices() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._inventory_require('manage_prices');
  PERFORM public._apply_due_prices();
  RETURN public._fuel_prices_json();
END $$;

CREATE OR REPLACE FUNCTION public.set_fuel_price(
  p_fuel_type_id uuid, p_price numeric, p_mode text, p_effective_at timestamptz default null
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public._inventory_require('manage_prices');
  v_fuel public.fuel_types;
  v_at timestamptz := p_effective_at;
BEGIN
  IF p_price IS NULL OR p_price <= 0 OR p_price <> round(p_price, 2) OR p_price > 100000
     OR p_mode IS NULL OR p_mode NOT IN ('instant', 'scheduled') THEN
    PERFORM public.flow_error('INVALID_PRICE');
  END IF;

  PERFORM public._apply_due_prices();
  SELECT * INTO v_fuel FROM public.fuel_types WHERE id = p_fuel_type_id AND active FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.flow_error('FUEL_NOT_FOUND'); END IF;

  IF p_mode = 'instant' THEN
    UPDATE public.fuel_types SET current_rate = p_price WHERE id = v_fuel.id;
    INSERT INTO public.fuel_price_history (fuel_type_id, price, previous_price, effective_from, source, set_by)
    VALUES (v_fuel.id, p_price, nullif(v_fuel.current_rate, 0), now(), 'INSTANT', v_user);
  ELSE
    IF v_at IS NULL THEN
      v_at := (((now() AT TIME ZONE 'Asia/Karachi')::date + 1)::timestamp) AT TIME ZONE 'Asia/Karachi';
    END IF;
    IF v_at <= now() OR v_at > now() + INTERVAL '1 year' THEN PERFORM public.flow_error('SCHEDULE_IN_PAST'); END IF;
    UPDATE public.fuel_price_schedule SET status = 'CANCELLED' WHERE fuel_type_id = v_fuel.id AND status = 'PENDING';
    INSERT INTO public.fuel_price_schedule (fuel_type_id, new_price, effective_at, created_by)
    VALUES (v_fuel.id, p_price, v_at, v_user);
  END IF;
  RETURN public._fuel_prices_json();
END $$;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_price(p_schedule_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._inventory_require('manage_prices');
  PERFORM public._apply_due_prices();
  UPDATE public.fuel_price_schedule SET status = 'CANCELLED' WHERE id = p_schedule_id AND status = 'PENDING';
  IF NOT FOUND THEN PERFORM public.flow_error('SCHEDULE_NOT_FOUND'); END IF;
  RETURN public._fuel_prices_json();
END $$;

CREATE OR REPLACE FUNCTION public.apply_due_prices() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN PERFORM public.flow_error('NOT_SIGNED_IN'); END IF;
  RETURN public._apply_due_prices();
END $$;

CREATE OR REPLACE FUNCTION public.get_sales_summary() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_wk date;
  v_mo date;
  v_pmo date;
  v_pmo_end date;
  r jsonb;
BEGIN
  PERFORM public._inventory_require('view_sales');
  PERFORM public._apply_due_prices();
  v_wk := v_today - (extract(isodow from v_today)::int - 1);
  v_mo := date_trunc('month', v_today)::date;
  v_pmo := (v_mo - INTERVAL '1 month')::date;
  v_pmo_end := least(v_mo - 1, v_pmo + (v_today - v_mo));

  WITH s AS (
    SELECT (f.created_at AT TIME ZONE 'Asia/Karachi')::date as d,
           -f.quantity_litres as litres, coalesce(f.sale_amount, 0) as amount
    FROM public.fuel_transactions f
    WHERE f.transaction_type = 'NOZZLE_SALE'
      AND f.created_at >= (least(v_pmo, v_wk - 7, v_today - 31)::timestamp) AT TIME ZONE 'Asia/Karachi'
  )
  SELECT jsonb_build_object(
    'business_date', v_today,
    'daily', jsonb_build_object(
      'revenue', coalesce(sum(amount) FILTER (WHERE d = v_today), 0),
      'litres', coalesce(sum(litres) FILTER (WHERE d = v_today), 0),
      'prev_revenue', coalesce(sum(amount) FILTER (WHERE d = v_today - 1), 0),
      'prev_litres', coalesce(sum(litres) FILTER (WHERE d = v_today - 1), 0)),
    'weekly', jsonb_build_object(
      'revenue', coalesce(sum(amount) FILTER (WHERE d BETWEEN v_wk AND v_today), 0),
      'litres', coalesce(sum(litres) FILTER (WHERE d BETWEEN v_wk AND v_today), 0),
      'prev_revenue', coalesce(sum(amount) FILTER (WHERE d BETWEEN v_wk - 7 AND v_today - 7), 0),
      'prev_litres', coalesce(sum(litres) FILTER (WHERE d BETWEEN v_wk - 7 AND v_today - 7), 0)),
    'monthly', jsonb_build_object(
      'revenue', coalesce(sum(amount) FILTER (WHERE d BETWEEN v_mo AND v_today), 0),
      'litres', coalesce(sum(litres) FILTER (WHERE d BETWEEN v_mo AND v_today), 0),
      'prev_revenue', coalesce(sum(amount) FILTER (WHERE d BETWEEN v_pmo AND v_pmo_end), 0),
      'prev_litres', coalesce(sum(litres) FILTER (WHERE d BETWEEN v_pmo AND v_pmo_end), 0))
  ) INTO r FROM s;

  RETURN r || jsonb_build_object('series', coalesce((
    SELECT jsonb_agg(jsonb_build_object('date', g.d, 'revenue', coalesce(x.amount, 0), 'litres', coalesce(x.litres, 0)) ORDER BY g.d)
    FROM (SELECT (v_today - 30 + i)::date as d FROM generate_series(0, 30) i) g
    LEFT JOIN (
      SELECT (f.created_at AT TIME ZONE 'Asia/Karachi')::date as d, sum(-f.quantity_litres) as litres, sum(coalesce(f.sale_amount, 0)) as amount
      FROM public.fuel_transactions f
      WHERE f.transaction_type = 'NOZZLE_SALE' AND f.created_at >= ((v_today - 30)::timestamp) AT TIME ZONE 'Asia/Karachi'
      GROUP BY 1) x ON x.d = g.d), '[]'::jsonb));
END $$;

-- ---------------------------------------------------------------------
-- 7. Privileges & Access Controls
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.flow_error(text, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._inventory_require(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._validate_litres(numeric, boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._clean_text(text, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._apply_stock_movement(uuid, text, numeric, uuid, uuid, text, text, text, text, uuid, numeric, numeric) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._open_shift(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._tank_snapshot(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._apply_due_prices() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._fuel_prices_json() FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.inventory_can(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_tank_overview() FROM public, anon;
REVOKE ALL ON FUNCTION public.receive_fuel(uuid, numeric, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.open_shift() FROM public, anon;
REVOKE ALL ON FUNCTION public.close_shift(uuid, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.record_dip_reading(uuid, numeric, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.adjust_stock(uuid, numeric, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.list_tank_transactions(uuid, date, date, text, uuid, bigint, integer, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.list_dip_readings(uuid, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_fuel_prices() FROM public, anon;
REVOKE ALL ON FUNCTION public.set_fuel_price(uuid, numeric, text, timestamptz) FROM public, anon;
REVOKE ALL ON FUNCTION public.cancel_scheduled_price(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.apply_due_prices() FROM public, anon;
REVOKE ALL ON FUNCTION public.get_sales_summary() FROM public, anon;

GRANT EXECUTE ON FUNCTION public.inventory_can(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tank_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_fuel(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_shift() TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_shift(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_dip_reading(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tank_transactions(uuid, date, date, text, uuid, bigint, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_dip_readings(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fuel_prices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_fuel_price(uuid, numeric, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_scheduled_price(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_due_prices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_summary() TO authenticated;

-- ---------------------------------------------------------------------
-- 10. Automatic User Profile Trigger (Supabase Auth Integration)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, active)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'owner',
    true
  )
  ON CONFLICT (id) DO UPDATE SET active = true, role = 'owner';
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill any existing users in auth.users
INSERT INTO public.profiles (id, full_name, role, active)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  'owner',
  true
FROM auth.users
ON CONFLICT (id) DO UPDATE SET active = true, role = 'owner';

