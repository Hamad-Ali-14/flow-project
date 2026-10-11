-- =====================================================================
-- FLOW OPS: Shift closing -> 12-hour stock reconciliation ledger
--
-- Why this exists:
--   public.fuel_transactions has row level security ENABLED and no SELECT policy, so the
--   browser can never read it directly. The old ledger query therefore saw no purchases and
--   no sales, ordered shifts by shift_number (1,2,1,2...) instead of by time and cut the list
--   at 10 rows, and hard-coded "Hamza Raza" / "Fahad Iqbal" as the assigned person. Result:
--   wrong numbers, a closed Shift 1 that did not show up, one person on every row.
--
-- What it adds:
--   public.get_shift_ledger_data(p_start date, p_end date)
--     -> { shifts, transactions, live_total, supervisors, managers }
--   The app turns that into the reconciliation table (src/utils/shiftReconciliation.js):
--     Total stock   = Opening stock + Purchases (fuel received while the shift ran)
--     Closing stock = Total stock - 12-hour sales
--     Opening stock = previous shift's closing stock (derived from the append-only ledger)
--
-- The running shift is always returned. Closed shifts are returned when they overlap the
-- [p_start, p_end] Karachi calendar range (NULL = unbounded). Transactions are returned from
-- the earliest returned shift's start until now, because opening stock is derived from them.
--
-- Read-only and SECURITY DEFINER; requires the same 'view_tanks' permission as the tanks
-- page. Safe to run more than once. Run in the Supabase SQL editor.
-- =====================================================================

-- Manager accounts are assigned to a shift through profiles.shift_id (also used by the
-- Attendance / Payroll access rules, see migration_rbac_shift_scope.sql).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id);

CREATE OR REPLACE FUNCTION public.get_shift_ledger_data(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := public._inventory_require('view_tanks');
  v_from timestamptz := CASE WHEN p_start IS NULL THEN NULL ELSE (p_start::timestamp) AT TIME ZONE 'Asia/Karachi' END;
  v_to   timestamptz := CASE WHEN p_end   IS NULL THEN NULL ELSE ((p_end + 1)::timestamp) AT TIME ZONE 'Asia/Karachi' END;
  v_earliest timestamptz;
  v_shifts jsonb;
BEGIN
  WITH picked AS (
    SELECT s.*
    FROM public.shift_closings s
    WHERE s.status = 'open'
       OR ((v_from IS NULL OR s.closed_at >= v_from) AND (v_to IS NULL OR s.opened_at < v_to))
    ORDER BY s.opened_at DESC
    LIMIT 400
  )
  SELECT min(p.opened_at),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'shift_number', p.shift_number,
           'business_date', p.business_date,
           'status', p.status::text,
           'opened_at', p.opened_at,
           'closed_at', p.closed_at,
           'opening_cash', p.opening_cash,
           'closing_cash', p.closing_cash,
           'closed_by', p.closed_by,
           'closedByName', cb.full_name,
           'openedByName', ob.full_name
         ) ORDER BY p.opened_at DESC), '[]'::jsonb)
  INTO v_earliest, v_shifts
  FROM picked p
  LEFT JOIN public.profiles cb ON cb.id = p.closed_by
  LEFT JOIN public.profiles ob ON ob.id = p.opened_by;

  RETURN jsonb_build_object(
    'shifts', v_shifts,
    'transactions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'transaction_type', x.transaction_type,
               'quantity_litres', x.quantity_litres,
               'created_at', x.created_at,
               'shift_closing_id', x.shift_closing_id,
               'nozzle_id', x.nozzle_id
             ) ORDER BY x.created_at)
      FROM public.fuel_transactions x
      JOIN public.tanks t ON t.id = x.tank_id AND t.active
      WHERE v_earliest IS NOT NULL AND x.created_at >= v_earliest
    ), '[]'::jsonb),
    'live_total', coalesce((SELECT sum(t.current_stock_litres) FROM public.tanks t WHERE t.active), 0),
    -- Who is "assigned" to a shift: its Shift Supervisor (employee), else the manager account
    -- whose profile is assigned to that shift. Never one fixed person.
    'supervisors', jsonb_build_object(
      '1', (SELECT e.full_name FROM public.employees e JOIN public.shifts sh ON sh.id = e.shift_id
            WHERE e.active AND e.designation ILIKE '%supervisor%' AND (sh.name ILIKE '%day%' OR sh.name ILIKE '%shift 1%')
            ORDER BY e.full_name LIMIT 1),
      '2', (SELECT e.full_name FROM public.employees e JOIN public.shifts sh ON sh.id = e.shift_id
            WHERE e.active AND e.designation ILIKE '%supervisor%' AND (sh.name ILIKE '%night%' OR sh.name ILIKE '%shift 2%')
            ORDER BY e.full_name LIMIT 1)
    ),
    'managers', jsonb_build_object(
      '1', (SELECT p.full_name FROM public.profiles p JOIN public.shifts sh ON sh.id = p.shift_id
            WHERE p.active AND p.role::text = 'manager' AND (sh.name ILIKE '%day%' OR sh.name ILIKE '%shift 1%')
            ORDER BY p.full_name LIMIT 1),
      '2', (SELECT p.full_name FROM public.profiles p JOIN public.shifts sh ON sh.id = p.shift_id
            WHERE p.active AND p.role::text = 'manager' AND (sh.name ILIKE '%night%' OR sh.name ILIKE '%shift 2%')
            ORDER BY p.full_name LIMIT 1)
    )
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_shift_ledger_data(date, date) TO authenticated;
