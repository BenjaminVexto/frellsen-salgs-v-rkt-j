DROP POLICY IF EXISTS "Opret lokationer for tilgængelige virksomheder" ON public.locations;
CREATE POLICY "Opret lokationer for synlige virksomheder" ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_view_company(auth.uid(), company_id)
    AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::integer[])
  );