CREATE OR REPLACE FUNCTION public.maalepunkt_nye_lokationer(_saelger uuid, _fra date, _til date, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(maaned date, kategori text, antal integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
BEGIN
  IF NOT public.is_admin(auth.uid()) OR NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;
  RETURN QUERY
  WITH lok AS (
    SELECT li.location_id, li.company_id, date_trunc('month', li.foerste_ordre)::date AS m
    FROM public.location_mp_info li
    JOIN public.locations l ON l.id = li.location_id
    WHERE li.afdeling_nr = ANY (_afd) AND li.foerste_ordre IS NOT NULL
      AND (_saelger IS NULL OR l.saelger_user_id = _saelger)
      AND date_trunc('month', li.foerste_ordre)::date BETWEEN date_trunc('month', _fra)::date AND date_trunc('month', _til)::date
      AND date_trunc('month', li.foerste_ordre)::date < date_trunc('month', current_date)::date
  ), firma AS (
    SELECT li.company_id, min(date_trunc('month', li.foerste_ordre)::date) AS m
    FROM public.location_mp_info li
    WHERE li.company_id IN (SELECT company_id FROM lok) AND li.foerste_ordre IS NOT NULL
    GROUP BY li.company_id
  )
  SELECT lo.m, i.kat, count(*)::int
  FROM lok lo
  JOIN firma f ON f.company_id = lo.company_id AND f.m < lo.m
  JOIN public.company_mp_info i ON i.company_id = lo.company_id AND i.gyldig AND i.kat IS NOT NULL
  GROUP BY 1, 2;
END;
$function$;