
DROP POLICY IF EXISTS "Opret aktiviteter for tilgængelige virksomheder" ON public.activities;
CREATE POLICY "Opret aktiviteter" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Opret tilbud for tilgængelige virksomheder" ON public.quotes;
CREATE POLICY "Opret tilbud" ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Opret salgsmulighed for tilgængelig virksomhed" ON public.sales_opportunities;
CREATE POLICY "Opret salgsmulighed" ON public.sales_opportunities
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
