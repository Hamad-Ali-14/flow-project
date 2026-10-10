-- =====================================================================
-- FLOW OPS: Payroll can only be finalized AFTER the month has ended
--
-- Why: payroll_finalize() used to lock a month at any time. Finalizing
-- October on 10 Oct locked every approved employee's attendance for the
-- whole month, so owners/managers got "payroll finalized and locked" while
-- marking attendance for the days that were still to come.
--
-- Now: finalizing is refused until the month is over (Pakistan time,
-- Asia/Karachi). Attendance for the running month therefore can never be
-- locked by accident. Everything else in the function is unchanged.
--
-- Safe to re-run (CREATE OR REPLACE only; no tables or data touched).
-- =====================================================================
 
CREATE OR REPLACE FUNCTION public.payroll_finalize(p_month integer, p_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_finalized int := 0;
  v_not_finalized int := 0;
  v_actor text := 'Station Manager';
  v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_last_day date;
BEGIN
  IF p_month IS NULL OR p_year IS NULL OR p_month NOT BETWEEN 1 AND 12 OR p_year < 2020 THEN
    RAISE EXCEPTION 'FLOW:INVALID_PERIOD';
  END IF;
 
  v_last_day := (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
  IF v_today <= v_last_day THEN
    RAISE EXCEPTION 'FLOW:MONTH_NOT_ENDED'
      USING ERRCODE = 'P0001',
            DETAIL  = 'Payroll can only be finalized after the month has ended, so attendance stays open for the whole month.';
  END IF;
 
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