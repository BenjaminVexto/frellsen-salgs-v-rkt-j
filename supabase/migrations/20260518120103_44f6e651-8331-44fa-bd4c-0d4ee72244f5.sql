DROP POLICY IF EXISTS "Se kontaktlister man har tildelinger i" ON public.contact_lists;

CREATE POLICY "Se kontaktlister man har tildelinger i"
ON public.contact_lists
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.contact_list_assignments cla
    WHERE cla.contact_list_id = contact_lists.id
      AND cla.assigned_to = auth.uid()
  )
);