-- =====================================================================
-- FLOW OPS: Role-based access for Attendance & Payroll (Employees & salaries)
--
--   owner / admin      -> every employee, every shift (including "General" = no shift)
--   manager            -> ONLY employees of the manager's own assigned shift
--                         (profiles.shift_id). Attendance, audit trails, payroll rows,
--                         salaries, payments and totals of other shifts are invisible
--                         and cannot be changed.
--   anyone else        -> nothing
--
-- This is the real enforcement: the app screens filter as well, but a manager calling the
-- Supabase API directly must get the same answer. Fails closed: a manager without a shift
-- assigned, or an employee without a shift, is never visible to a manager.
--
-- Also adds:
--   * public.viewer_scope()   -> { role, shift_id, shift_name } for the signed-in user
--   * shift_id in payroll_list rows (the app needs it to scope the screen)
--
-- Safe to run more than once. Run in the Supabase SQL editor AFTER
--   migration_employee_shift_scope.sql, migration_attendance*.sql, migration_payroll_*.sql.
-- (It re-creates the two shift helpers below, so it also works if that first file was skipped.)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Shift assignment + scope helpers
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id);

-- May the signed-in user see / write an employee that belongs to p_shift?
-- (NULL shift -> only owner / admin, because "manager's shift = NULL" is never true.)
CREATE OR REPLACE FUNCTION public.employee_scope_ok(p_shift uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.active
      AND (
        p.role::text IN ('owner', 'admin')
        OR (p.role::text = 'manager' AND p.shift_id IS NOT NULL AND p.shift_id = p_shift)
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.employee_scope_ok(uuid) TO authenticated;

-- Same question, asked by employee id (payroll / attendance rows carry the employee id).
CREATE OR REPLACE FUNCTION public.payroll_scope_ok(p_employee uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.employee_scope_ok((SELECT e.shift_id FROM public.employees e WHERE e.id = p_employee));
$$;
GRANT EXECUTE ON FUNCTION public.payroll_scope_ok(uuid) TO authenticated;

-- Raises FLOW:NOT_AUTHORIZED unless the caller may touch this employee's payroll.
CREATE OR REPLACE FUNCTION public._payroll_require_scope(p_employee uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLOW:NOT_SIGNED_IN'; END IF;
  IF NOT public.payroll_scope_ok(p_employee) THEN RAISE EXCEPTION 'FLOW:NOT_AUTHORIZED'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public._payroll_require_scope(uuid) TO authenticated;

-- Who is asking, and which shift are they limited to? (NULL when not signed in / inactive.)
CREATE OR REPLACE FUNCTION public.viewer_scope() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (
    SELECT jsonb_build_object('role', p.role::text, 'shift_id', p.shift_id, 'shift_name', s.name)
    FROM public.profiles p
    LEFT JOIN public.shifts s ON s.id = p.shift_id
    WHERE p.id = auth.uid() AND p.active
  );
$$;
GRANT EXECUTE ON FUNCTION public.viewer_scope() TO authenticated;

-- ---------------------------------------------------------------------
-- 1. Row level security: attendance audit trail + payroll tables
--    (attendance and employees are already shift-scoped by their own migrations)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "att_audit_select_policy" ON public.attendance_audit_log;
CREATE POLICY "att_audit_select_policy" ON public.attendance_audit_log
  FOR SELECT TO authenticated USING (public.payroll_scope_ok(employee_id));

DROP POLICY IF EXISTS "att_audit_insert_policy" ON public.attendance_audit_log;
CREATE POLICY "att_audit_insert_policy" ON public.attendance_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.payroll_scope_ok(employee_id));

DROP POLICY IF EXISTS "payroll_records_read" ON public.payroll_records;
CREATE POLICY "payroll_records_read" ON public.payroll_records
  FOR SELECT TO authenticated USING (public.payroll_scope_ok(employee_id));

DROP POLICY IF EXISTS "payroll_payments_read" ON public.payroll_payments;
CREATE POLICY "payroll_payments_read" ON public.payroll_payments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.payroll_records pr
            WHERE pr.id = payroll_payments.payroll_id AND public.payroll_scope_ok(pr.employee_id))
  );

DROP POLICY IF EXISTS "payroll_audit_read" ON public.payroll_audit_log;
CREATE POLICY "payroll_audit_read" ON public.payroll_audit_log
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.payroll_records pr
            WHERE pr.id = payroll_audit_log.payroll_id AND public.payroll_scope_ok(pr.employee_id))
  );

