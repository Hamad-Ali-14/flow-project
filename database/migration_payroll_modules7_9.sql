-- =====================================================================
-- FLOW OPS: Modules 7–9 — Payroll Generation, Approval, Finalization & Payments
-- Migration: Creates payroll_records, payroll_payments, payroll_audit_log,
-- payroll_settings, stored calculation engine, and RPCs for Supabase.
-- Safe to re-run in Supabase SQL editor.
-- =====================================================================

-- 1. Payroll Settings
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  days_basis integer NOT NULL DEFAULT 30,
  absent_counts_as_leave boolean NOT NULL DEFAULT true,
  bonus_enabled boolean NOT NULL DEFAULT true,
  bonus_requires_complete_attendance boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.payroll_settings (days_basis, absent_counts_as_leave, bonus_enabled, bonus_requires_complete_attendance)
SELECT 30, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.payroll_settings);

-- 2. Payroll Records (Modules 7 & 8)
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year >= 2020),
  monthly_salary numeric(14,2) NOT NULL DEFAULT 0,
  daily_salary numeric(14,2) NOT NULL DEFAULT 0,
  days_basis integer NOT NULL DEFAULT 30,
  present_days integer NOT NULL DEFAULT 0,
  absent_days integer NOT NULL DEFAULT 0,
  leave_days integer NOT NULL DEFAULT 0,
  unmarked_days integer NOT NULL DEFAULT 0,
  deductible_days integer NOT NULL DEFAULT 0,
  deduction numeric(14,2) NOT NULL DEFAULT 0,
  bonus numeric(14,2) NOT NULL DEFAULT 0,
  bonus_withheld_reason text,
  final_salary numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'REJECTED', 'FINALIZED')),
  locked boolean NOT NULL DEFAULT false,
  review_note text,
  reviewed_at timestamptz,
  reviewed_by_name text,
  finalized_at timestamptz,
  finalized_by_name text,
  version integer NOT NULL DEFAULT 1,
  paid_total numeric(14,2) NOT NULL DEFAULT 0,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIAL', 'PAID')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_employee_payroll_period UNIQUE (employee_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_payroll_records_period ON public.payroll_records (year, month);
