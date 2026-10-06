-- 1) DB synlig for alle som standard (feltet beholdes til enkeltpersoner)
ALTER TABLE public.profiles ALTER COLUMN maa_se_db SET DEFAULT true;

CREATE OR REPLACE FUNCTION public.maalepunkt_db_detaljer(_saelger uuid, _fra date, _til date, _kategori text DEFAULT NULL::text, _maaned date DEFAULT NULL::date, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(company_id uuid, navn text, by text, db numeric, omsaetning numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT r.company_id, r.navn, r.by,
    CASE WHEN public.maa_se_db(auth.uid()) THEN r.db ELSE NULL END, r.omsaetning
  FROM public._maalepunkt_db_detaljer_raw(_saelger, _fra, _til, _kategori, _maaned, _afdeling_nr) r
$function$;

DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='maalepunkt_oms_detaljer' LIMIT 1;
  IF d IS NOT NULL AND position('_adm boolean := public.is_admin(auth.uid())' in d) > 0 THEN
    EXECUTE replace(d, '_adm boolean := public.is_admin(auth.uid())', '_adm boolean := public.maa_se_db(auth.uid())');
  END IF;
END $$;

-- 3) Konkurrenter: alle med en rolle kan oprette/opdatere; kun admin sletter
DROP POLICY IF EXISTS "Admin og salgssupport kan skrive konkurrenter" ON public.competitors;
CREATE POLICY "Brugere kan oprette konkurrenter" ON public.competitors FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()));
CREATE POLICY "Brugere kan opdatere konkurrenter" ON public.competitors FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()));
CREATE POLICY "Admin sletter konkurrenter" ON public.competitors FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;

CREATE OR REPLACE FUNCTION public.competitors_noter_stempel()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  IF TG_OP = 'INSERT' OR NEW IS DISTINCT FROM OLD THEN
    NEW.notes_updated_by := COALESCE(auth.uid(), NEW.notes_updated_by);
    NEW.notes_updated_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_competitors_noter_stempel ON public.competitors;
CREATE TRIGGER trg_competitors_noter_stempel BEFORE INSERT OR UPDATE ON public.competitors
  FOR EACH ROW EXECUTE FUNCTION public.competitors_noter_stempel();

-- Konkurrentaftaler for alle virksomheder brugeren kan se
DROP POLICY IF EXISTS "Opret konkurrentaftaler for tilgængelige virksomheder" ON public.competitor_assignments;
DROP POLICY IF EXISTS "Opdater konkurrentaftaler for tilgængelige virksomheder" ON public.competitor_assignments;
CREATE POLICY "Opret konkurrentaftaler for synlige virksomheder" ON public.competitor_assignments FOR INSERT TO authenticated
  WITH CHECK (registered_by = auth.uid() AND public.can_view_company(auth.uid(), company_id));
CREATE POLICY "Opdater konkurrentaftaler for synlige virksomheder" ON public.competitor_assignments FOR UPDATE TO authenticated
  USING (public.can_view_company(auth.uid(), company_id))
  WITH CHECK (public.can_view_company(auth.uid(), company_id));

-- 2) Besøgt: egne aktiviteter kan fortrydes samme dag
CREATE POLICY "Slet egne aktiviteter samme dag" ON public.activities FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND created_at > now() - interval '1 day');
CREATE INDEX IF NOT EXISTS activities_besoeg_idx ON public.activities (created_by, location_id, created_at) WHERE activity_type = 'besøg';