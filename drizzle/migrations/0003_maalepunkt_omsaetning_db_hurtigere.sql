-- Omsætning og DB: forfilter kunderne i en materialiseret CTE, så planen bliver
-- stabil og hurtig, også når alle sælgere/afdelinger opgøres på én gang.
CREATE OR REPLACE FUNCTION public.maalepunkt_omsaetning(_saelger uuid, _fra date, _til date, _kun_forbrug boolean)
RETURNS TABLE(maaned date, kategori text, vaerdi numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _afd int[] := public.maalepunkt_afdelinger(_saelger);
  _grp text[] := public.maalepunkt_forbrug_grupper();
  _forbrug boolean := coalesce(_kun_forbrug, true);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH kunder AS MATERIALIZED (
    SELECT c.id,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kat
    FROM public.companies c
    WHERE c.afdeling_nr = ANY (_afd)
      AND c.afloest_af_company_id IS NULL
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
  )
  SELECT sm.period, k.kat, round(sum(sm.revenue), 2)
  FROM public.sales_monthly sm
  JOIN kunder k ON k.id = sm.company_id
  WHERE k.kat IS NOT NULL
    AND sm.afdeling_nr = ANY (_afd)
    AND sm.period >= date_trunc('month', _fra)::date
    AND sm.period <= date_trunc('month', _til)::date
    AND sm.period < date_trunc('month', current_date)::date
    AND (NOT _forbrug OR sm.product_group_1 = ANY (_grp))
  GROUP BY 1, 2;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_db(_saelger uuid, _fra date, _til date, _kun_forbrug boolean)
RETURNS TABLE(maaned date, kategori text, vaerdi numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _afd int[] := public.maalepunkt_afdelinger(_saelger);
  _grp text[] := public.maalepunkt_forbrug_grupper();
  _forbrug boolean := coalesce(_kun_forbrug, true);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH kunder AS MATERIALIZED (
    SELECT c.id,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kat
    FROM public.companies c
    WHERE c.afdeling_nr = ANY (_afd)
      AND c.afloest_af_company_id IS NULL
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
  )
  SELECT sm.period, k.kat, round(sum(sm.contribution), 2)
  FROM public.sales_monthly sm
  JOIN kunder k ON k.id = sm.company_id
  WHERE k.kat IS NOT NULL
    AND sm.afdeling_nr = ANY (_afd)
    AND sm.period >= date_trunc('month', _fra)::date
    AND sm.period <= date_trunc('month', _til)::date
    AND sm.period < date_trunc('month', current_date)::date
    AND (NOT _forbrug OR sm.product_group_1 = ANY (_grp))
  GROUP BY 1, 2;
END;
$function$;