CREATE INDEX IF NOT EXISTS idx_payroll_records_employee ON public.payroll_records (employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_status ON public.payroll_records (status);

-- 3. Payroll Payments (Module 9 Ledger)
CREATE TABLE IF NOT EXISTS public.payroll_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id uuid NOT NULL REFERENCES public.payroll_records(id) ON DELETE CASCADE,
  paid_amount numeric(14,2) NOT NULL CHECK (paid_amount > 0),
  payment_date date NOT NULL,
  method text NOT NULL CHECK (method IN ('cash', 'bank_transfer', 'cheque', 'mobile_wallet')),
  reference text,
  note text,
  status text NOT NULL DEFAULT 'COMPLETED',
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_payments_payroll ON public.payroll_payments (payroll_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_date ON public.payroll_payments (payment_date);

-- 4. Payroll Audit Trail
CREATE TABLE IF NOT EXISTS public.payroll_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id uuid NOT NULL REFERENCES public.payroll_records(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_name text,
  at timestamptz NOT NULL DEFAULT now(),
  old_values jsonb,
  new_values jsonb,
  note text
);

CREATE INDEX IF NOT EXISTS idx_payroll_audit_payroll ON public.payroll_audit_log (payroll_id);

-- 5. RLS Policies
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_settings_read" ON public.payroll_settings;
CREATE POLICY "payroll_settings_read" ON public.payroll_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "payroll_records_read" ON public.payroll_records;
CREATE POLICY "payroll_records_read" ON public.payroll_records FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "payroll_payments_read" ON public.payroll_payments;
CREATE POLICY "payroll_payments_read" ON public.payroll_payments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "payroll_audit_read" ON public.payroll_audit_log;
CREATE POLICY "payroll_audit_read" ON public.payroll_audit_log FOR SELECT TO authenticated USING (true);

-- 6. RPC: calculate_payroll
CREATE OR REPLACE FUNCTION public.calculate_payroll(
  p_monthly_salary numeric,
  p_deductible_days integer,
  p_days_basis integer DEFAULT 30,
  p_bonus_allowed boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_salary_paisa bigint;
  v_daily_paisa bigint;
  v_bonus_paisa bigint := 0;
  v_deduction_paisa bigint := 0;
  v_final_paisa bigint;
BEGIN
  IF p_monthly_salary < 0 OR p_deductible_days < 0 OR p_days_basis < 1 THEN
    RAISE EXCEPTION 'FLOW:INVALID_INPUT';
  END IF;

  v_salary_paisa := round(p_monthly_salary * 100)::bigint;
  v_daily_paisa := round(v_salary_paisa::numeric / p_days_basis)::bigint;

  IF p_deductible_days = 0 THEN
    IF p_bonus_allowed THEN
      v_bonus_paisa := v_daily_paisa;
    END IF;
  ELSE
    v_deduction_paisa := least(round((p_deductible_days * v_salary_paisa)::numeric / p_days_basis)::bigint, v_salary_paisa);
  END IF;

  v_final_paisa := greatest(0::bigint, v_salary_paisa + v_bonus_paisa - v_deduction_paisa);

  RETURN jsonb_build_object(
    'daily_salary', (v_daily_paisa::numeric / 100),
    'deduction', (v_deduction_paisa::numeric / 100),
    'bonus', (v_bonus_paisa::numeric / 100),
    'final_salary', (v_final_paisa::numeric / 100)
  );
END;
$$;

-- 7. RPC: payroll_list
CREATE OR REPLACE FUNCTION public.payroll_list(p_month integer, p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings jsonb;
  v_rows jsonb;
  v_summary jsonb;
  v_missing jsonb;
BEGIN
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
  WHERE pr.month = p_month AND pr.year = p_year;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.full_name)), '[]'::jsonb)
  INTO v_missing
  FROM public.employees e
  WHERE e.active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.payroll_records pr
      WHERE pr.employee_id = e.id AND pr.month = p_month AND pr.year = p_year
    );

  SELECT jsonb_build_object(
    'count', count(*),
    'draft', count(*) FILTER (WHERE status = 'DRAFT'),
    'approved', count(*) FILTER (WHERE status = 'APPROVED'),
    'rejected', count(*) FILTER (WHERE status = 'REJECTED'),
    'finalized', count(*) FILTER (WHERE status = 'FINALIZED'),
    'total_base', coalesce(sum(monthly_salary), 0),
    'total_bonus', coalesce(sum(bonus), 0),
    'total_deduction', coalesce(sum(deduction), 0),
    'total_payable', coalesce(sum(final_salary), 0),
    'total_paid', coalesce(sum(paid_total), 0),
    'missing_employees', v_missing
  ) INTO v_summary
  FROM public.payroll_records
  WHERE month = p_month AND year = p_year;

  RETURN jsonb_build_object(
    'month', p_month,
    'year', p_year,
    'settings', v_settings,
    'rows', v_rows,
    'summary', v_summary
  );
END;
$$;

