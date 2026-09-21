-- Aktive kunder: erstat EXISTS pr. kunde/måned med et hash-join, så opgørelsen
-- også kan køre for alle sælgere på én gang uden at ramme statement timeout.
CREATE OR REPLACE FUNCTION public.maalepunkt_aktive_kunder(_saelger uuid, _fra date, _til date)
RETURNS TABLE(maaned date, kategori text, antal integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger);
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
    WHERE c.afdeling_nr = ANY (_afd)
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  ), oms AS (
    SELECT DISTINCT sm.company_id, sm.period
    FROM public.sales_monthly sm
    JOIN kunder k ON k.id = sm.company_id
    WHERE sm.afdeling_nr = ANY (_afd)
      AND sm.revenue > 0
      AND sm.period > (date_trunc('month', _fra) - interval '12 months')::date
      AND sm.period < date_trunc('month', current_date)::date
  ), akt AS (
    SELECT DISTINCT m.maaned, o.company_id
    FROM mdr m
    JOIN oms o ON o.period <= m.maaned
              AND o.period > (m.maaned - interval '12 months')::date
  )
  SELECT m.maaned, k.kategori, count(*)::int
  FROM mdr m
  JOIN kunder k ON true
  LEFT JOIN akt a ON a.maaned = m.maaned AND a.company_id = k.id
  WHERE k.udstyr OR a.company_id IS NOT NULL
  GROUP BY 1, 2;
END;
$function$;