CREATE TABLE public.cvr_enhed (
  cvr text PRIMARY KEY,
  cvr_navn text,
  virksomhedsform text,
  cvr_status text,
  adresse text,
  postnr text,
  "by" text,
  kommune text,
  branchekode text,
  branchetekst text,
  ansatte integer,
  fundet boolean NOT NULL DEFAULT true,
  hentet_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.cvr_enhed IS 'CVR-data pr. juridisk enhed (CVR-nummer), hentet fra CVR. Visma-felter på companies røres ikke.';
COMMENT ON COLUMN public.cvr_enhed.fundet IS 'false = opslaget gav intet hit i CVR (tæller som fejlet)';
GRANT SELECT ON public.cvr_enhed TO authenticated;
GRANT ALL ON public.cvr_enhed TO service_role;
ALTER TABLE public.cvr_enhed ENABLE ROW LEVEL SECURITY;
CREATE POLICY cvr_enhed_read ON public.cvr_enhed FOR SELECT TO authenticated USING (true);
CREATE POLICY tm_spaerret ON public.cvr_enhed AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));

-- CVR-numre der mangler eller er forældede (> 30 dage)
CREATE OR REPLACE FUNCTION public.cvr_til_opdatering(_n int)
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.n FROM (
    SELECT DISTINCT public.cvr_norm(c.cvr) AS n FROM companies c WHERE public.cvr_norm(c.cvr) IS NOT NULL
  ) x LEFT JOIN cvr_enhed e ON e.cvr = x.n
  WHERE e.cvr IS NULL OR e.hentet_at < now() - interval '30 days'
  ORDER BY e.hentet_at NULLS FIRST
  LIMIT _n
$$;
REVOKE EXECUTE ON FUNCTION public.cvr_til_opdatering(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cvr_til_opdatering(int) TO service_role;

-- Kopiér CVR-felter (ansatte, branche, kommune) ud på konti. Visma-felter røres ikke.
CREATE OR REPLACE FUNCTION public.cvr_enhed_til_konti(_cvrs text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  UPDATE companies c SET
    employees = e.ansatte,
    main_branch_code = e.branchekode,
    main_branch_text = e.branchetekst,
    municipality = e.kommune,
    source_updated_at = now()
  FROM cvr_enhed e
  WHERE e.fundet AND e.cvr = ANY(_cvrs) AND public.cvr_norm(c.cvr) = e.cvr
    AND (c.employees IS DISTINCT FROM e.ansatte OR c.main_branch_code IS DISTINCT FROM e.branchekode
         OR c.main_branch_text IS DISTINCT FROM e.branchetekst OR c.municipality IS DISTINCT FROM e.kommune);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE EXECUTE ON FUNCTION public.cvr_enhed_til_konti(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cvr_enhed_til_konti(text[]) TO service_role;

DROP FUNCTION public.cvr_grupper();
CREATE FUNCTION public.cvr_grupper()
 RETURNS TABLE(cvr text, antal_konti integer, aktive integer, bedste_status text, oms_12m numeric, cvr_navn text, cvr_status text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _fra date := (date_trunc('month', now()) - interval '12 months')::date;
        _til date := date_trunc('month', now())::date;
BEGIN
  IF public.er_telemarketing() THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  RETURN QUERY
  WITH k AS (
    SELECT c.id, public.cvr_norm(c.cvr) AS n, c.customer_type::text AS t
    FROM companies c
    WHERE c.afloest_af_company_id IS NULL AND public.cvr_norm(c.cvr) IS NOT NULL
      AND c.afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[])
  ), g AS (
    SELECT k.n FROM k GROUP BY k.n HAVING count(*) > 1
  ), s AS (
    SELECT m.company_id, sum(m.rev) AS rev FROM sales_kunde_maaned m
    WHERE m.period >= _fra AND m.period < _til AND m.company_id IN (SELECT k.id FROM k JOIN g ON g.n = k.n)
    GROUP BY m.company_id
  )
  SELECT k.n, count(*)::int, count(*) FILTER (WHERE k.t = 'aktiv_kunde')::int,
         (array_agg(k.t ORDER BY public._status_rang(k.t)))[1], COALESCE(sum(s.rev), 0),
         max(e.cvr_navn), max(e.cvr_status)
  FROM k JOIN g ON g.n = k.n LEFT JOIN s ON s.company_id = k.id LEFT JOIN cvr_enhed e ON e.cvr = k.n
  GROUP BY k.n;
END $function$;
GRANT EXECUTE ON FUNCTION public.cvr_grupper() TO authenticated;