-- 8. RPC: payroll_generate
CREATE OR REPLACE FUNCTION public.payroll_generate(p_month integer, p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
  IF p_month < 1 OR p_month > 12 OR p_year < 2020 THEN
    RAISE EXCEPTION 'FLOW:INVALID_PERIOD';
  END IF;

  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (v_start_date + interval '1 month - 1 day')::date;

  SELECT * INTO v_settings FROM public.payroll_settings LIMIT 1;

  FOR v_emp IN SELECT * FROM public.employees WHERE active = true ORDER BY full_name LOOP
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

-- 9. RPC: payroll_get
CREATE OR REPLACE FUNCTION public.payroll_get(p_payroll_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec record;
  v_payments jsonb;
  v_audit jsonb;
  v_non_present jsonb;
  v_start_date date;
  v_end_date date;
BEGIN
  SELECT pr.*, e.full_name as employee_name, e.designation, coalesce(s.name, 'Shift 1 - Day') as shift_name
  INTO v_rec
  FROM public.payroll_records pr
  JOIN public.employees e ON e.id = pr.employee_id
  LEFT JOIN public.shifts s ON s.id = e.shift_id
  WHERE pr.id = p_payroll_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FLOW:PAYROLL_NOT_FOUND';
  END IF;

  v_start_date := make_date(v_rec.year, v_rec.month, 1);
  v_end_date := (v_start_date + interval '1 month - 1 day')::date;

  SELECT coalesce(jsonb_agg(jsonb_build_object('date', date, 'status', status)), '[]'::jsonb)
  INTO v_non_present
  FROM public.attendance
  WHERE employee_id = v_rec.employee_id AND date >= v_start_date AND date <= v_end_date AND status != 'Present';

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'payroll_id', p.payroll_id,
      'employee_id', v_rec.employee_id,
      'employee_name', v_rec.employee_name,
      'month', v_rec.month,
      'year', v_rec.year,
      'final_salary', v_rec.final_salary,
      'paid_amount', p.paid_amount,
      'payment_date', p.payment_date,
      'method', p.method,
      'reference', p.reference,
      'note', p.note,
      'status', p.status,
      'created_by_name', p.created_by_name,
      'created_at', p.created_at
    ) ORDER BY p.created_at DESC
  ), '[]'::jsonb) INTO v_payments
  FROM public.payroll_payments p
  WHERE p.payroll_id = p_payroll_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'action', a.action,
      'actor_name', a.actor_name,
      'at', a.at,
      'old_values', a.old_values,
      'new_values', a.new_values,
      'note', a.note
    ) ORDER BY a.at DESC
  ), '[]'::jsonb) INTO v_audit
  FROM public.payroll_audit_log a
  WHERE a.payroll_id = p_payroll_id;

  RETURN jsonb_build_object(
    'id', v_rec.id,
    'employee_id', v_rec.employee_id,
    'employee_name', v_rec.employee_name,
    'designation', v_rec.designation,
    'shift_name', v_rec.shift_name,
    'month', v_rec.month,
    'year', v_rec.year,
    'monthly_salary', v_rec.monthly_salary,
    'daily_salary', v_rec.daily_salary,
    'days_basis', v_rec.days_basis,
    'present_days', v_rec.present_days,
    'absent_days', v_rec.absent_days,
    'leave_days', v_rec.leave_days,
    'unmarked_days', v_rec.unmarked_days,
    'deductible_days', v_rec.deductible_days,
    'deduction', v_rec.deduction,
    'bonus', v_rec.bonus,
    'bonus_withheld_reason', v_rec.bonus_withheld_reason,
    'final_salary', v_rec.final_salary,
    'status', v_rec.status,
    'locked', v_rec.locked,
    'review_note', v_rec.review_note,
    'reviewed_at', v_rec.reviewed_at,
    'reviewed_by_name', v_rec.reviewed_by_name,
    'finalized_at', v_rec.finalized_at,
    'finalized_by_name', v_rec.finalized_by_name,
    'version', v_rec.version,
    'paid_total', v_rec.paid_total,
    'balance', v_rec.balance,
    'payment_status', v_rec.payment_status,
    'non_present_days', v_non_present,
    'payments', v_payments,
    'audit', v_audit
  );
END;
$$;

-- 10. RPC: payroll_review
CREATE OR REPLACE FUNCTION public.payroll_review(p_payroll_id uuid, p_decision text, p_note text DEFAULT null)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec record;
  v_old_status text;
  v_actor text := 'Station Manager';
BEGIN
  IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'FLOW:INVALID_STATE';
  END IF;

  SELECT * INTO v_rec FROM public.payroll_records WHERE id = p_payroll_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FLOW:PAYROLL_NOT_FOUND';
  END IF;
  IF v_rec.locked THEN
    RAISE EXCEPTION 'FLOW:PAYROLL_LOCKED';
  END IF;

  v_old_status := v_rec.status;

  UPDATE public.payroll_records SET
    status = p_decision,
    review_note = p_note,
    reviewed_at = now(),
    reviewed_by_name = v_actor,
    updated_at = now()
  WHERE id = p_payroll_id;

  INSERT INTO public.payroll_audit_log (payroll_id, action, actor_name, old_values, new_values, note)
  VALUES (
    p_payroll_id,
    'REVIEW_' || p_decision,
    v_actor,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_decision),
    p_note
  );

  RETURN (SELECT public.payroll_get(p_payroll_id));
END;
$$;

