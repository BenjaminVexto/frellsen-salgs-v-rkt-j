ALTER TYPE public.opportunity_status ADD VALUE IF NOT EXISTS 'emne' BEFORE 'ny';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS maa_se_afdelingspotentiale boolean NOT NULL DEFAULT false;

ALTER TABLE public.sales_opportunities
  ADD COLUMN IF NOT EXISTS p_nummer text,
  ADD COLUMN IF NOT EXISTS kilde text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ansatte_estimat integer;

CREATE UNIQUE INDEX IF NOT EXISTS sales_opportunities_aaben_pnr_uniq
  ON public.sales_opportunities (p_nummer)
  WHERE p_nummer IS NOT NULL AND status NOT IN ('vundet','tabt');

CREATE OR REPLACE FUNCTION public.har_afdelingspotentiale(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_uid) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _uid AND maa_se_afdelingspotentiale);
$$;
GRANT EXECUTE ON FUNCTION public.har_afdelingspotentiale(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.penhed_ikke_relevant (
  p_nummer text PRIMARY KEY,
  aarsag text NOT NULL CHECK (aarsag IN ('kantine_anden_kunde','centralt_indkoeb','frivillig_ingen_ansatte','andet')),
  fritekst text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (aarsag <> 'andet' OR length(trim(coalesce(fritekst,''))) > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.penhed_ikke_relevant TO authenticated;
GRANT ALL ON public.penhed_ikke_relevant TO service_role;
ALTER TABLE public.penhed_ikke_relevant ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Laes ikke relevante" ON public.penhed_ikke_relevant FOR SELECT TO authenticated USING (true);
CREATE POLICY "Opret ikke relevante" ON public.penhed_ikke_relevant FOR INSERT TO authenticated
  WITH CHECK (public.har_afdelingspotentiale(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Ret ikke relevante" ON public.penhed_ikke_relevant FOR UPDATE TO authenticated
  USING (public.har_afdelingspotentiale(auth.uid())) WITH CHECK (public.har_afdelingspotentiale(auth.uid()));
CREATE POLICY "Slet ikke relevante" ON public.penhed_ikke_relevant FOR DELETE TO authenticated
  USING (public.har_afdelingspotentiale(auth.uid()));

CREATE OR REPLACE FUNCTION public.tildel_penhed(_company_id uuid, _p_nummer text, _saelger uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p record; v_id uuid;
BEGIN
  IF NOT public.har_afdelingspotentiale(auth.uid()) THEN
    RAISE EXCEPTION 'Ingen adgang til Afdelingspotentiale';
  END IF;
  IF NOT public.can_view_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Ingen adgang til virksomheden';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _saelger AND is_active) THEN
    RAISE EXCEPTION 'Sælgeren er ikke aktiv';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_opportunities WHERE p_nummer = _p_nummer
             AND status::text NOT IN ('vundet','tabt')) THEN
    RAISE EXCEPTION 'P-enheden har allerede en åben salgsmulighed';
  END IF;
  SELECT * INTO p FROM public.cvr_penheder WHERE p_number = _p_nummer;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ukendt P-nummer'; END IF;
  INSERT INTO public.sales_opportunities
    (company_id, assigned_to, name, status, next_action, p_nummer, kilde, created_by, ansatte_estimat)
  VALUES (
    _company_id, _saelger,
    concat_ws(', ', p.address, nullif(concat_ws(' ', p.zip, p.city), '')) || ' (P-nr ' || _p_nummer || ')',
    'emne'::public.opportunity_status,
    'P-enhed ' || _p_nummer || ' · ' || coalesce(p.ansatte_praecis::text, replace(p.ansatte_interval,'-','–'), '–') || ' ansatte',
    _p_nummer, 'Afdelingspotentiale', auth.uid(), p.ansatte_estimat)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.tildel_penhed(uuid, text, uuid) TO authenticated;