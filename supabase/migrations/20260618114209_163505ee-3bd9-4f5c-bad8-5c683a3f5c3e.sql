DROP POLICY IF EXISTS "Admin/salgssupport opretter virksomheder" ON public.companies;
CREATE POLICY "Autentificerede opretter virksomheder"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);