-- 11. RPC: payroll_finalize
CREATE OR REPLACE FUNCTION public.payroll_finalize(p_month integer, p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_finalized int := 0;
  v_not_finalized int := 0;
  v_actor text := 'Station Manager';
BEGIN
  UPDATE public.payroll_records SET
    status = 'FINALIZED',
    locked = true,
    finalized_at = now(),
    finalized_by_name = v_actor,
    updated_at = now()
  WHERE month = p_month AND year = p_year AND status = 'APPROVED';

  GET DIAGNOSTICS v_finalized = ROW_COUNT;

  SELECT count(*) INTO v_not_finalized
  FROM public.payroll_records
  WHERE month = p_month AND year = p_year AND status != 'FINALIZED';

  RETURN jsonb_build_object('finalized', v_finalized, 'not_finalized', v_not_finalized);
END;
$$;

-- 12. RPC: payroll_record_payment
CREATE OR REPLACE FUNCTION public.payroll_record_payment(
  p_payroll_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference text DEFAULT null,
  p_note text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec record;
  v_new_paid numeric;
  v_new_balance numeric;
  v_new_pay_status text;
  v_actor text := 'Station Manager';
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'FLOW:INVALID_AMOUNT';
  END IF;

  SELECT * INTO v_rec FROM public.payroll_records WHERE id = p_payroll_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FLOW:PAYROLL_NOT_FOUND';
  END IF;
  IF v_rec.status != 'FINALIZED' THEN
    RAISE EXCEPTION 'FLOW:PAYROLL_NOT_FINALIZED';
  END IF;
  IF p_amount > v_rec.balance THEN
    RAISE EXCEPTION 'FLOW:OVERPAYMENT' USING detail = jsonb_build_object('balance', v_rec.balance)::text;
  END IF;

  INSERT INTO public.payroll_payments (
    payroll_id, paid_amount, payment_date, method, reference, note, created_by_name
  ) VALUES (
    p_payroll_id, p_amount, p_payment_date, p_method, p_reference, p_note, v_actor
  );

  v_new_paid := v_rec.paid_total + p_amount;
  v_new_balance := v_rec.final_salary - v_new_paid;
  IF v_new_balance <= 0 THEN
    v_new_pay_status := 'PAID';
  ELSE
    v_new_pay_status := 'PARTIAL';
  END IF;

  UPDATE public.payroll_records SET
    paid_total = v_new_paid,
    balance = v_new_balance,
    payment_status = v_new_pay_status,
    updated_at = now()
  WHERE id = p_payroll_id;

  INSERT INTO public.payroll_audit_log (payroll_id, action, actor_name, old_values, new_values, note)
  VALUES (
    p_payroll_id,
    'RECORD_PAYMENT',
    v_actor,
    jsonb_build_object('paid_total', v_rec.paid_total, 'balance', v_rec.balance, 'payment_status', v_rec.payment_status),
    jsonb_build_object('paid_total', v_new_paid, 'balance', v_new_balance, 'payment_status', v_new_pay_status),
    p_note
  );

  RETURN (SELECT public.payroll_get(p_payroll_id));
END;
$$;

-- 13. RPC: payroll_payment_history
CREATE OR REPLACE FUNCTION public.payroll_payment_history(
  p_month integer DEFAULT null,
  p_year integer DEFAULT null,
  p_employee_id uuid DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'payroll_id', p.payroll_id,
        'employee_id', pr.employee_id,
        'employee_name', e.full_name,
        'month', pr.month,
        'year', pr.year,
        'final_salary', pr.final_salary,
        'paid_amount', p.paid_amount,
        'payment_date', p.payment_date,
        'method', p.method,
        'reference', p.reference,
        'note', p.note,
        'status', p.status,
        'created_by_name', p.created_by_name,
        'created_at', p.created_at
      ) ORDER BY p.created_at DESC
    )
    FROM public.payroll_payments p
    JOIN public.payroll_records pr ON pr.id = p.payroll_id
    JOIN public.employees e ON e.id = pr.employee_id
    WHERE (p_month IS NULL OR pr.month = p_month)
      AND (p_year IS NULL OR pr.year = p_year)
      AND (p_employee_id IS NULL OR pr.employee_id = p_employee_id)
  ), '[]'::jsonb);
END;
$$;
