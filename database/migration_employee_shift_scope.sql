-- =====================================================================
-- Employees & salaries: shift-wise access for Manager accounts
--   user1 (Morning Manager) -> Shift 1 - Day employees only
--   user2 (Night Manager)   -> Shift 2 - Night employees only
--   owner / admin           -> all shifts (Day, Night, General)
-- Safe to run more than once. Run in the Supabase SQL editor.
-- Requires the shifts "Shift 1 - Day" / "Shift 2 - Night" (see inserts.sql).
-- =====================================================================

-- Shift assignment for staff (used to scope Employees & salaries for Manager accounts).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id);

-- May the signed-in user see / write an employee that belongs to p_shift?
--   owner / admin : every employee (any shift, including General = NULL shift)
--   manager       : only employees of the manager's own assigned shift
--   everyone else : nobody
-- SECURITY DEFINER so the check can read the caller's profile without RLS recursion.
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

-- Employees & salaries are shift-scoped (see public.employee_scope_ok).
DROP POLICY IF EXISTS "authenticated staff can read employees"   ON public.employees;
DROP POLICY IF EXISTS "authenticated staff can insert employees" ON public.employees;
DROP POLICY IF EXISTS "authenticated staff can update employees" ON public.employees;
DROP POLICY IF EXISTS "authenticated staff can read salary_payments" ON public.salary_payments;

DROP POLICY IF EXISTS "employees_select_by_shift" ON public.employees;
CREATE POLICY "employees_select_by_shift" ON public.employees
  FOR SELECT TO authenticated USING (public.employee_scope_ok(shift_id));

DROP POLICY IF EXISTS "employees_insert_by_shift" ON public.employees;
CREATE POLICY "employees_insert_by_shift" ON public.employees
  FOR INSERT TO authenticated WITH CHECK (public.employee_scope_ok(shift_id));

-- USING gates which rows can be edited; WITH CHECK stops moving an employee to another shift.
DROP POLICY IF EXISTS "employees_update_by_shift" ON public.employees;
CREATE POLICY "employees_update_by_shift" ON public.employees
  FOR UPDATE TO authenticated
  USING (public.employee_scope_ok(shift_id))
  WITH CHECK (public.employee_scope_ok(shift_id));

DROP POLICY IF EXISTS "salary_payments_select_by_shift" ON public.salary_payments;
CREATE POLICY "salary_payments_select_by_shift" ON public.salary_payments
  FOR SELECT TO authenticated
  USING (public.employee_scope_ok((SELECT e.shift_id FROM public.employees e WHERE e.id = employee_id)));

-- Assign the two manager accounts to their shift (role is NOT changed; only existing managers).
UPDATE public.profiles p
SET shift_id = (SELECT id FROM public.shifts WHERE name = 'Shift 1 - Day' ORDER BY id LIMIT 1)
FROM auth.users u
WHERE u.id = p.id AND p.role::text = 'manager' AND lower(split_part(u.email, '@', 1)) = 'user1';

UPDATE public.profiles p
SET shift_id = (SELECT id FROM public.shifts WHERE name = 'Shift 2 - Night' ORDER BY id LIMIT 1)
FROM auth.users u
WHERE u.id = p.id AND p.role::text = 'manager' AND lower(split_part(u.email, '@', 1)) = 'user2';

-- Check: every manager should show a shift here.
SELECT u.email, p.role::text AS role, s.name AS assigned_shift
FROM public.profiles p JOIN auth.users u ON u.id = p.id LEFT JOIN public.shifts s ON s.id = p.shift_id
WHERE p.role::text IN ('manager', 'owner', 'admin') ORDER BY p.role::text, u.email;
