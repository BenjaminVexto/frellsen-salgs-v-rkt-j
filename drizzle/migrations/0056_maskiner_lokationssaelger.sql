CREATE OR REPLACE FUNCTION public.bonus_maskin_grundlag(_saelger uuid, _fra date, _til date)
 RETURNS TABLE(maaned date, company_id uuid, navn text, by text, kategori text, maerke text, brugt boolean, kilde text, model text, antal numeric, faktura_dato date, beloeb numeric, serienr text, bonusklasse text, udeladt boolean, aarsag text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ordning AS (
    SELECT coalesce(max(b.overtagelse_mdr), 3) AS mdr
    FROM public.bonus_ordning b
    WHERE b.user_id = _saelger
      AND b.gyldig_fra <= date_trunc('month', _til)::date
      AND (b.gyldig_til IS NULL OR b.gyldig_til >= date_trunc('month', _fra)::date)
  ),
  loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id, l.saelger_user_id
    FROM public.locations l
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  ),
  sn_ordre AS (
    SELECT DISTINCT
           btrim(split_part(il.varetekst, ':', 2)) AS serienr,
           il.ordre_nr, il.afdeling_nr
    FROM public.invoice_lines il
    WHERE il.afdeling_nr = 11
      AND il.varegruppe_1 = '16'
      AND il.varegruppe_2 = '83'
      AND il.varetekst ILIKE 'serienr%'
      AND btrim(split_part(il.varetekst, ':', 2)) <> ''
      AND il.ordre_nr IS NOT NULL
  ),
  vare AS (
    SELECT DISTINCT ON (s.serienr)
           s.serienr, il.varenr, coalesce(il.varetekst, '') AS varetekst,
           coalesce(il.beloeb, 0) AS beloeb
    FROM sn_ordre s
    JOIN public.invoice_lines il
      ON il.ordre_nr = s.ordre_nr
     AND il.afdeling_nr = s.afdeling_nr
     AND il.varegruppe_1 = '16'
     AND il.varegruppe_2 IN ('78','84','80')
    ORDER BY s.serienr, il.faktura_dato DESC
  ),
  leje_hist AS (
    SELECT h.serienr, h.company_id, h.lease_leje_dato AS dato
    FROM public.maskin_haendelser h
    WHERE h.lease_leje_dato IS NOT NULL AND h.company_id IS NOT NULL
    UNION ALL
    SELECT s.serienr, l.company_id, il.faktura_dato
    FROM sn_ordre s
    JOIN public.invoice_lines il
      ON il.ordre_nr = s.ordre_nr
     AND il.afdeling_nr = s.afdeling_nr
     AND il.varegruppe_1 = '16'
     AND il.varegruppe_2 = '80'
    JOIN loc l ON l.visma_delivery_no = il.visma_delivery_no
    WHERE l.company_id IS NOT NULL AND il.faktura_dato IS NOT NULL
  ),
  enheder AS (
    SELECT h.serienr, h.lev_kundenr, h.company_id, h.kobt_dato, h.lease_leje_dato
    FROM public.maskin_haendelser h
    WHERE h.serienr IS NOT NULL
    UNION ALL
    SELECT m.serienr, m.lev_kundenr, NULL::uuid, m.kobt_dato, m.lease_leje_dato
    FROM public.machines m
    WHERE m.serienr IS NOT NULL AND m.afdeling_nr = 11
  ),
  ev_raa AS (
    SELECT e.serienr, e.lev_kundenr, e.company_id, 'salg'::text AS kilde,
           e.kobt_dato AS dato
    FROM enheder e WHERE e.kobt_dato IS NOT NULL
    UNION ALL
    SELECT e.serienr, e.lev_kundenr, e.company_id, 'leje'::text,
           e.lease_leje_dato
    FROM enheder e WHERE e.lease_leje_dato IS NOT NULL
  ),
  ev AS (
    SELECT DISTINCT ON (r.serienr, date_trunc('month', r.dato))
           date_trunc('month', r.dato)::date AS maaned,
           r.serienr, r.lev_kundenr, r.company_id, r.kilde, r.dato
    FROM ev_raa r
    WHERE r.dato >= date_trunc('month', _fra)::date
      AND r.dato < (date_trunc('month', _til) + interval '1 month')::date
      AND r.dato < date_trunc('month', current_date)::date
    ORDER BY r.serienr, date_trunc('month', r.dato),
             CASE WHEN r.kilde = 'salg' THEN 0 ELSE 1 END, r.dato
  ),
  med_kunde AS (
    SELECT ev.*, coalesce(ev.company_id, l.company_id) AS cid,
           (l.visma_delivery_no IS NOT NULL) AS har_lok, l.saelger_user_id AS lok_saelger
    FROM ev
    LEFT JOIN loc l ON l.visma_delivery_no = ev.lev_kundenr
  ),
  beriget AS (
    SELECT mk.maaned, mk.serienr, mk.kilde, mk.dato, mk.cid,
           c.name, c.city,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
           v.varenr, v.varetekst, v.beloeb,
           p.bonusklasse,
           EXISTS (
             SELECT 1 FROM leje_hist lh, ordning o
             WHERE lh.serienr = mk.serienr
               AND lh.company_id = c.id
               AND mk.kilde = 'salg'
               AND lh.dato < (mk.dato - (o.mdr || ' months')::interval)
           ) AS overtaget
    FROM med_kunde mk
    JOIN public.companies c ON c.id = mk.cid
    LEFT JOIN vare v ON v.serienr = mk.serienr
    LEFT JOIN public.products p ON p.varenr = v.varenr
    WHERE (CASE WHEN mk.har_lok THEN mk.lok_saelger ELSE c.assigned_to END) = _saelger AND public.maalepunkt_adgang(_saelger)
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  )
  SELECT b.maaned, b.cid, b.name, b.city, b.kategori,
         CASE b.bonusklasse
           WHEN 'wittenborg' THEN 'Wittenborg'
           WHEN 'animo' THEN 'Animo'
           WHEN 'rex' THEN 'Rex-Royal'
           WHEN 'ingen' THEN 'Andet'
           ELSE 'Ukendt'
         END AS maerke,
         (coalesce(b.varetekst, '') ILIKE '%brugt%') AS brugt,
         b.kilde,
         coalesce(nullif(b.varetekst, ''), b.serienr) AS model,
         1::numeric AS antal,
         b.dato AS faktura_dato,
         round(coalesce(b.beloeb, 0), 2) AS beloeb,
         b.serienr,
         b.bonusklasse,
         (b.overtaget OR b.varenr IS NULL OR b.bonusklasse IS NULL) AS udeladt,
         CASE
           WHEN b.overtaget THEN 'Overtagelse: tidligere leje hos samme kunde'
           WHEN b.varenr IS NULL THEN 'Uklassificeret: intet varenummer fundet for serienummeret'
           WHEN b.bonusklasse IS NULL THEN 'Uklassificeret: varen mangler bonusklasse'
           ELSE NULL
         END AS aarsag
  FROM beriget b
