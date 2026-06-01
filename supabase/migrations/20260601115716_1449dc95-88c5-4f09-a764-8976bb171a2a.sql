
DROP POLICY IF EXISTS "Alle ser aktiviteter" ON public.activities;
DROP POLICY IF EXISTS "Alle opretter aktiviteter" ON public.activities;

DROP POLICY IF EXISTS "Alle autentificerede opdaterer virksomheder" ON public.companies;
CREATE POLICY "Opdater virksomheder med adgang"
ON public.companies FOR UPDATE TO authenticated
USING (public.can_access_company(auth.uid(), id) OR public.is_admin(auth.uid()))
WITH CHECK (public.can_access_company(auth.uid(), id) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Alle kan læse og skrive briefings" ON public.company_briefings;
CREATE POLICY "Se briefings for tilgængelige virksomheder"
ON public.company_briefings FOR SELECT TO authenticated
USING (public.can_access_company(auth.uid(), company_id));
CREATE POLICY "Opret briefings for tilgængelige virksomheder"
ON public.company_briefings FOR INSERT TO authenticated
WITH CHECK (generated_by = auth.uid() AND public.can_access_company(auth.uid(), company_id));
CREATE POLICY "Opdater egne briefings"
ON public.company_briefings FOR UPDATE TO authenticated
USING (generated_by = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (generated_by = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Admin sletter briefings"
ON public.company_briefings FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Alle kan læse og skrive konkurrentaftaler" ON public.competitor_assignments;
CREATE POLICY "Se konkurrentaftaler for tilgængelige virksomheder"
ON public.competitor_assignments FOR SELECT TO authenticated
USING (public.can_access_company(auth.uid(), company_id));
CREATE POLICY "Opret konkurrentaftaler for tilgængelige virksomheder"
ON public.competitor_assignments FOR INSERT TO authenticated
WITH CHECK (registered_by = auth.uid() AND public.can_access_company(auth.uid(), company_id));
CREATE POLICY "Opdater konkurrentaftaler for tilgængelige virksomheder"
ON public.competitor_assignments FOR UPDATE TO authenticated
USING (public.can_access_company(auth.uid(), company_id) OR public.is_admin(auth.uid()))
WITH CHECK (public.can_access_company(auth.uid(), company_id) OR public.is_admin(auth.uid()));
CREATE POLICY "Admin sletter konkurrentaftaler"
ON public.competitor_assignments FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Alle opdaterer tildelinger" ON public.contact_list_assignments;
CREATE POLICY "Opdater egne tildelinger eller admin"
ON public.contact_list_assignments FOR UPDATE TO authenticated
USING (assigned_to = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (assigned_to = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Alle autentificerede kan læse og skrive contacts" ON public.contacts;

DROP POLICY IF EXISTS "Alle opdaterer lokationer" ON public.locations;
DROP POLICY IF EXISTS "Alle opretter lokationer" ON public.locations;
DROP POLICY IF EXISTS "Alle ser lokationer" ON public.locations;
CREATE POLICY "Se lokationer for tilgængelige virksomheder"
ON public.locations FOR SELECT TO authenticated
USING (public.can_access_company(auth.uid(), company_id));
CREATE POLICY "Opret lokationer for tilgængelige virksomheder"
ON public.locations FOR INSERT TO authenticated
WITH CHECK (public.can_access_company(auth.uid(), company_id) OR public.is_admin(auth.uid()));
CREATE POLICY "Opdater lokationer for tilgængelige virksomheder"
ON public.locations FOR UPDATE TO authenticated
USING (public.can_access_company(auth.uid(), company_id) OR public.is_admin(auth.uid()))
WITH CHECK (public.can_access_company(auth.uid(), company_id) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Alle opretter notifikationer" ON public.notifications;
CREATE POLICY "Opret notifikationer med adgang"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    recipient_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR (company_id IS NOT NULL AND public.can_access_company(auth.uid(), company_id))
  )
);

DROP POLICY IF EXISTS "Alle ser tilbud" ON public.quotes;
DROP POLICY IF EXISTS "Alle opdaterer tilbud" ON public.quotes;
DROP POLICY IF EXISTS "Alle opretter tilbud" ON public.quotes;
CREATE POLICY "Opdater tilbud for tilgængelige virksomheder"
ON public.quotes FOR UPDATE TO authenticated
USING (public.can_access_company(auth.uid(), company_id) OR public.is_admin(auth.uid()))
WITH CHECK (public.can_access_company(auth.uid(), company_id) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Alle ser salgsmuligheder" ON public.sales_opportunities;
DROP POLICY IF EXISTS "Alle opdaterer salgsmuligheder" ON public.sales_opportunities;
DROP POLICY IF EXISTS "Alle opretter salgsmuligheder" ON public.sales_opportunities;
CREATE POLICY "Se salgsmuligheder for tilgængelige virksomheder"
ON public.sales_opportunities FOR SELECT TO authenticated
USING (public.can_access_company(auth.uid(), company_id) OR assigned_to = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Opdater salgsmuligheder for tilgængelige virksomheder"
ON public.sales_opportunities FOR UPDATE TO authenticated
USING (assigned_to = auth.uid() OR public.can_access_company(auth.uid(), company_id) OR public.is_admin(auth.uid()))
WITH CHECK (assigned_to = auth.uid() OR public.can_access_company(auth.uid(), company_id) OR public.is_admin(auth.uid()));

ALTER FUNCTION public.derive_customer_type() SET search_path = public;
ALTER FUNCTION public.touch_updated_at() SET search_path = public;
