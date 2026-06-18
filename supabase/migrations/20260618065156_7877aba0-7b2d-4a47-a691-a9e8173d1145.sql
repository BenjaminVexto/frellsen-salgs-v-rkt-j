CREATE POLICY "Sælgere opretter relationer for tilgængelige virksomheder"
ON public.company_relations
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.can_access_company(auth.uid(), from_company_id)
);