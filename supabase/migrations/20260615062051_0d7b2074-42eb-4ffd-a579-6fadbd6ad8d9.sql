
-- companies: tighten INSERT to admin/salgssupport
DROP POLICY IF EXISTS "Autentificerede opretter virksomheder" ON public.companies;
CREATE POLICY "Admin/salgssupport opretter virksomheder"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'salgssupport'));

-- company_relations: restrict mutations
DROP POLICY IF EXISTS "auth insert relations" ON public.company_relations;
DROP POLICY IF EXISTS "auth update relations" ON public.company_relations;
DROP POLICY IF EXISTS "auth delete relations" ON public.company_relations;

CREATE POLICY "Admin/salgssupport insert relations"
ON public.company_relations FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'salgssupport'));

CREATE POLICY "Admin/salgssupport update relations"
ON public.company_relations FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'salgssupport'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'salgssupport'));

CREATE POLICY "Admin/salgssupport delete relations"
ON public.company_relations FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'salgssupport'));

-- company_relation_suggestions: restrict mutations
DROP POLICY IF EXISTS "auth insert suggestions" ON public.company_relation_suggestions;
DROP POLICY IF EXISTS "auth update suggestions" ON public.company_relation_suggestions;
DROP POLICY IF EXISTS "auth delete suggestions" ON public.company_relation_suggestions;

CREATE POLICY "Admin/salgssupport insert suggestions"
ON public.company_relation_suggestions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'salgssupport'));

CREATE POLICY "Admin/salgssupport update suggestions"
ON public.company_relation_suggestions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'salgssupport'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'salgssupport'));

CREATE POLICY "Admin/salgssupport delete suggestions"
ON public.company_relation_suggestions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'salgssupport'));
