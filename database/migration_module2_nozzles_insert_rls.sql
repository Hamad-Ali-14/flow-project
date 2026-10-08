-- =====================================================================
-- FLOW OPS: Module 2 Database Migration - Nozzles INSERT RLS Policy
-- Allows authorized staff (owner, admin, manager) to insert nozzles
-- =====================================================================

-- 1. Ensure RLS is enabled on public.nozzles
ALTER TABLE public.nozzles ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing insert policies if any exist to prevent duplicate/conflicting policies
DROP POLICY IF EXISTS "authorized staff can insert nozzles" ON public.nozzles;
DROP POLICY IF EXISTS "nozzles_insert" ON public.nozzles;

-- 3. Create the scoped FOR INSERT policy for nozzles
CREATE POLICY "authorized staff can insert nozzles"
  ON public.nozzles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Authorize only active owners, admins, and managers
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND coalesce(p.active, true) = true
        AND p.role::text IN ('owner', 'admin', 'manager')
    )
    -- Enforce data integrity on required nozzle fields
    AND machine_number IS NOT NULL AND length(trim(machine_number)) > 0
    AND nozzle_number IS NOT NULL AND length(trim(nozzle_number)) > 0
    AND tank_id IS NOT NULL
    AND coalesce(current_meter_reading, 0) >= 0
    AND coalesce(status, 'working') IN ('working', 'not_working')
  );
