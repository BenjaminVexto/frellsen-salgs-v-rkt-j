-- 1) Bevar den nuværende fakturabaserede opgørelse under nyt navn
CREATE OR REPLACE FUNCTION public.bonus_maskin_grundlag_faktura(_saelger uuid, _fra date, _til date)
 RETURNS TABLE(maaned date, company_id uuid, navn text, by text, kategori text, maerke text, brugt boolean, kilde text, model text, antal numeric, faktura_dato date, beloeb numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no)
           l.visma_delivery_no, l.company_id
    FROM public.locations l
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  ),
  kunde AS (
    SELECT loc.visma_delivery_no, c.id, c.name, c.city,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori
    FROM loc
    JOIN public.companies c ON c.id = loc.company_id
    WHERE c.assigned_to = _saelger
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

GRANT EXECUTE ON FUNCTION public.bonus_maskin_grundlag_faktura(uuid, date, date) TO anon, authenticated, service_role;

-- 2) Ny opgørelse pr. serienummer og varens bonusklasse
DROP FUNCTION IF EXISTS public.bonus_maskin_grundlag(uuid, date, date);

CREATE FUNCTION public.bonus_maskin_grundlag(_saelger uuid, _fra date, _til date)
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
           l.visma_delivery_no, l.company_id
    FROM public.locations l
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  ),
  -- "Serienr.: X"-linjer (VG2 83) kobler et serienummer til en ordre
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
  -- varenummeret på maskinlinjen i samme ordre
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
  -- historiske lejehændelser pr. serienummer og kunde
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
  -- maskiner: hændelseslog + nuværende maskinkartotek
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
  -- én enhed pr. serienummer pr. måned (salg vinder over leje)
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
    SELECT ev.*, coalesce(ev.company_id, l.company_id) AS cid
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
    WHERE c.assigned_to = _saelger
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

GRANT EXECUTE ON FUNCTION public.bonus_maskin_grundlag(uuid, date, date) TO anon, authenticated, service_role;

-- 3) Detaljer: bonusklasse i stedet for tekstgenkendelse, udeladte vises med årsag
DROP FUNCTION IF EXISTS public.bonus_maskin_detaljer(uuid, date, date);

