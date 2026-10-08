-- Adds a rolling last-30-days bucket (`last30`) to get_sales_summary().
-- Run once in the Supabase SQL Editor. Safe to re-run. Permissions are unchanged.

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
      AND f.created_at >= (least(v_pmo, v_wk - 7, v_today - 59)::timestamp) AT TIME ZONE 'Asia/Karachi'
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
      'prev_litres', coalesce(sum(litres) FILTER (WHERE d BETWEEN v_pmo AND v_pmo_end), 0)),
    -- rolling last 30 days (today included) vs the 30 days before: drives "Monthly" on the Overview page
    'last30', jsonb_build_object(
      'revenue', coalesce(sum(amount) FILTER (WHERE d BETWEEN v_today - 29 AND v_today), 0),
      'litres', coalesce(sum(litres) FILTER (WHERE d BETWEEN v_today - 29 AND v_today), 0),
      'prev_revenue', coalesce(sum(amount) FILTER (WHERE d BETWEEN v_today - 59 AND v_today - 30), 0),
      'prev_litres', coalesce(sum(litres) FILTER (WHERE d BETWEEN v_today - 59 AND v_today - 30), 0))
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