-- ---------------------------------------------------------------------
-- 2. Payroll RPCs (SECURITY DEFINER = they bypass RLS, so they must scope themselves)
-- ---------------------------------------------------------------------

-- 2a. payroll_list: rows, KPI summary and "missing employees" all limited to the caller's scope.
CREATE OR REPLACE FUNCTION public.payroll_list(p_month integer, p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
  v_rows jsonb;
  v_summary jsonb;
  v_missing jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLOW:NOT_SIGNED_IN'; END IF;

  SELECT jsonb_build_object(
    'days_basis', days_basis,
    'absent_counts_as_leave', absent_counts_as_leave,
    'bonus_enabled', bonus_enabled,
    'bonus_requires_complete_attendance', bonus_requires_complete_attendance
  ) INTO v_settings FROM public.payroll_settings LIMIT 1;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', pr.id,
      'employee_id', pr.employee_id,
      'employee_name', e.full_name,
      'designation', e.designation,
      'shift_id', e.shift_id,
      'shift_name', coalesce(s.name, 'Shift 1 - Day'),
      'month', pr.month,
      'year', pr.year,
      'monthly_salary', pr.monthly_salary,
      'daily_salary', pr.daily_salary,
      'days_basis', pr.days_basis,
      'present_days', pr.present_days,
      'absent_days', pr.absent_days,
      'leave_days', pr.leave_days,
      'unmarked_days', pr.unmarked_days,
      'deductible_days', pr.deductible_days,
      'deduction', pr.deduction,
      'bonus', pr.bonus,
      'bonus_withheld_reason', pr.bonus_withheld_reason,
      'final_salary', pr.final_salary,
      'status', pr.status,
      'locked', pr.locked,
      'review_note', pr.review_note,
      'reviewed_at', pr.reviewed_at,
      'reviewed_by_name', pr.reviewed_by_name,
      'finalized_at', pr.finalized_at,
      'finalized_by_name', pr.finalized_by_name,
      'version', pr.version,
      'paid_total', pr.paid_total,
      'balance', pr.balance,
      'payment_status', pr.payment_status
    ) ORDER BY e.full_name
  ), '[]'::jsonb) INTO v_rows
  FROM public.payroll_records pr
  JOIN public.employees e ON e.id = pr.employee_id
  LEFT JOIN public.shifts s ON s.id = e.shift_id
  WHERE pr.month = p_month AND pr.year = p_year
    AND public.employee_scope_ok(e.shift_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.full_name, 'shift_id', e.shift_id)), '[]'::jsonb)
  INTO v_missing
  FROM public.employees e
  WHERE e.active = true
    AND public.employee_scope_ok(e.shift_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.payroll_records pr
      WHERE pr.employee_id = e.id AND pr.month = p_month AND pr.year = p_year
    );

  SELECT jsonb_build_object(
    'count', count(*),
    'draft', count(*) FILTER (WHERE pr.status = 'DRAFT'),
    'approved', count(*) FILTER (WHERE pr.status = 'APPROVED'),
    'rejected', count(*) FILTER (WHERE pr.status = 'REJECTED'),
    'finalized', count(*) FILTER (WHERE pr.status = 'FINALIZED'),
    'total_base', coalesce(sum(pr.monthly_salary), 0),
    'total_bonus', coalesce(sum(pr.bonus), 0),
    'total_deduction', coalesce(sum(pr.deduction), 0),
    'total_payable', coalesce(sum(pr.final_salary), 0),
    'total_paid', coalesce(sum(pr.paid_total), 0),
    'missing_employees', v_missing
  ) INTO v_summary
  FROM public.payroll_records pr
  JOIN public.employees e ON e.id = pr.employee_id
  WHERE pr.month = p_month AND pr.year = p_year
    AND public.employee_scope_ok(e.shift_id);

  RETURN jsonb_build_object(
    'month', p_month,
    'year', p_year,
    'settings', v_settings,
    'rows', v_rows,
    'summary', v_summary
  );
END;
$$;

