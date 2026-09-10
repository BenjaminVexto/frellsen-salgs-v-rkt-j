CREATE OR REPLACE FUNCTION public.maalepunkt_omsaetning(_saelger uuid, _fra date, _til date)
RETURNS TABLE(maaned date, kategori text, vaerdi numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  SELECT sm.period AS maaned,
         public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
         round(sum(sm.revenue), 2) AS vaerdi
  FROM public.sales_monthly sm
  JOIN public.companies c ON c.id = sm.company_id
  WHERE sm.afdeling_nr = 11
    AND sm.period >= date_trunc('month', _fra)::date
    AND sm.period <= date_trunc('month', _til)::date
    AND sm.period < date_trunc('month', current_date)::date
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  GROUP BY 1, 2;
END;
$function$;

REVOKE ALL ON FUNCTION public.maalepunkt_omsaetning(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maalepunkt_omsaetning(uuid, date, date) TO authenticated, service_role;

-- Aktive kunder pr. måned: omsætning i de rullende 12 måneder til og med
-- måneden, ELLER aktivt udstyr registreret (nuværende registrering — der findes
-- ingen historik for opsætning/hjemtagning af udstyr).
CREATE OR REPLACE FUNCTION public.maalepunkt_aktive_kunder(_saelger uuid, _fra date, _til date)
RETURNS TABLE(maaned date, kategori text, antal integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH mdr AS (
    SELECT gs::date AS maaned
    FROM generate_series(
      date_trunc('month', _fra)::date,
      LEAST(date_trunc('month', _til)::date,
            (date_trunc('month', current_date) - interval '1 month')::date),
      interval '1 month'
    ) gs
  ), kunder AS (
    SELECT c.id,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
           coalesce(c.has_active_equipment, false) AS udstyr
    FROM public.companies c
    WHERE c.afdeling_nr = 11
      AND c.assigned_to = _saelger
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  ), oms AS (
    SELECT sm.company_id, sm.period, sum(sm.revenue) AS revenue
    FROM public.sales_monthly sm
    WHERE sm.afdeling_nr = 11
      AND sm.company_id IN (SELECT id FROM kunder)
      AND sm.period > (date_trunc('month', _fra) - interval '12 months')::date
      AND sm.period < date_trunc('month', current_date)::date
    GROUP BY 1, 2
  )
  SELECT m.maaned, k.kategori, count(*)::int
  FROM mdr m
  JOIN kunder k ON true
  WHERE k.udstyr
     OR EXISTS (
       SELECT 1 FROM oms o
       WHERE o.company_id = k.id
         AND o.revenue > 0
         AND o.period <= m.maaned
         AND o.period > (m.maaned - interval '12 months')::date
     )
  GROUP BY 1, 2;
END;
$function$;

REVOKE ALL ON FUNCTION public.maalepunkt_aktive_kunder(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.maalepunkt_aktive_kunder(uuid, date, date) TO authenticated, service_role;