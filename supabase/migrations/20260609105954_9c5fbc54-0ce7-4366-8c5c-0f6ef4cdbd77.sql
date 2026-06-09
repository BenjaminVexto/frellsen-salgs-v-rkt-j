
-- 1. Open company access for all authenticated users
CREATE OR REPLACE FUNCTION public.can_access_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL
$$;

-- 2. Tighten contact_lists: assigned seller or admin
DROP POLICY IF EXISTS "Alle ser kontaktlister" ON public.contact_lists;
CREATE POLICY "Tildelte sælgere og admin ser kontaktlister"
  ON public.contact_lists FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.contact_list_assignments a
      WHERE a.contact_list_id = contact_lists.id
        AND a.assigned_to = auth.uid()
    )
  );

-- 3. Tighten contact_list_assignments SELECT: own assignments or admin
DROP POLICY IF EXISTS "Alle ser tildelinger" ON public.contact_list_assignments;
CREATE POLICY "Egne tildelinger eller admin"
  ON public.contact_list_assignments FOR SELECT
  TO authenticated
  USING (assigned_to = auth.uid() OR is_admin(auth.uid()));
