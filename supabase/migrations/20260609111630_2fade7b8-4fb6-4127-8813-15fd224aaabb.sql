-- 1. Forhindre ikke-admins i at ændre companies.assigned_to
CREATE OR REPLACE FUNCTION public.prevent_non_admin_assigned_to_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Kun administratorer kan ændre tildeling af virksomheder';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_non_admin_assigned_to_change ON public.companies;
CREATE TRIGGER trg_prevent_non_admin_assigned_to_change
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_non_admin_assigned_to_change();

-- 2. Eksplicitte admin-only write policies på cvr_enrichment_jobs
CREATE POLICY "Admin opretter cvr_enrichment_jobs"
  ON public.cvr_enrichment_jobs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admin opdaterer cvr_enrichment_jobs"
  ON public.cvr_enrichment_jobs FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admin sletter cvr_enrichment_jobs"
  ON public.cvr_enrichment_jobs FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));