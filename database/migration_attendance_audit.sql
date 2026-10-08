-- =====================================================================
-- FLOW OPS: Module 4 — Attendance Correction & Audit Trail
-- Creates the attendance_audit_log table, triggers, constraints,
-- and RLS policies to record who changed attendance, when, and why.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.attendance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid NOT NULL REFERENCES public.attendance(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  previous_check_in time,
  new_check_in time,
  previous_check_out time,
  new_check_out time,
  reason text NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name text NOT NULL DEFAULT 'Station Staff',
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT correction_reason_min_length CHECK (length(btrim(reason)) >= 3)
);

CREATE INDEX IF NOT EXISTS att_audit_attendance_id_idx ON public.attendance_audit_log (attendance_id);
CREATE INDEX IF NOT EXISTS att_audit_employee_id_idx ON public.attendance_audit_log (employee_id);
CREATE INDEX IF NOT EXISTS att_audit_date_idx ON public.attendance_audit_log (attendance_date);
CREATE INDEX IF NOT EXISTS att_audit_created_at_idx ON public.attendance_audit_log (created_at DESC);

-- Enable RLS
ALTER TABLE public.attendance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "att_audit_select_policy" ON public.attendance_audit_log;
DROP POLICY IF EXISTS "att_audit_insert_policy" ON public.attendance_audit_log;

CREATE POLICY "att_audit_select_policy" ON public.attendance_audit_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "att_audit_insert_policy" ON public.attendance_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger to automatically track status changes in public.attendance if updated directly
CREATE OR REPLACE FUNCTION public.fn_log_attendance_correction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_user_name text := 'Station Staff';
BEGIN
  -- Only log if status or timings actually changed
  IF (OLD.status IS DISTINCT FROM NEW.status) OR 
     (OLD.check_in_time IS DISTINCT FROM NEW.check_in_time) OR 
     (OLD.check_out_time IS DISTINCT FROM NEW.check_out_time) THEN

    -- Try to fetch profile full name
    SELECT coalesce(p.full_name, 'Station Staff') INTO v_user_name
    FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1;

    INSERT INTO public.attendance_audit_log (
      attendance_id,
      employee_id,
      attendance_date,
      previous_status,
      new_status,
      previous_check_in,
      new_check_in,
      previous_check_out,
      new_check_out,
      reason,
      changed_by,
      changed_by_name
    ) VALUES (
      NEW.id,
      NEW.employee_id,
      NEW.date,
      OLD.status,
      NEW.status,
      OLD.check_in_time,
      NEW.check_in_time,
      OLD.check_out_time,
      NEW.check_out_time,
      coalesce(NEW.notes, 'Attendance record updated'),
      auth.uid(),
      coalesce(v_user_name, 'Station Staff')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_attendance_correction ON public.attendance;
CREATE TRIGGER trg_log_attendance_correction
  AFTER UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_attendance_correction();
