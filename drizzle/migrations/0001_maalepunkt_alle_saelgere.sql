-- "Alle sælgere": _saelger IS NULL betyder alle kunder (også uden tildelt sælger)
-- i de afdelinger brugeren har adgang til. Kun admin må se det.

CREATE OR REPLACE FUNCTION public.maalepunkt_adgang(_saelger uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _saelger IS NULL THEN public.is_admin(auth.uid())
    ELSE (_saelger = auth.uid()
          OR public.is_admin(auth.uid())
          OR public.maa_se_analyse(auth.uid()))
  END
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_afdelinger(_saelger uuid)
RETURNS integer[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN _saelger IS NULL THEN public.my_afdelinger() ELSE ARRAY[11] END
$function$;

GRANT EXECUTE ON FUNCTION public.maalepunkt_afdelinger(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.maalepunkt_omsaetning(_saelger uuid, _fra date, _til date, _kun_forbrug boolean)
RETURNS TABLE(maaned date, kategori text, vaerdi numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger);
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
  WHERE sm.afdeling_nr = ANY (_afd)
    AND sm.period >= date_trunc('month', _fra)::date
    AND sm.period <= date_trunc('month', _til)::date
    AND sm.period < date_trunc('month', current_date)::date
    AND (_saelger IS NULL OR c.assigned_to = _saelger)
    AND c.afloest_af_company_id IS NULL
    AND (NOT coalesce(_kun_forbrug, true)
         OR sm.product_group_1 = ANY (public.maalepunkt_forbrug_grupper()))
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  GROUP BY 1, 2;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_db(_saelger uuid, _fra date, _til date, _kun_forbrug boolean)
RETURNS TABLE(maaned date, kategori text, vaerdi numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  SELECT sm.period AS maaned,
         public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
         round(sum(sm.contribution), 2) AS vaerdi
  FROM public.sales_monthly sm
  JOIN public.companies c ON c.id = sm.company_id
  WHERE sm.afdeling_nr = ANY (_afd)
    AND sm.period >= date_trunc('month', _fra)::date
    AND sm.period <= date_trunc('month', _til)::date
    AND sm.period < date_trunc('month', current_date)::date
    AND (_saelger IS NULL OR c.assigned_to = _saelger)
    AND c.afloest_af_company_id IS NULL
    AND (NOT coalesce(_kun_forbrug, true)
         OR sm.product_group_1 = ANY (public.maalepunkt_forbrug_grupper()))
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  GROUP BY 1, 2;
END;
$function$;

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
    SELECT sm.company_id, sm.period, sum(sm.revenue) AS revenue
    FROM public.sales_monthly sm
    WHERE sm.afdeling_nr = ANY (_afd)
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

CREATE OR REPLACE FUNCTION public.maalepunkt_nye_kunder(_saelger uuid, _fra date, _til date)
RETURNS TABLE(maaned date, kategori text, antal integer, db numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH acc AS (
    SELECT c.id, c.created_in_visma,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
           coalesce(nullif(btrim(c.cvr), ''), '-') || '|' || public.addr_base(c.address) || '|' || coalesce(btrim(c.zip), '') AS gkey,
           (SELECT min(sm.period) FROM public.sales_monthly sm
             WHERE sm.company_id = c.id AND sm.afdeling_nr = ANY (_afd) AND sm.revenue > 0) AS foerste_ordre,
           (SELECT coalesce(sum(sm.contribution), 0) FROM public.sales_monthly sm
             WHERE sm.company_id = c.id AND sm.afdeling_nr = ANY (_afd)
               AND sm.period >= date_trunc('month', _fra)::date
               AND sm.period <= date_trunc('month', _til)::date
               AND sm.period < date_trunc('month', current_date)::date) AS db_periode
    FROM public.companies c
    WHERE c.afdeling_nr = ANY (_afd)
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
      AND c.afloest_af_company_id IS NULL
      AND c.created_in_visma IS NOT NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  ), grp AS (
    SELECT a.gkey,
           min(a.foerste_ordre) AS foerste_ordre,
           sum(a.db_periode) AS db_periode,
           (array_agg(a.kategori ORDER BY a.created_in_visma, a.id))[1] AS kategori
    FROM acc a
    GROUP BY a.gkey
  )
  SELECT date_trunc('month', g.foerste_ordre)::date,
         g.kategori,
         count(*)::int,
         round(sum(g.db_periode), 2)
  FROM grp g
  WHERE g.foerste_ordre IS NOT NULL
    AND date_trunc('month', g.foerste_ordre)::date >= date_trunc('month', _fra)::date
    AND date_trunc('month', g.foerste_ordre)::date <= date_trunc('month', _til)::date
    AND date_trunc('month', g.foerste_ordre)::date < date_trunc('month', current_date)::date
  GROUP BY 1, 2;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_maskiner(_saelger uuid, _fra date, _til date, _kundetype text DEFAULT 'alle'::text)
RETURNS TABLE(maaned date, maerke text, brugt boolean, antal numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id
    FROM public.locations l
    WHERE l.afdeling_nr = ANY (_afd) AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  )
  SELECT il.period AS maaned,
         public.maskin_maerke(il.varetekst) AS maerke,
         (il.varetekst ILIKE '%brugt%') AS brugt,
         sum(il.antal) AS antal
  FROM public.invoice_lines il
  JOIN loc ON loc.visma_delivery_no = il.visma_delivery_no
  JOIN public.companies c ON c.id = loc.company_id
  WHERE il.afdeling_nr = ANY (_afd)
    AND il.varegruppe_1 = '16'
    AND il.varegruppe_2 IN ('78', '84')
    AND il.antal > 0
    AND NOT public.maskin_er_tilvalg(il.varetekst)
    AND il.period >= date_trunc('month', _fra)::date
    AND il.period <= date_trunc('month', _til)::date
    AND il.period < date_trunc('month', current_date)::date
    AND (_saelger IS NULL OR c.assigned_to = _saelger)
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
    AND (coalesce(_kundetype, 'alle') = 'alle'
         OR public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) = _kundetype)
  GROUP BY 1, 2, 3;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_db_detaljer(_saelger uuid, _fra date, _til date, _kategori text, _maaned date DEFAULT NULL::date)
RETURNS TABLE(company_id uuid, navn text, by text, db numeric, omsaetning numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.city,
         round(sum(sm.contribution), 2),
         round(sum(sm.revenue), 2)
  FROM public.sales_monthly sm
  JOIN public.companies c ON c.id = sm.company_id
  WHERE sm.afdeling_nr = ANY (_afd)
    AND sm.period >= date_trunc('month', _fra)::date
    AND sm.period <= date_trunc('month', _til)::date
    AND sm.period < date_trunc('month', current_date)::date
    AND (_maaned IS NULL OR sm.period = date_trunc('month', _maaned)::date)
    AND (_saelger IS NULL OR c.assigned_to = _saelger)
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) = _kategori
  GROUP BY c.id, c.name, c.city
  ORDER BY 4 DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_maskiner_detaljer(_saelger uuid, _fra date, _til date, _maerke text, _brugt boolean DEFAULT NULL::boolean, _kundetype text DEFAULT 'alle'::text, _maaned date DEFAULT NULL::date)
RETURNS TABLE(company_id uuid, navn text, by text, model text, antal numeric, faktura_dato date, beloeb numeric, brugt boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  WITH loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id
    FROM public.locations l
    WHERE l.afdeling_nr = ANY (_afd) AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  )
  SELECT c.id, c.name, c.city, il.varetekst, il.antal, il.faktura_dato,
         round(coalesce(il.beloeb, 0), 2), (il.varetekst ILIKE '%brugt%')
  FROM public.invoice_lines il
  JOIN loc ON loc.visma_delivery_no = il.visma_delivery_no
  JOIN public.companies c ON c.id = loc.company_id
  WHERE il.afdeling_nr = ANY (_afd)
    AND il.varegruppe_1 = '16'
    AND il.varegruppe_2 IN ('78', '84')
    AND il.antal > 0
    AND NOT public.maskin_er_tilvalg(il.varetekst)
    AND il.period >= date_trunc('month', _fra)::date
    AND il.period <= date_trunc('month', _til)::date
    AND il.period < date_trunc('month', current_date)::date
    AND (_maaned IS NULL OR il.period = date_trunc('month', _maaned)::date)
    AND (_saelger IS NULL OR c.assigned_to = _saelger)
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
    AND (_maerke IS NULL OR _maerke = public.maskin_maerke(il.varetekst))
    AND (_brugt IS NULL OR _brugt = (il.varetekst ILIKE '%brugt%'))
    AND (coalesce(_kundetype, 'alle') = 'alle'
         OR public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) = _kundetype)
  ORDER BY il.faktura_dato;
END;
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_nye_kunder_detaljer(_saelger uuid, _fra date, _til date, _kategori text, _maaned date DEFAULT NULL::date)
RETURNS TABLE(gruppe_key text, gruppe_navn text, gruppe_by text, gruppe_oprettet date, gruppe_foerste_ordre date, antal_konti integer, company_id uuid, navn text, by text, oprettet date, foerste_ordre date, kundeprisgruppe_2 text, omsaetning numeric, sidste_koeb date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger);
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
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
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