-- 2b. payroll_generate: a manager only generates payroll for their own shift's employees.
CREATE OR REPLACE FUNCTION public.payroll_generate(p_month integer, p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
  v_emp record;
  v_start_date date;
  v_end_date date;
  v_present int;
  v_leave int;
  v_absent int;
  v_deductible int;
  v_calc jsonb;
  v_created int := 0;
  v_replaced int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_existing record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLOW:NOT_SIGNED_IN'; END IF;
  IF p_month < 1 OR p_month > 12 OR p_year < 2020 THEN
    RAISE EXCEPTION 'FLOW:INVALID_PERIOD';
  END IF;

  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (v_start_date + interval '1 month - 1 day')::date;

  SELECT * INTO v_settings FROM public.payroll_settings LIMIT 1;

  FOR v_emp IN
    SELECT * FROM public.employees
    WHERE active = true AND public.employee_scope_ok(shift_id)
    ORDER BY full_name
  LOOP
    IF v_emp.monthly_salary IS NULL OR v_emp.monthly_salary <= 0 THEN
      v_skipped := v_skipped || jsonb_build_object('employee_id', v_emp.id, 'employee_name', v_emp.full_name, 'reason', 'no monthly salary set');
      CONTINUE;
    END IF;

    IF v_emp.joining_date IS NOT NULL AND v_emp.joining_date > v_end_date THEN
      v_skipped := v_skipped || jsonb_build_object('employee_id', v_emp.id, 'employee_name', v_emp.full_name, 'reason', 'joins after this month');
      CONTINUE;
    END IF;

    SELECT * INTO v_existing FROM public.payroll_records
    WHERE employee_id = v_emp.id AND month = p_month AND year = p_year;

    IF FOUND THEN
      IF v_existing.status = 'FINALIZED' OR v_existing.locked = true THEN
        v_skipped := v_skipped || jsonb_build_object('employee_id', v_emp.id, 'employee_name', v_emp.full_name, 'reason', 'already finalized');
        CONTINUE;
      END IF;
      IF v_existing.status = 'APPROVED' THEN
        v_skipped := v_skipped || jsonb_build_object('employee_id', v_emp.id, 'employee_name', v_emp.full_name, 'reason', 'already approved');
        CONTINUE;
      END IF;
    END IF;

    SELECT
      count(*) FILTER (WHERE status = 'Present'),
      count(*) FILTER (WHERE status = 'Leave'),
      count(*) FILTER (WHERE status = 'Absent')
    INTO v_present, v_leave, v_absent
    FROM public.attendance
    WHERE employee_id = v_emp.id AND date >= v_start_date AND date <= v_end_date;

    v_present := coalesce(v_present, 0);
    v_leave := coalesce(v_leave, 0);
    v_absent := coalesce(v_absent, 0);

    IF v_settings.absent_counts_as_leave THEN
      v_deductible := v_leave + v_absent;
    ELSE
      v_deductible := v_leave;
    END IF;

    v_calc := public.calculate_payroll(v_emp.monthly_salary, v_deductible, v_settings.days_basis, v_settings.bonus_enabled);
    -- Newer calculate_payroll() versions report the deductible days themselves.
    v_deductible := coalesce((v_calc->>'deductible_days')::int, v_deductible);

    IF v_existing.id IS NOT NULL THEN
      UPDATE public.payroll_records SET
        monthly_salary = v_emp.monthly_salary,
        daily_salary = (v_calc->>'daily_salary')::numeric,
        days_basis = v_settings.days_basis,
        present_days = v_present,
        absent_days = v_absent,
        leave_days = v_leave,
        deductible_days = v_deductible,
        deduction = (v_calc->>'deduction')::numeric,
        bonus = (v_calc->>'bonus')::numeric,
        final_salary = (v_calc->>'final_salary')::numeric,
        balance = (v_calc->>'final_salary')::numeric - paid_total,
        status = 'DRAFT',
        updated_at = now()
      WHERE id = v_existing.id;
      v_replaced := v_replaced + 1;
    ELSE
      INSERT INTO public.payroll_records (
        employee_id, month, year, monthly_salary, daily_salary, days_basis,
        present_days, absent_days, leave_days, deductible_days,
        deduction, bonus, final_salary, balance, status
      ) VALUES (
        v_emp.id, p_month, p_year, v_emp.monthly_salary, (v_calc->>'daily_salary')::numeric, v_settings.days_basis,
        v_present, v_absent, v_leave, v_deductible,
        (v_calc->>'deduction')::numeric, (v_calc->>'bonus')::numeric, (v_calc->>'final_salary')::numeric,
        (v_calc->>'final_salary')::numeric, 'DRAFT'
      );
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'replaced', v_replaced, 'skipped', v_skipped);
END;
$$;

