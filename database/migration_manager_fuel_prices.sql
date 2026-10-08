-- Managers can now view and change fuel prices (same as Owner/Admin).
-- Run once in the Supabase SQL editor on an existing database.
-- Prices live in one shared table (fuel_types + fuel_price_history/schedule), so a change made by
-- Owner, Manager 1 or Manager 2 is the single source of truth and shows up for all of them.
-- Managers still do NOT get 'view_sales' (revenue stays Owner/Admin only).

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
