
-- COMPANIES
DROP POLICY IF EXISTS "Adgang til virksomheder" ON public.companies;
DROP POLICY IF EXISTS "Admin styrer virksomheder" ON public.companies;

CREATE POLICY "Alle autentificerede ser virksomheder"
ON public.companies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Alle autentificerede opdaterer virksomheder"
ON public.companies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin opretter virksomheder"
ON public.companies FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admin sletter virksomheder"
ON public.companies FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- CONTACTS
DROP POLICY IF EXISTS "Redigér kontakter for tilgængelige virksomheder" ON public.contacts;
DROP POLICY IF EXISTS "Se kontakter for tilgængelige virksomheder" ON public.contacts;

CREATE POLICY "Alle autentificerede styrer kontakter"
ON public.contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ACTIVITIES
DROP POLICY IF EXISTS "Admin sletter aktiviteter" ON public.activities;
DROP POLICY IF EXISTS "Opdater egne aktiviteter" ON public.activities;
DROP POLICY IF EXISTS "Opret aktiviteter for tilgængelige virksomheder" ON public.activities;
DROP POLICY IF EXISTS "Se aktiviteter for tilgængelige virksomheder" ON public.activities;

CREATE POLICY "Alle ser aktiviteter"
ON public.activities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Alle opretter aktiviteter"
ON public.activities FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Opdater egne aktiviteter eller admin"
ON public.activities FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR is_admin(auth.uid()))
WITH CHECK (created_by = auth.uid() OR is_admin(auth.uid()));

CREATE POLICY "Admin sletter aktiviteter"
ON public.activities FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- SALES_OPPORTUNITIES
DROP POLICY IF EXISTS "Admin sletter salgsmuligheder" ON public.sales_opportunities;
DROP POLICY IF EXISTS "Opdater egne salgsmuligheder" ON public.sales_opportunities;
DROP POLICY IF EXISTS "Opret salgsmulighed for tilgængelig virksomhed" ON public.sales_opportunities;
DROP POLICY IF EXISTS "Se egne salgsmuligheder" ON public.sales_opportunities;

CREATE POLICY "Alle ser salgsmuligheder"
ON public.sales_opportunities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Alle opretter salgsmuligheder"
ON public.sales_opportunities FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Alle opdaterer salgsmuligheder"
ON public.sales_opportunities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin sletter salgsmuligheder"
ON public.sales_opportunities FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- QUOTES
DROP POLICY IF EXISTS "Admin sletter tilbud" ON public.quotes;
DROP POLICY IF EXISTS "Opdater egne tilbud" ON public.quotes;
DROP POLICY IF EXISTS "Opret tilbud for tilgængelige virksomheder" ON public.quotes;
DROP POLICY IF EXISTS "Se tilbud for tilgængelige virksomheder" ON public.quotes;

CREATE POLICY "Alle ser tilbud"
ON public.quotes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Alle opretter tilbud"
ON public.quotes FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Alle opdaterer tilbud"
ON public.quotes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin sletter tilbud"
ON public.quotes FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- CONTACT_LIST_ASSIGNMENTS
DROP POLICY IF EXISTS "Admin styrer tildelinger" ON public.contact_list_assignments;
DROP POLICY IF EXISTS "Opdater egne tildelinger" ON public.contact_list_assignments;
DROP POLICY IF EXISTS "Se egne tildelinger" ON public.contact_list_assignments;

CREATE POLICY "Alle ser tildelinger"
ON public.contact_list_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Alle opdaterer tildelinger"
ON public.contact_list_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin opretter tildelinger"
ON public.contact_list_assignments FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admin sletter tildelinger"
ON public.contact_list_assignments FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- CONTACT_LISTS (open SELECT to all so sellers can see all lists)
DROP POLICY IF EXISTS "Se kontaktlister man har tildelinger i" ON public.contact_lists;

CREATE POLICY "Alle ser kontaktlister"
ON public.contact_lists FOR SELECT TO authenticated USING (true);