-- 2c. payroll_finalize: keeps the "month must have ended" guard; a manager only finalizes
--     (and is only told about) their own shift's records.
CREATE OR REPLACE FUNCTION public.payroll_finalize(p_month integer, p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_finalized int := 0;
  v_not_finalized int := 0;
  v_actor text := 'Station Manager';
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_last_day date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLOW:NOT_SIGNED_IN'; END IF;
  IF p_month IS NULL OR p_year IS NULL OR p_month NOT BETWEEN 1 AND 12 OR p_year < 2020 THEN
    RAISE EXCEPTION 'FLOW:INVALID_PERIOD';
  END IF;

  v_last_day := (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
  IF v_today <= v_last_day THEN
    RAISE EXCEPTION 'FLOW:MONTH_NOT_ENDED'
      USING ERRCODE = 'P0001',
            DETAIL  = 'Payroll can only be finalized after the month has ended, so attendance stays open for the whole month.';
  END IF;

  UPDATE public.payroll_records pr SET
    status = 'FINALIZED',
    locked = true,
    finalized_at = now(),
    finalized_by_name = v_actor,
    updated_at = now()
  WHERE pr.month = p_month AND pr.year = p_year AND pr.status = 'APPROVED'
    AND public.payroll_scope_ok(pr.employee_id);

  GET DIAGNOSTICS v_finalized = ROW_COUNT;

  SELECT count(*) INTO v_not_finalized
  FROM public.payroll_records pr
  WHERE pr.month = p_month AND pr.year = p_year AND pr.status != 'FINALIZED'
    AND public.payroll_scope_ok(pr.employee_id);

  RETURN jsonb_build_object('finalized', v_finalized, 'not_finalized', v_not_finalized);
END;
$$;

-- 2d. Per-record and list RPCs: keep the existing function as "_core" and put a scope check in front.
--     (Renaming keeps this file independent of the exact body of each function.)
DO $$
BEGIN
  IF to_regprocedure('public._payroll_get_core(uuid)') IS NULL
     AND to_regprocedure('public.payroll_get(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.payroll_get(uuid) RENAME TO _payroll_get_core;
  END IF;
  IF to_regprocedure('public._payroll_review_core(uuid,text,text)') IS NULL
     AND to_regprocedure('public.payroll_review(uuid,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.payroll_review(uuid, text, text) RENAME TO _payroll_review_core;
  END IF;
  IF to_regprocedure('public._payroll_record_payment_core(uuid,numeric,date,text,text,text)') IS NULL
     AND to_regprocedure('public.payroll_record_payment(uuid,numeric,date,text,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.payroll_record_payment(uuid, numeric, date, text, text, text) RENAME TO _payroll_record_payment_core;
  END IF;
  IF to_regprocedure('public._payroll_payment_history_core(integer,integer,uuid)') IS NULL
     AND to_regprocedure('public.payroll_payment_history(integer,integer,uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.payroll_payment_history(integer, integer, uuid) RENAME TO _payroll_payment_history_core;
  END IF;
  IF to_regprocedure('public._payroll_recalc_core(uuid,integer,integer,text,text)') IS NULL
     AND to_regprocedure('public.payroll_recalculate_for_correction(uuid,integer,integer,text,text)') IS NOT NULL THEN
    ALTER FUNCTION public.payroll_recalculate_for_correction(uuid, integer, integer, text, text) RENAME TO _payroll_recalc_core;
  END IF;
  IF to_regprocedure('public._payroll_audit_summary_core(integer)') IS NULL
     AND to_regprocedure('public.payroll_audit_summary(integer)') IS NOT NULL THEN
    ALTER FUNCTION public.payroll_audit_summary(integer) RENAME TO _payroll_audit_summary_core;
  END IF;
END $$;

-- The renamed cores are internal: only the scoped wrappers below (SECURITY DEFINER) call them.
DO $$
DECLARE sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public._payroll_get_core(uuid)',
    'public._payroll_review_core(uuid,text,text)',
    'public._payroll_record_payment_core(uuid,numeric,date,text,text,text)',
    'public._payroll_payment_history_core(integer,integer,uuid)',
    'public._payroll_recalc_core(uuid,integer,integer,text,text)',
    'public._payroll_audit_summary_core(integer)'
  ] LOOP
    -- Skipped when that payroll module was never installed.
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.payroll_get(p_payroll_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp uuid;
BEGIN
  SELECT employee_id INTO v_emp FROM public.payroll_records WHERE id = p_payroll_id;
  IF FOUND THEN PERFORM public._payroll_require_scope(v_emp);
  ELSIF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLOW:NOT_SIGNED_IN';
  END IF;
  RETURN public._payroll_get_core(p_payroll_id);
END $$;

CREATE OR REPLACE FUNCTION public.payroll_review(p_payroll_id uuid, p_decision text, p_note text DEFAULT null)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp uuid;
BEGIN
  SELECT employee_id INTO v_emp FROM public.payroll_records WHERE id = p_payroll_id;
  IF FOUND THEN PERFORM public._payroll_require_scope(v_emp);
  ELSIF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLOW:NOT_SIGNED_IN';
  END IF;
  RETURN public._payroll_review_core(p_payroll_id, p_decision, p_note);
END $$;

CREATE OR REPLACE FUNCTION public.payroll_record_payment(
  p_payroll_id uuid, p_amount numeric, p_payment_date date, p_method text,
  p_reference text DEFAULT null, p_note text DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp uuid;
BEGIN
  SELECT employee_id INTO v_emp FROM public.payroll_records WHERE id = p_payroll_id;
  IF FOUND THEN PERFORM public._payroll_require_scope(v_emp);
  ELSIF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLOW:NOT_SIGNED_IN';
  END IF;
  RETURN public._payroll_record_payment_core(p_payroll_id, p_amount, p_payment_date, p_method, p_reference, p_note);
END $$;

CREATE OR REPLACE FUNCTION public.payroll_payment_history(
  p_month integer DEFAULT null, p_year integer DEFAULT null, p_employee_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLOW:NOT_SIGNED_IN'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(x.item ORDER BY x.ord)
    FROM jsonb_array_elements(public._payroll_payment_history_core(p_month, p_year, p_employee_id))
         WITH ORDINALITY AS x(item, ord)
    WHERE public.payroll_scope_ok((x.item->>'employee_id')::uuid)
  ), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.payroll_recalculate_for_correction(
  p_employee_id uuid, p_month int, p_year int, p_reason text, p_actor text DEFAULT 'Station Manager'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._payroll_require_scope(p_employee_id);
  RETURN public._payroll_recalc_core(p_employee_id, p_month, p_year, p_reason, p_actor);
END $$;

CREATE OR REPLACE FUNCTION public.payroll_audit_summary(p_limit int DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FLOW:NOT_SIGNED_IN'; END IF;
  -- Read a wide window, then keep this caller's own scope and apply the limit.
  RETURN coalesce((
    SELECT jsonb_agg(y.item ORDER BY y.ord)
    FROM (
      SELECT x.item, x.ord
      FROM jsonb_array_elements(public._payroll_audit_summary_core(greatest(coalesce(p_limit, 50), 1) * 20))
           WITH ORDINALITY AS x(item, ord)
      WHERE public.payroll_scope_ok((x.item->>'employee_id')::uuid)
      ORDER BY x.ord
      LIMIT greatest(coalesce(p_limit, 50), 1)
    ) y
  ), '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.payroll_list(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_generate(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_finalize(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_get(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_review(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_record_payment(uuid, numeric, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_payment_history(integer, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_recalculate_for_correction(uuid, integer, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_audit_summary(integer) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. Check (read-only): every manager must show a shift, otherwise they see nothing.
-- ---------------------------------------------------------------------
SELECT u.email, p.role::text AS role, s.name AS assigned_shift
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN public.shifts s ON s.id = p.shift_id
WHERE p.role::text IN ('manager', 'owner', 'admin')
ORDER BY p.role::text, u.email;
