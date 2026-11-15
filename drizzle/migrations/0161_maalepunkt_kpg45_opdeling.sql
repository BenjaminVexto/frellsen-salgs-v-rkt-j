CREATE OR REPLACE FUNCTION public.maalepunkt_kpg45(_slags text, _saelger uuid, _fra date, _til date, _afdeling_nr integer DEFAULT NULL, _kun_forbrug boolean DEFAULT true)
RETURNS TABLE(maaned date, kategori text, vaerdi numeric, db numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
        _forbrug boolean := coalesce(_kun_forbrug, true);
BEGIN
  -- Kun admin: opdeling af Forhandlingskunder i KPG3 45 / private. Rører ikke kategoriseringen.
  IF NOT public.is_admin(auth.uid()) OR NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang';
  END IF;
  IF _slags IN ('omsaetning','db') THEN
    RETURN QUERY
    SELECT f.period, CASE WHEN c.customer_segment_3 LIKE '45 [%' THEN 'privat_45' ELSE 'privat_ovrige' END,
      round(sum(CASE WHEN _slags='omsaetning' THEN (CASE WHEN _forbrug THEN f.rev_fg ELSE f.rev END)
                     ELSE (CASE WHEN _forbrug THEN f.contrib_fg ELSE f.contrib END) END), 2), NULL::numeric
    FROM public.sales_kunde_maaned f JOIN public.companies c ON c.id = f.company_id
    WHERE f.c_afd = ANY (_afd) AND f.gyldig AND f.kat = 'privat'
      AND (_saelger IS NULL OR f.saelger = _saelger) AND f.afdeling_nr = ANY (_afd)
      AND f.period >= date_trunc('month', _fra)::date AND f.period <= date_trunc('month', _til)::date
      AND f.period < date_trunc('month', current_date)::date
      AND (NOT _forbrug OR f.has_fg)
    GROUP BY 1, 2;
  ELSIF _slags IN ('aktive', 'aktive_unikke') THEN
    RETURN QUERY
    WITH mdr AS (
      SELECT gs::date AS m FROM generate_series(date_trunc('month', _fra)::date,
        LEAST(date_trunc('month', _til)::date, (date_trunc('month', current_date) - interval '1 month')::date), interval '1 month') gs
    ), oms AS (
      SELECT DISTINCT f.company_id, f.period FROM public.sales_kunde_maaned f
      WHERE f.c_afd = ANY (_afd) AND f.gyldig AND f.kat = 'privat'
        AND (_saelger IS NULL OR f.saelger = _saelger) AND f.afdeling_nr = ANY (_afd) AND f.pos_fg
        AND f.period >= (date_trunc('month', _fra) - interval '2 months')::date
        AND f.period < date_trunc('month', current_date)::date
    ), akt AS (
      SELECT DISTINCT CASE WHEN _slags = 'aktive' THEN mm.m END AS m, o.company_id
      FROM mdr mm JOIN oms o ON o.period <= mm.m AND o.period >= (mm.m - interval '2 months')::date
    )
    SELECT a.m, CASE WHEN c.customer_segment_3 LIKE '45 [%' THEN 'privat_45' ELSE 'privat_ovrige' END, count(*)::numeric, NULL::numeric
    FROM akt a JOIN public.companies c ON c.id = a.company_id GROUP BY 1, 2;
  ELSIF _slags = 'nye_kunder' THEN
    RETURN QUERY
    WITH kand AS MATERIALIZED (
      SELECT i.company_id AS id, i.created_in_visma, i.kat, i.gkey, c.customer_segment_3 seg
      FROM public.company_mp_info i JOIN public.companies c ON c.id = i.company_id
      WHERE i.afdeling_nr = ANY (_afd)
        AND (_saelger IS NULL OR EXISTS (SELECT 1 FROM public.locations l WHERE l.company_id = i.company_id AND l.saelger_user_id = _saelger))
        AND i.gyldig AND i.created_in_visma IS NOT NULL AND i.kat IS NOT NULL
    ), agg AS (
      SELECT f.company_id, min(f.period) FILTER (WHERE f.pos_any) AS fo,
        coalesce(sum(f.contrib) FILTER (WHERE (_saelger IS NULL OR f.saelger = _saelger)
          AND f.period >= date_trunc('month', _fra)::date AND f.period <= date_trunc('month', _til)::date
          AND f.period < date_trunc('month', current_date)::date), 0) AS dbp
      FROM public.sales_kunde_maaned f
      WHERE f.c_afd = ANY (_afd) AND f.gyldig AND f.kat IS NOT NULL AND f.afdeling_nr = ANY (_afd)
      GROUP BY f.company_id
    ), grp AS (
      SELECT k.gkey, min(a.fo) fo, sum(coalesce(a.dbp,0)) dbp,
        (array_agg(k.kat ORDER BY k.created_in_visma, k.id))[1] kat,
        (array_agg(k.seg ORDER BY k.created_in_visma, k.id))[1] seg
      FROM kand k LEFT JOIN agg a ON a.company_id = k.id GROUP BY k.gkey
    )
    SELECT date_trunc('month', g.fo)::date, CASE WHEN g.seg LIKE '45 [%' THEN 'privat_45' ELSE 'privat_ovrige' END,
      count(*)::numeric, round(sum(g.dbp), 2)
    FROM grp g
    WHERE g.kat = 'privat' AND g.fo IS NOT NULL
      AND date_trunc('month', g.fo)::date BETWEEN date_trunc('month', _fra)::date AND date_trunc('month', _til)::date
      AND date_trunc('month', g.fo)::date < date_trunc('month', current_date)::date
    GROUP BY 1, 2;
  ELSIF _slags = 'nye_lokationer' THEN
    RETURN QUERY
    WITH lok AS (
      SELECT li.location_id, li.company_id, date_trunc('month', li.foerste_ordre)::date AS m
      FROM public.location_mp_info li JOIN public.locations l ON l.id = li.location_id
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
    SELECT lo.m, CASE WHEN c.customer_segment_3 LIKE '45 [%' THEN 'privat_45' ELSE 'privat_ovrige' END, count(*)::numeric, NULL::numeric
    FROM lok lo
    JOIN firma f ON f.company_id = lo.company_id AND f.m < lo.m
    JOIN public.company_mp_info i ON i.company_id = lo.company_id AND i.gyldig AND i.kat = 'privat'
    JOIN public.companies c ON c.id = lo.company_id
    GROUP BY 1, 2;
  ELSE
    RAISE EXCEPTION 'Ukendt slags';
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.maalepunkt_kpg45(text, uuid, date, date, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maalepunkt_kpg45(text, uuid, date, date, integer, boolean) TO authenticated, service_role;