-- Re-opens a payroll month that was finalized too early (e.g. October finalized on 9 Oct while the month is still running).
-- What it does, for the month set below:
--   * status FINALIZED -> DRAFT and locked true -> false, so attendance can be saved again
--   * keeps every payment already recorded (paid_total is untouched) and recomputes balance = final_salary - paid_total
--   * writes one audit row per employee so the re-open is visible in the Payroll Audit Trail
-- After this: finish the month's attendance, press "Generate Payroll Batch" again, approve, then finalize at month end.
-- Run once in the Supabase SQL editor. Change the two numbers if you need another month.

DO $$
DECLARE
  v_month int := 10;
  v_year  int := 2026;
  v_count int;
BEGIN
  INSERT INTO public.payroll_audit_log (payroll_id, action, actor_name, old_values, new_values, note)
  SELECT pr.id, 'REOPENED', 'Owner (SQL)',
         jsonb_build_object('status', pr.status, 'locked', pr.locked),
         jsonb_build_object('status', 'DRAFT', 'locked', false),
         'Payroll re-opened: month was finalized before it ended'
  FROM public.payroll_records pr
  WHERE pr.month = v_month AND pr.year = v_year AND (pr.locked OR pr.status = 'FINALIZED');

  UPDATE public.payroll_records
  SET status = 'DRAFT',
      locked = false,
      finalized_at = NULL,
      finalized_by_name = NULL,
      balance = final_salary - paid_total,
      updated_at = now()
  WHERE month = v_month AND year = v_year AND (locked OR status = 'FINALIZED');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Re-opened % payroll record(s) for %/%', v_count, v_month, v_year;
END $$;

-- Check: every row should now show DRAFT / false.
select e.full_name, pr.status, pr.locked, pr.paid_total, pr.balance
from public.payroll_records pr join public.employees e on e.id = pr.employee_id
where pr.month = 10 and pr.year = 2026
order by e.full_name;
