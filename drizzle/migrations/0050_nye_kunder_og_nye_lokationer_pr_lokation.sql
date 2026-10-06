CREATE OR REPLACE FUNCTION public.maalepunkt_nye_kunder(_saelger uuid, _fra date, _til date, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(maaned date, kategori text, antal integer, db numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;
  RETURN QUERY
  WITH kand AS MATERIALIZED (
    SELECT i.company_id AS id, i.created_in_visma, i.kat AS kategori, i.gkey
    FROM public.company_mp_info i
    WHERE i.afdeling_nr = ANY (_afd)
      AND (_saelger IS NULL OR EXISTS (SELECT 1 FROM public.locations l WHERE l.company_id = i.company_id AND l.saelger_user_id = _saelger))
      AND i.gyldig
      AND i.created_in_visma IS NOT NULL
      AND i.kat IS NOT NULL
  ), agg AS (
    SELECT f.company_id,
           min(f.period) FILTER (WHERE f.pos_any) AS foerste_ordre,
           coalesce(sum(f.contrib) FILTER (
             WHERE (_saelger IS NULL OR f.saelger = _saelger)
               AND f.period >= date_trunc('month', _fra)::date
               AND f.period <= date_trunc('month', _til)::date
               AND f.period < date_trunc('month', current_date)::date), 0) AS db_periode
    FROM public.sales_kunde_maaned f
    WHERE f.c_afd = ANY (_afd) AND f.gyldig AND f.kat IS NOT NULL
      AND f.afdeling_nr = ANY (_afd)
    GROUP BY f.company_id
  ), acc AS (
    SELECT k.id, k.created_in_visma, k.kategori, k.gkey,
           a.foerste_ordre, coalesce(a.db_periode, 0) AS db_periode
    FROM kand k LEFT JOIN agg a ON a.company_id = k.id
  ), grp AS (
    SELECT a.gkey,
           min(a.foerste_ordre) AS foerste_ordre,
           sum(a.db_periode) AS db_periode,
           (array_agg(a.kategori ORDER BY a.created_in_visma, a.id))[1] AS kategori
    FROM acc a
    GROUP BY a.gkey
  )
  SELECT date_trunc('month', g.foerste_ordre)::date, g.kategori, count(*)::int, round(sum(g.db_periode), 2)
  FROM grp g
  WHERE g.foerste_ordre IS NOT NULL
    AND date_trunc('month', g.foerste_ordre)::date >= date_trunc('month', _fra)::date
    AND date_trunc('month', g.foerste_ordre)::date <= date_trunc('month', _til)::date
    AND date_trunc('month', g.foerste_ordre)::date < date_trunc('month', current_date)::date
  GROUP BY 1, 2;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_nye_kunder_detaljer(_saelger uuid, _fra date, _til date, _kategori text, _maaned date DEFAULT NULL::date, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(gruppe_key text, gruppe_navn text, gruppe_by text, gruppe_oprettet date, gruppe_foerste_ordre date, antal_konti integer, company_id uuid, navn text, by text, oprettet date, foerste_ordre date, kundeprisgruppe_2 text, omsaetning numeric, sidste_koeb date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH acc AS (
    SELECT c.id, c.name, c.city, c.created_in_visma, c.customer_segment_2,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
           coalesce(nullif(btrim(c.cvr), ''), '-') || '|' || public.addr_base(c.address) || '|' || coalesce(btrim(c.zip), '') AS gkey,
           s.omsaetning, s.sidste_koeb,
           (SELECT min(sm.period) FROM public.sales_monthly sm
             WHERE sm.company_id = c.id AND sm.afdeling_nr = ANY (_afd) AND sm.revenue > 0) AS foerste_ordre
    FROM public.companies c
    LEFT JOIN LATERAL (
      SELECT sum(sm.revenue) AS omsaetning, max(sm.last_invoice_date) AS sidste_koeb
      FROM public.sales_monthly sm
      WHERE sm.company_id = c.id
        AND sm.afdeling_nr = ANY (_afd)
        AND sm.period >= date_trunc('month', c.created_in_visma)::date
    ) s ON true
    WHERE c.afdeling_nr = ANY (_afd)
      AND (_saelger IS NULL OR EXISTS (SELECT 1 FROM public.locations l WHERE l.company_id = c.id AND l.saelger_user_id = _saelger))
      AND c.afloest_af_company_id IS NULL
      AND c.created_in_visma IS NOT NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  ), grp AS (
    SELECT a.gkey,
           min(a.created_in_visma) AS foerste_oprettet,
           min(a.foerste_ordre) AS foerste_ordre,
           count(*)::int AS antal_konti,
           (array_agg(a.kategori ORDER BY a.created_in_visma, a.id))[1] AS kategori,
           (array_agg(a.name ORDER BY a.created_in_visma, a.id))[1] AS navn,
           (array_agg(a.city ORDER BY a.created_in_visma, a.id))[1] AS by
    FROM acc a
    GROUP BY a.gkey
  ), valgt AS (
    SELECT g.*
    FROM grp g
    WHERE g.foerste_ordre IS NOT NULL
      AND date_trunc('month', g.foerste_ordre)::date >= date_trunc('month', _fra)::date
      AND date_trunc('month', g.foerste_ordre)::date <= date_trunc('month', _til)::date
      AND date_trunc('month', g.foerste_ordre)::date < date_trunc('month', current_date)::date
      AND (_maaned IS NULL OR date_trunc('month', g.foerste_ordre)::date = date_trunc('month', _maaned)::date)
      AND g.kategori = _kategori
  )
  SELECT v.gkey, v.navn, v.by, v.foerste_oprettet, v.foerste_ordre, v.antal_konti,
         a.id, a.name, a.city, a.created_in_visma, a.foerste_ordre, a.customer_segment_2,
         round(coalesce(a.omsaetning, 0), 2), a.sidste_koeb
  FROM valgt v
  JOIN acc a ON a.gkey = v.gkey
  ORDER BY v.foerste_ordre, v.gkey, a.foerste_ordre NULLS LAST, a.created_in_visma;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_nye_lokationer(_saelger uuid, _fra date, _til date, _afdeling_nr integer DEFAULT NULL)
 RETURNS TABLE(maaned date, kategori text, antal integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
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
GRANT EXECUTE ON FUNCTION public.maalepunkt_nye_lokationer(uuid, date, date, integer) TO authenticated;