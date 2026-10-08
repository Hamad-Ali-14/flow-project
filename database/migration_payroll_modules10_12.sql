-- =====================================================================
-- FLOW OPS: Modules 10–12 — Salary Slip, Payroll Lock & Audit, Reports Engine
-- Migration: Enforces locked payroll constraints on attendance mutations,
-- automatic recalculation RPC after approved corrections, and reporting queries.
-- Safe to re-run in Supabase SQL editor.
-- =====================================================================

-- 1. Trigger function: Restrict attendance modifications when payroll is locked
CREATE OR REPLACE FUNCTION public.fn_check_attendance_not_locked()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_month int;
  v_year int;
  v_locked boolean;
BEGIN
  v_month := extract(month from NEW.date)::int;
  v_year := extract(year from NEW.date)::int;

  -- Check if payroll for this employee and period is finalized and locked
  SELECT locked INTO v_locked
  FROM public.payroll_records
  WHERE employee_id = NEW.employee_id
    AND month = v_month
    AND year = v_year;

  IF v_locked = true THEN
    -- If trigger was called without special recalculation session flag, raise restriction error
    IF current_setting('flow.allow_locked_attendance_correction', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'FLOW:PAYROLL_FINALIZED_LOCKED'
        USING message = 'Payroll for this month has been finalized and locked. Attendance cannot be modified directly without an approved manager recalculation override.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_attendance_not_locked ON public.attendance;
CREATE TRIGGER trg_check_attendance_not_locked
BEFORE INSERT OR UPDATE ON public.attendance
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_attendance_not_locked();

-- 2. RPC: payroll_recalculate_for_correction (Module 11)
-- Recalculates payroll after an approved attendance correction on a locked or unlocked period.
CREATE OR REPLACE FUNCTION public.payroll_recalculate_for_correction(
  p_employee_id uuid,
  p_month int,
  p_year int,
  p_reason text,
  p_actor text DEFAULT 'Station Manager'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec record;
  v_settings record;
  v_start_date date;
  v_end_date date;
  v_present int;
  v_leave int;
  v_absent int;
  v_deductible int;
  v_calc jsonb;
  v_old_values jsonb;
  v_new_values jsonb;
  v_new_final numeric;
  v_new_balance numeric;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'FLOW:REASON_REQUIRED';
  END IF;

  SELECT * INTO v_rec
  FROM public.payroll_records
  WHERE employee_id = p_employee_id AND month = p_month AND year = p_year;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FLOW:PAYROLL_NOT_FOUND';
  END IF;

  SELECT * INTO v_settings FROM public.payroll_settings LIMIT 1;

  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (v_start_date + interval '1 month - 1 day')::date;

  -- Re-count actual attendance after correction
  SELECT
    count(*) FILTER (WHERE status = 'Present'),
    count(*) FILTER (WHERE status = 'Leave'),
    count(*) FILTER (WHERE status = 'Absent')
  INTO v_present, v_leave, v_absent
  FROM public.attendance
  WHERE employee_id = p_employee_id AND date >= v_start_date AND date <= v_end_date;

  v_present := coalesce(v_present, 0);
  v_leave := coalesce(v_leave, 0);
  v_absent := coalesce(v_absent, 0);

  IF v_settings.absent_counts_as_leave THEN
    v_deductible := v_leave + v_absent;
  ELSE
    v_deductible := v_leave;
  END IF;

  -- Recalculate using Module 6 rule engine
  v_calc := public.calculate_payroll(v_rec.monthly_salary, v_deductible, v_settings.days_basis, v_settings.bonus_enabled);
  v_new_final := (v_calc->>'final_salary')::numeric;
  v_new_balance := v_new_final - v_rec.paid_total;

  v_old_values := jsonb_build_object(
    'present_days', v_rec.present_days,
    'leave_days', v_rec.leave_days,
    'absent_days', v_rec.absent_days,
    'deduction', v_rec.deduction,
    'bonus', v_rec.bonus,
    'final_salary', v_rec.final_salary,
    'balance', v_rec.balance
  );

  v_new_values := jsonb_build_object(
    'present_days', v_present,
    'leave_days', v_leave,
    'absent_days', v_absent,
    'deduction', (v_calc->>'deduction')::numeric,
    'bonus', (v_calc->>'bonus')::numeric,
    'final_salary', v_new_final,
    'balance', v_new_balance
  );

  -- Update payroll record
  UPDATE public.payroll_records SET
    present_days = v_present,
    absent_days = v_absent,
    leave_days = v_leave,
    deductible_days = v_deductible,
    deduction = (v_calc->>'deduction')::numeric,
    bonus = (v_calc->>'bonus')::numeric,
    final_salary = v_new_final,
    balance = v_new_balance,
    payment_status = CASE WHEN v_new_balance <= 0 THEN 'PAID' WHEN v_rec.paid_total > 0 THEN 'PARTIAL' ELSE 'UNPAID' END,
    version = version + 1,
    updated_at = now()
  WHERE id = v_rec.id;

  -- Log into payroll audit log
  INSERT INTO public.payroll_audit_log (
    payroll_id, action, actor_name, old_values, new_values, note
  ) VALUES (
    v_rec.id,
    'RECALCULATE_ATTENDANCE_CORRECTION',
    p_actor,
    v_old_values,
    v_new_values,
    p_reason
  );

  RETURN (SELECT public.payroll_get(v_rec.id));
END;
$$;

-- 3. RPC: payroll_audit_summary (Module 11 & 12)
CREATE OR REPLACE FUNCTION public.payroll_audit_summary(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'payroll_id', a.payroll_id,
        'employee_id', pr.employee_id,
        'employee_name', e.full_name,
        'month', pr.month,
        'year', pr.year,
        'action', a.action,
        'actor_name', a.actor_name,
        'at', a.at,
        'old_values', a.old_values,
        'new_values', a.new_values,
        'note', a.note
      ) ORDER BY a.at DESC
    )
    FROM public.payroll_audit_log a
    JOIN public.payroll_records pr ON pr.id = a.payroll_id
    JOIN public.employees e ON e.id = pr.employee_id
    LIMIT p_limit
  ), '[]'::jsonb);
END;
$$;