$function$;

CREATE OR REPLACE FUNCTION public.bonus_maskin_grundlag_faktura(_saelger uuid, _fra date, _til date)
 RETURNS TABLE(maaned date, company_id uuid, navn text, by text, kategori text, maerke text, brugt boolean, kilde text, model text, antal numeric, faktura_dato date, beloeb numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id, l.saelger_user_id
    FROM public.locations l
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  ),
  kunde AS (
    SELECT loc.visma_delivery_no, c.id, c.name, c.city,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori
    FROM loc
    JOIN public.companies c ON c.id = loc.company_id
    WHERE loc.saelger_user_id = _saelger AND public.maalepunkt_adgang(_saelger)
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  ),
  basis AS (
    SELECT il.*
    FROM public.invoice_lines il
    WHERE il.afdeling_nr = 11
      AND il.varegruppe_1 = '16'
      AND NOT public.maskin_er_tilvalg(il.varetekst)
  ),
  loc_start AS (
    SELECT il.visma_delivery_no, min(il.period) AS p0
    FROM public.invoice_lines il
    WHERE il.afdeling_nr = 11 AND il.varegruppe_1 = '16'
    GROUP BY 1
  ),
  salg AS (
    SELECT b.period AS maaned, b.visma_delivery_no, b.varetekst, b.antal,
           b.faktura_dato, b.beloeb, 'salg'::text AS kilde
    FROM basis b
    WHERE b.varegruppe_2 IN ('78','84') AND b.antal > 0
  ),
  leje_alle AS (
    SELECT DISTINCT ON (b.visma_delivery_no, public.maskin_maerke(b.varetekst), public.maskin_modelfamilie(b.varetekst))
           b.period AS maaned, b.visma_delivery_no, b.varetekst, 1::numeric AS antal,
           b.faktura_dato, b.beloeb, 'leje'::text AS kilde
    FROM basis b
    WHERE b.varegruppe_2 = '80' AND b.antal > 0
    ORDER BY b.visma_delivery_no, public.maskin_maerke(b.varetekst),
             public.maskin_modelfamilie(b.varetekst), b.period, b.faktura_dato
  ),
  leje AS (
    SELECT la.*
    FROM leje_alle la
    JOIN loc_start ls ON ls.visma_delivery_no = la.visma_delivery_no
    WHERE la.maaned <= ls.p0
  ),
  alle AS (SELECT * FROM salg UNION ALL SELECT * FROM leje)
  SELECT a.maaned, k.id, k.name, k.city, k.kategori,
         public.maskin_maerke(a.varetekst),
         (a.varetekst ILIKE '%brugt%'), a.kilde, a.varetekst, a.antal,
         a.faktura_dato, round(coalesce(a.beloeb, 0), 2)
  FROM alle a
  JOIN kunde k ON k.visma_delivery_no = a.visma_delivery_no
  WHERE a.maaned >= date_trunc('month', _fra)::date
    AND a.maaned <= date_trunc('month', _til)::date
    AND a.maaned < date_trunc('month', current_date)::date
$function$;

CREATE OR REPLACE FUNCTION public.maalepunkt_maskiner(_saelger uuid, _fra date, _til date, _kundetype text DEFAULT 'alle'::text, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(maaned date, maerke text, brugt boolean, antal numeric)
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
  WITH loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id, l.saelger_user_id
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
    AND (_saelger IS NULL OR loc.saelger_user_id = _saelger)
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
    AND (coalesce(_kundetype, 'alle') = 'alle'
         OR public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) = _kundetype)
  GROUP BY 1, 2, 3;
END;
$function$;