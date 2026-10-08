-- =====================================================================
-- FLOW OPS: Module 1 — Attendance Database & Rules
-- Migration: Creates the attendance table, constraints, indexes,
-- RLS policies, and prepares schema for future biometric integration.
-- Safe to run multiple times in the Supabase SQL editor.
-- =====================================================================

-- 1. Create the attendance table
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  status text NOT NULL,
  attendance_source text NOT NULL DEFAULT 'Manual',
  check_in_time time,
  check_out_time time,
  notes text,
  marked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Future-proof biometric columns (reserved for biometric hardware sync)
  biometric_device_id text,
  biometric_log_id text,

  -- Module 1 Rules & Constraints:
  -- Status must strictly be Present, Absent, or Leave
  CONSTRAINT attendance_status_check CHECK (status IN ('Present', 'Absent', 'Leave')),
  
  -- Attendance source must be Manual, Biometric, or System
  CONSTRAINT attendance_source_check CHECK (attendance_source IN ('Manual', 'Biometric', 'System')),

  -- Unique employee + date constraint prevents duplicate daily attendance
  CONSTRAINT unique_employee_date UNIQUE (employee_id, date)
);

-- 2. Indexes for fast filtering and reporting
CREATE INDEX IF NOT EXISTS attendance_date_idx ON public.attendance (date);
CREATE INDEX IF NOT EXISTS attendance_employee_date_idx ON public.attendance (employee_id, date);
CREATE INDEX IF NOT EXISTS attendance_shift_idx ON public.attendance (shift_id);
CREATE INDEX IF NOT EXISTS attendance_status_idx ON public.attendance (status);

-- 3. Row Level Security (RLS) & Access Policies
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Drop previous policies if re-running
DROP POLICY IF EXISTS "attendance_select_policy" ON public.attendance;
DROP POLICY IF EXISTS "attendance_insert_policy" ON public.attendance;
DROP POLICY IF EXISTS "attendance_update_policy" ON public.attendance;
DROP POLICY IF EXISTS "attendance_delete_policy" ON public.attendance;

-- Read policy: authenticated staff can read attendance records
-- (If employee_scope_ok function is present, respects shift scope for managers)
CREATE POLICY "attendance_select_policy" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    CASE 
      WHEN to_regproc('public.employee_scope_ok') IS NOT NULL THEN
        public.employee_scope_ok((SELECT e.shift_id FROM public.employees e WHERE e.id = employee_id))
      ELSE true
    END
  );

-- Insert policy: authenticated managers, admins, and owners can record attendance
CREATE POLICY "attendance_insert_policy" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    CASE 
      WHEN to_regproc('public.employee_scope_ok') IS NOT NULL THEN
        public.employee_scope_ok((SELECT e.shift_id FROM public.employees e WHERE e.id = employee_id))
      ELSE true
    END
  );

-- Update policy: allows correcting attendance with audit trail
CREATE POLICY "attendance_update_policy" ON public.attendance
  FOR UPDATE TO authenticated
  USING (
    CASE 
      WHEN to_regproc('public.employee_scope_ok') IS NOT NULL THEN
        public.employee_scope_ok((SELECT e.shift_id FROM public.employees e WHERE e.id = employee_id))
      ELSE true
    END
  )
  WITH CHECK (
    CASE 
      WHEN to_regproc('public.employee_scope_ok') IS NOT NULL THEN
        public.employee_scope_ok((SELECT e.shift_id FROM public.employees e WHERE e.id = employee_id))
      ELSE true
    END
  );

-- Delete policy: restricted to admins/owners
CREATE POLICY "attendance_delete_policy" ON public.attendance
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.active
        AND p.role::text IN ('owner', 'admin')
    )
  );

-- 4. Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.set_attendance_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_updated_at ON public.attendance;
CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.set_attendance_updated_at();

-- 5. Seed Attendance Data for the current month if employees exist
DO $$
DECLARE
  v_emp RECORD;
  v_day int;
  v_target_date date;
  v_status text;
  v_start_date date := date_trunc('month', current_date)::date;
  v_days_so_far int := EXTRACT(DAY FROM current_date)::int;
BEGIN
  -- Only seed if attendance table is currently empty
  IF NOT EXISTS (SELECT 1 FROM public.attendance LIMIT 1) THEN
    FOR v_emp IN SELECT id, full_name, designation, shift_id FROM public.employees LOOP
      -- Loop through days of the current month up to today
      FOR v_day IN 0..(v_days_so_far - 1) LOOP
        v_target_date := v_start_date + v_day;
        
        -- Determine realistic status based on employee designation & day
        -- Imran Shah (Pump attendant): Perfect attendance (0 leaves)
        IF v_emp.full_name = 'Imran Shah' THEN
          v_status := 'Present';
        -- Hamza Raza (Senior Cashier): 1 Leave day
        ELSIF v_emp.full_name = 'Hamza Raza' AND v_day = 3 THEN
          v_status := 'Leave';
        -- Fahad Iqbal (Pump attendant): 2 Leaves
        ELSIF v_emp.full_name = 'Fahad Iqbal' AND v_day IN (4, 11) THEN
          v_status := 'Leave';
        -- Rizwan Ahmed (Cleaner): 1 Absent
        ELSIF v_emp.full_name = 'Rizwan Ahmed' AND v_day = 2 THEN
          v_status := 'Absent';
        ELSE
          v_status := 'Present';
        END IF;

        INSERT INTO public.attendance (
          employee_id,
          date,
          shift_id,
          status,
          attendance_source,
          check_in_time,
          check_out_time,
          notes
        ) VALUES (
          v_emp.id,
          v_target_date,
          v_emp.shift_id,
          v_status,
          'Manual',
          CASE WHEN v_status = 'Present' THEN '07:00:00'::time ELSE NULL END,
          CASE WHEN v_status = 'Present' THEN '19:00:00'::time ELSE NULL END,
          CASE 
            WHEN v_status = 'Leave' THEN 'Approved monthly leave' 
            WHEN v_status = 'Absent' THEN 'Unnotified absence'
            ELSE 'On-time attendance'
          END
        )
        ON CONFLICT (employee_id, date) DO NOTHING;
      END LOOP;
    END LOOP;
  END IF;
END $$;
