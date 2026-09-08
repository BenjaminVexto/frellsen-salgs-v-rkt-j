
-- Adgangstjek: egen bruger, admin eller analyseadgang.
CREATE OR REPLACE FUNCTION public.maalepunkt_adgang(_saelger uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _saelger IS NOT NULL
     AND (_saelger = auth.uid()
          OR public.is_admin(auth.uid())
          OR public.maa_se_analyse(auth.uid()))
$$;

-- 1) Dækningsbidrag pr. måned (sælgerens egne kunder, afdeling 11).
CREATE OR REPLACE FUNCTION public.maalepunkt_db(_saelger uuid, _fra date, _til date)
RETURNS TABLE(maaned date, kategori text, vaerdi numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  SELECT sm.period AS maaned,
         CASE c.binding_status
           WHEN 'frit_salg' THEN 'privat'
           WHEN 'offentlig_aftale' THEN 'offentlig'
           ELSE 'andet'
         END AS kategori,
         round(sum(sm.contribution), 2) AS vaerdi
  FROM public.sales_monthly sm
  JOIN public.companies c ON c.id = sm.company_id
  WHERE sm.afdeling_nr = 11
    AND sm.period >= date_trunc('month', _fra)::date
    AND sm.period <= date_trunc('month', _til)::date
    AND sm.period < date_trunc('month', current_date)::date
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
  GROUP BY 1, 2;
END;
$$;

-- 2) Solgte maskiner pr. måned fra rå fakturalinjer.
CREATE OR REPLACE FUNCTION public.maalepunkt_maskiner(_saelger uuid, _fra date, _til date)
RETURNS TABLE(maaned date, maerke text, brugt boolean, antal numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id
    FROM public.locations l
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  )
  SELECT il.period AS maaned,
         CASE
           WHEN il.varetekst ILIKE '%wittenborg%' THEN 'Wittenborg'
           WHEN il.varetekst ILIKE '%animo%'
             OR il.varetekst ILIKE '%optivend%'
             OR il.varetekst ILIKE '%optibean%'
             OR il.varetekst ILIKE '%optime%' THEN 'Animo'
           WHEN il.varetekst ILIKE '%rex-royal%' THEN 'Rex-Royal'
           ELSE 'Andet'
         END AS maerke,
         (il.varetekst ILIKE '%brugt%') AS brugt,
         sum(il.antal) AS antal
  FROM public.invoice_lines il
  JOIN loc ON loc.visma_delivery_no = il.visma_delivery_no
  JOIN public.companies c ON c.id = loc.company_id
  WHERE il.afdeling_nr = 11
    AND il.varegruppe_1 = '16'
    AND il.varegruppe_2 IN ('78', '84')
    AND il.antal > 0
    AND coalesce(il.varetekst, '') NOT ILIKE 'serienr%'
    AND coalesce(il.varetekst, '') NOT ILIKE '%skab%'
    AND coalesce(il.varetekst, '') NOT ILIKE '%udslagsskuffe%'
    AND il.period >= date_trunc('month', _fra)::date
    AND il.period <= date_trunc('month', _til)::date
    AND il.period < date_trunc('month', current_date)::date
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
  GROUP BY 1, 2, 3;
END;
$$;

-- 3) Nye kunder pr. måned (created_in_visma).
CREATE OR REPLACE FUNCTION public.maalepunkt_nye_kunder(_saelger uuid, _fra date, _til date)
RETURNS TABLE(maaned date, kategori text, antal integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  SELECT date_trunc('month', c.created_in_visma)::date AS maaned,
         CASE c.binding_status
           WHEN 'frit_salg' THEN 'privat'
           WHEN 'offentlig_aftale' THEN 'offentlig'
           ELSE 'andet'
         END AS kategori,
         count(*)::int AS antal
  FROM public.companies c
  WHERE c.afdeling_nr = 11
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
    AND c.created_in_visma IS NOT NULL
    AND date_trunc('month', c.created_in_visma)::date >= date_trunc('month', _fra)::date
    AND date_trunc('month', c.created_in_visma)::date <= date_trunc('month', _til)::date
    AND date_trunc('month', c.created_in_visma)::date < date_trunc('month', current_date)::date
  GROUP BY 1, 2;
END;
$$;

REVOKE ALL ON FUNCTION public.maalepunkt_db(uuid, date, date) FROM public;
REVOKE ALL ON FUNCTION public.maalepunkt_maskiner(uuid, date, date) FROM public;
REVOKE ALL ON FUNCTION public.maalepunkt_nye_kunder(uuid, date, date) FROM public;
REVOKE ALL ON FUNCTION public.maalepunkt_adgang(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.maalepunkt_db(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maalepunkt_maskiner(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maalepunkt_nye_kunder(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maalepunkt_adgang(uuid) TO authenticated;