CREATE FUNCTION public.bonus_maskin_detaljer(_saelger uuid, _fra date, _til date)
 RETURNS TABLE(company_id uuid, navn text, by text, model text, maerke text, kilde text, brugt boolean, antal numeric, faktura_dato date, beloeb numeric, serienr text, bonusklasse text, udeladt boolean, aarsag text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til denne bonusopgørelse';
  END IF;

  RETURN QUERY
  WITH o AS (
    SELECT b.*
    FROM public.bonus_ordning b
    WHERE b.user_id = _saelger
      AND b.gyldig_fra <= date_trunc('month', _fra)::date
      AND (b.gyldig_til IS NULL OR b.gyldig_til >= date_trunc('month', _fra)::date)
    LIMIT 1
  ),
  g AS (SELECT * FROM public.bonus_maskin_grundlag(_saelger, _fra, _til))
  SELECT g.company_id, g.navn, g.by, g.model, g.maerke, g.kilde, g.brugt,
         g.antal, g.faktura_dato, g.beloeb, g.serienr, g.bonusklasse,
         g.udeladt, g.aarsag
  FROM g
  LEFT JOIN o ON true
  WHERE ((g.kategori = 'privat' AND coalesce(o.maskin_privat, false))
      OR (g.kategori = 'offentlig' AND coalesce(o.maskin_offentlig, false)))
    AND ((g.kilde = 'salg' AND coalesce(o.maskin_salg, false))
      OR (g.kilde = 'leje' AND coalesce(o.maskin_leje, false)))
    AND (NOT g.brugt OR coalesce(o.maskin_brugt, false))
    AND (g.udeladt OR g.bonusklasse IN ('wittenborg','animo','rex'))
  ORDER BY g.faktura_dato;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bonus_maskin_detaljer(uuid, date, date) TO anon, authenticated, service_role;

-- 4) Bonus pr. måned: tæl efter bonusklasse, spring udeladte over
CREATE OR REPLACE FUNCTION public.bonus_pr_maaned(_saelger uuid, _fra date, _til date)
 RETURNS TABLE(maaned date, ordning_id uuid, db_grundlag numeric, db_provision_pct numeric, db_bonus numeric, antal_wittenborg numeric, antal_animo numeric, antal_rex numeric, maskinbonus numeric, samlet_bonus numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til denne bonusopgørelse';
  END IF;

  RETURN QUERY
  WITH m AS (
    SELECT g::date AS maaned
    FROM generate_series(date_trunc('month', _fra), date_trunc('month', _til), interval '1 month') g
    WHERE g::date < date_trunc('month', current_date)::date
  ),
  o AS (
    SELECT m.maaned, b.*
    FROM m
    LEFT JOIN public.bonus_ordning b
      ON b.user_id = _saelger
     AND b.gyldig_fra <= m.maaned
     AND (b.gyldig_til IS NULL OR b.gyldig_til >= m.maaned)
  ),
  db AS (
    SELECT sm.period AS maaned,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
           sum(sm.contribution) AS vaerdi
    FROM public.sales_monthly sm
    JOIN public.companies c ON c.id = sm.company_id
    WHERE sm.afdeling_nr = 11
      AND sm.period >= date_trunc('month', _fra)::date
      AND sm.period <= date_trunc('month', _til)::date
      AND sm.period < date_trunc('month', current_date)::date
      AND c.assigned_to = _saelger
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
    GROUP BY 1, 2
  ),
  db_pr AS (
    SELECT o.maaned,
           coalesce(sum(db.vaerdi), 0) AS grundlag
    FROM o
    LEFT JOIN db ON db.maaned = o.maaned
      AND ((db.kategori = 'privat' AND coalesce(o.db_privat, false))
        OR (db.kategori = 'offentlig' AND coalesce(o.db_offentlig, false)))
    GROUP BY o.maaned
  ),
  mask AS (
    SELECT * FROM public.bonus_maskin_grundlag(_saelger, _fra, _til)
  ),
  mask_pr AS (
    SELECT o.maaned,
           coalesce(sum(CASE WHEN mask.bonusklasse = 'wittenborg' THEN mask.antal END), 0) AS w,
           coalesce(sum(CASE WHEN mask.bonusklasse = 'animo' THEN mask.antal END), 0) AS a,
           coalesce(sum(CASE WHEN mask.bonusklasse = 'rex' THEN mask.antal END), 0) AS r
    FROM o
    LEFT JOIN mask ON mask.maaned = o.maaned
      AND NOT mask.udeladt
      AND ((mask.kategori = 'privat' AND coalesce(o.maskin_privat, false))
        OR (mask.kategori = 'offentlig' AND coalesce(o.maskin_offentlig, false)))
      AND ((mask.kilde = 'salg' AND coalesce(o.maskin_salg, false))
        OR (mask.kilde = 'leje' AND coalesce(o.maskin_leje, false)))
      AND (NOT mask.brugt OR coalesce(o.maskin_brugt, false))
    GROUP BY o.maaned
  ),
  raa AS (
    SELECT o.maaned, o.id AS ordning_id, o.flatrate,
           o.db_bund, o.db_top, o.maskin_bund, o.maskin_top, o.total_bund, o.total_top,
           db_pr.grundlag,
           coalesce(o.db_provision_pct, 0) AS pct,
           db_pr.grundlag * coalesce(o.db_provision_pct, 0) / 100
             - coalesce(o.db_fradrag, 0) AS db_raa,
           mask_pr.w, mask_pr.a, mask_pr.r,
           mask_pr.w * coalesce(o.bonus_wittenborg, 0)
         + mask_pr.a * coalesce(o.bonus_animo, 0)
         + mask_pr.r * coalesce(o.bonus_rex, 0) AS mask_raa
    FROM o
    JOIN db_pr ON db_pr.maaned = o.maaned
    JOIN mask_pr ON mask_pr.maaned = o.maaned
  ),
  klemt AS (
    SELECT raa.*,
           least(greatest(raa.db_raa, coalesce(raa.db_bund, raa.db_raa)),
                 coalesce(raa.db_top, greatest(raa.db_raa, coalesce(raa.db_bund, raa.db_raa)))) AS db_klemt,
           least(greatest(raa.mask_raa, coalesce(raa.maskin_bund, raa.mask_raa)),
                 coalesce(raa.maskin_top, greatest(raa.mask_raa, coalesce(raa.maskin_bund, raa.mask_raa)))) AS mask_klemt
    FROM raa
  )
  SELECT k.maaned,
         k.ordning_id,
         round(k.grundlag, 2),
         k.pct,
         round(CASE WHEN k.flatrate IS NOT NULL THEN 0 ELSE k.db_klemt END, 2),
         k.w, k.a, k.r,
         round(CASE WHEN k.flatrate IS NOT NULL THEN 0 ELSE k.mask_klemt END, 2),
         round(
           CASE
             WHEN k.flatrate IS NOT NULL THEN k.flatrate
             ELSE least(
               greatest(k.db_klemt + k.mask_klemt, coalesce(k.total_bund, k.db_klemt + k.mask_klemt)),
               coalesce(k.total_top, greatest(k.db_klemt + k.mask_klemt, coalesce(k.total_bund, k.db_klemt + k.mask_klemt)))
             )
           END, 2)
  FROM klemt k
  ORDER BY k.maaned;
END;
$function$;