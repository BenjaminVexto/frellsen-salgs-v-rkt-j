-- Bonus: rettelser oktober 2026
CREATE OR REPLACE FUNCTION public.maskin_bonusklasse(_type text, _maaned date)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN nullif(btrim(coalesce(_type, '')), '') IS NULL THEN NULL
    WHEN _type ~* 'optivend' THEN CASE WHEN _maaned >= DATE '2026-09-01' THEN 'animo' ELSE 'ingen' END
    WHEN _type ~* 'animo|optibean|optime' THEN 'animo'
    WHEN _type ~* 'rex' THEN 'rex'
    WHEN _type ~* '^gaggia g300|wittenborg|^(w100|95|9100|9000)' THEN 'wittenborg'
    ELSE 'ingen'
  END
$function$;

CREATE OR REPLACE FUNCTION public.bonus_maskin_grundlag(_saelger uuid, _fra date, _til date)
 RETURNS TABLE(maaned date, company_id uuid, navn text, by text, kategori text, maerke text, brugt boolean, kilde text, model text, antal numeric, faktura_dato date, beloeb numeric, serienr text, bonusklasse text, udeladt boolean, aarsag text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH ordning AS (
    SELECT coalesce(max(b.overtagelse_mdr), 3) AS mdr
    FROM public.bonus_ordning b
    WHERE b.user_id = _saelger
      AND b.gyldig_fra <= date_trunc('month', _til)::date
      AND (b.gyldig_til IS NULL OR b.gyldig_til >= date_trunc('month', _fra)::date)
  ),
  loc AS (
    SELECT DISTINCT ON (l.visma_delivery_no) l.visma_delivery_no, l.company_id, l.saelger_user_id
    FROM public.locations l
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
    ORDER BY l.visma_delivery_no, l.created_at DESC
  ),
  sn_ordre AS (
    SELECT DISTINCT btrim(split_part(il.varetekst, ':', 2)) AS serienr, il.ordre_nr, il.afdeling_nr
    FROM public.invoice_lines il
    WHERE il.afdeling_nr = 11 AND il.varegruppe_1 = '16' AND il.varegruppe_2 = '83'
      AND il.varetekst ILIKE 'serienr%' AND btrim(split_part(il.varetekst, ':', 2)) <> ''
      AND il.ordre_nr IS NOT NULL
  ),
  vare AS (
    SELECT DISTINCT ON (s.serienr) s.serienr, il.varenr, coalesce(il.varetekst, '') AS varetekst,
           coalesce(il.beloeb, 0) AS beloeb
    FROM sn_ordre s
    JOIN public.invoice_lines il ON il.ordre_nr = s.ordre_nr AND il.afdeling_nr = s.afdeling_nr
     AND il.varegruppe_1 = '16' AND il.varegruppe_2 IN ('78','84','80')
    ORDER BY s.serienr, il.faktura_dato DESC
  ),
  mtype AS (
    SELECT DISTINCT ON (h.serienr) h.serienr, h.maskin_type
    FROM public.maskin_haendelser h
    WHERE h.serienr IS NOT NULL AND nullif(btrim(h.maskin_type), '') IS NOT NULL
    ORDER BY h.serienr, h.import_tid DESC
  ),
  leje_hist AS (
    SELECT h.serienr, h.company_id, h.lease_leje_dato AS dato
    FROM public.maskin_haendelser h
    WHERE h.lease_leje_dato IS NOT NULL AND h.company_id IS NOT NULL
    UNION ALL
    SELECT s.serienr, l.company_id, il.faktura_dato
    FROM sn_ordre s
    JOIN public.invoice_lines il ON il.ordre_nr = s.ordre_nr AND il.afdeling_nr = s.afdeling_nr
     AND il.varegruppe_1 = '16' AND il.varegruppe_2 = '80'
    JOIN loc l ON l.visma_delivery_no = il.visma_delivery_no
    WHERE l.company_id IS NOT NULL AND il.faktura_dato IS NOT NULL
  ),
  enheder AS (
    SELECT h.serienr, h.lev_kundenr, h.company_id, h.kobt_dato, h.lease_leje_dato, h.maskin_type
    FROM public.maskin_haendelser h WHERE h.serienr IS NOT NULL
    UNION ALL
    SELECT m.serienr, m.lev_kundenr, NULL::uuid, m.kobt_dato, m.lease_leje_dato, NULL::text
    FROM public.machines m WHERE m.serienr IS NOT NULL AND m.afdeling_nr = 11
  ),
  ev_raa AS (
    SELECT e.serienr, e.lev_kundenr, e.company_id, 'salg'::text AS kilde, e.kobt_dato AS dato, e.maskin_type
    FROM enheder e WHERE e.kobt_dato IS NOT NULL
    UNION ALL
    SELECT e.serienr, e.lev_kundenr, e.company_id, 'leje'::text, e.lease_leje_dato, e.maskin_type
    FROM enheder e WHERE e.lease_leje_dato IS NOT NULL
  ),
  ev AS (
    SELECT DISTINCT ON (r.serienr, date_trunc('month', r.dato))
           date_trunc('month', r.dato)::date AS maaned,
           r.serienr, r.lev_kundenr, r.company_id, r.kilde, r.dato, r.maskin_type
    FROM ev_raa r
    WHERE r.dato >= date_trunc('month', _fra)::date
      AND r.dato < (date_trunc('month', _til) + interval '1 month')::date
      AND r.dato < date_trunc('month', current_date)::date
    ORDER BY r.serienr, date_trunc('month', r.dato),
             CASE WHEN r.kilde = 'salg' THEN 0 ELSE 1 END, (r.maskin_type IS NULL), r.dato
  ),
  med_kunde AS (
    SELECT ev.*, coalesce(ev.company_id, l.company_id) AS cid,
           (l.visma_delivery_no IS NOT NULL) AS har_lok, l.saelger_user_id AS lok_saelger
    FROM ev LEFT JOIN loc l ON l.visma_delivery_no = ev.lev_kundenr
  ),
  beriget AS (
    SELECT mk.maaned, mk.serienr, mk.kilde, mk.dato, mk.cid, c.name, c.city,
           public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
           coalesce(mk.maskin_type, mt.maskin_type) AS mtype,
           v.varenr, v.varetekst, v.beloeb,
           coalesce(public.maskin_bonusklasse(coalesce(mk.maskin_type, mt.maskin_type), mk.maaned), p.bonusklasse) AS bonusklasse,
           EXISTS (
             SELECT 1 FROM leje_hist lh, ordning o
             WHERE lh.serienr = mk.serienr AND lh.company_id = c.id AND mk.kilde = 'salg'
               AND lh.dato < (mk.dato - (o.mdr || ' months')::interval)
           ) AS overtaget
    FROM med_kunde mk
    JOIN public.companies c ON c.id = mk.cid
    LEFT JOIN mtype mt ON mt.serienr = mk.serienr
    LEFT JOIN vare v ON v.serienr = mk.serienr
    LEFT JOIN public.products p ON p.varenr = v.varenr
    WHERE (CASE WHEN mk.har_lok THEN mk.lok_saelger ELSE c.assigned_to END) = _saelger AND public.maalepunkt_adgang(_saelger)
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  )
  SELECT b.maaned, b.cid, b.name, b.city, b.kategori,
         CASE b.bonusklasse WHEN 'wittenborg' THEN 'Wittenborg' WHEN 'animo' THEN 'Animo'
           WHEN 'rex' THEN 'Rex-Royal' WHEN 'ingen' THEN 'Andet' ELSE 'Ukendt' END AS maerke,
         (coalesce(b.varetekst, '') ILIKE '%brugt%') AS brugt,
         b.kilde,
         coalesce(nullif(b.mtype, ''), nullif(b.varetekst, ''), b.serienr) AS model,
         1::numeric AS antal,
         b.dato AS faktura_dato,
         round(coalesce(b.beloeb, 0), 2) AS beloeb,
         b.serienr,
         b.bonusklasse,
         (b.overtaget OR b.bonusklasse IS NULL) AS udeladt,
         CASE
           WHEN b.overtaget THEN 'Overtagelse: tidligere leje hos samme kunde'
           WHEN b.bonusklasse IS NULL THEN 'Uklassificeret: ingen maskintype i maskinregistret'
           ELSE NULL
         END AS aarsag
  FROM beriget b
$function$;

CREATE OR REPLACE FUNCTION public.ny_kunde_bonus_maaned(_fra date, _til date)
 RETURNS TABLE(maaned date, saelger uuid, db numeric, rang integer, beloeb numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH m AS (
    SELECT g::date AS maaned
    FROM generate_series(date_trunc('month', greatest(_fra, DATE '2026-09-01')), date_trunc('month', _til), interval '1 month') g
    WHERE g::date < date_trunc('month', current_date)::date
  ),
  kunder AS (
    SELECT m.maaned, f.company_id
    FROM m JOIN public.sales_kunde_maaned f ON f.afdeling_nr = 11 AND f.period = m.maaned
    GROUP BY 1, 2 HAVING sum(f.rev) > 0
  ),
  nye AS (
    SELECT k.maaned, k.company_id FROM kunder k
    WHERE NOT EXISTS (
      SELECT 1 FROM public.sales_kunde_maaned g
      WHERE g.afdeling_nr = 11 AND g.company_id = k.company_id
        AND g.period >= (k.maaned - interval '24 months')::date AND g.period < k.maaned AND g.rev <> 0)
  ),
  pr AS (
    SELECT n.maaned, f.saelger, sum(f.contrib) AS db
    FROM nye n
    JOIN public.sales_kunde_maaned f ON f.afdeling_nr = 11 AND f.period = n.maaned AND f.company_id = n.company_id
    JOIN public.companies c ON c.id = n.company_id
    WHERE f.saelger IS NOT NULL AND coalesce(c.customer_segment_3, '') NOT LIKE '40%'
    GROUP BY 1, 2
  ),
  berettiget AS (
    SELECT pr.* FROM pr
    WHERE EXISTS (
      SELECT 1 FROM public.bonus_ordning b
      WHERE b.user_id = pr.saelger AND b.gyldig_fra <= pr.maaned
        AND (b.gyldig_til IS NULL OR b.gyldig_til >= pr.maaned)
        AND b.flatrate IS NULL AND coalesce(b.db_provision_pct, 0) > 0)
  ),
  rangeret AS (
    SELECT b.*, (rank() OVER (PARTITION BY b.maaned ORDER BY b.db DESC))::int AS rang
    FROM berettiget b WHERE b.db > 0
  )
  SELECT r.maaned, r.saelger, round(r.db, 2), r.rang,
         (CASE r.rang WHEN 1 THEN 1000 WHEN 2 THEN 600 ELSE 0 END)::numeric
  FROM rangeret r
  WHERE public.maalepunkt_adgang(r.saelger)
$function$;

DROP FUNCTION IF EXISTS public.bonus_pr_maaned(uuid, date, date);

CREATE FUNCTION public.bonus_pr_maaned(_saelger uuid, _fra date, _til date)
 RETURNS TABLE(maaned date, ordning_id uuid, db_grundlag numeric, db_provision_pct numeric, db_bonus numeric, antal_wittenborg numeric, antal_animo numeric, antal_rex numeric, maskinbonus numeric, ny_kunde_db numeric, ny_kunde_rang integer, ny_kunde_bonus numeric, samlet_bonus numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
    SELECT m.maaned, b.* FROM m
    LEFT JOIN public.bonus_ordning b ON b.user_id = _saelger AND b.gyldig_fra <= m.maaned
     AND (b.gyldig_til IS NULL OR b.gyldig_til >= m.maaned)
  ),
  db AS (
    SELECT f.period AS maaned, f.kat AS kategori, sum(f.contrib) AS vaerdi
    FROM public.sales_kunde_maaned f
    WHERE f.afdeling_nr = 11
      AND f.period >= date_trunc('month', _fra)::date AND f.period <= date_trunc('month', _til)::date
      AND f.period < date_trunc('month', current_date)::date
      AND f.saelger = _saelger AND f.gyldig AND f.kat IS NOT NULL
    GROUP BY 1, 2
  ),
  db_pr AS (
    SELECT o.maaned, coalesce(sum(db.vaerdi), 0) AS grundlag
    FROM o LEFT JOIN db ON db.maaned = o.maaned
      AND ((db.kategori = 'privat' AND coalesce(o.db_privat, false))
        OR (db.kategori = 'offentlig' AND coalesce(o.db_offentlig, false)))
    GROUP BY o.maaned
  ),
  mask AS (SELECT * FROM public.bonus_maskin_grundlag(_saelger, _fra, _til)),
  mask_pr AS (
    SELECT o.maaned,
           coalesce(sum(CASE WHEN mask.bonusklasse = 'wittenborg' THEN mask.antal END), 0) AS w,
           coalesce(sum(CASE WHEN mask.bonusklasse = 'animo' THEN mask.antal END), 0) AS a,
           coalesce(sum(CASE WHEN mask.bonusklasse = 'rex' THEN mask.antal END), 0) AS r
    FROM o LEFT JOIN mask ON mask.maaned = o.maaned AND NOT mask.udeladt
      AND ((mask.kategori = 'privat' AND coalesce(o.maskin_privat, false))
        OR (mask.kategori = 'offentlig' AND coalesce(o.maskin_offentlig, false)))
      AND ((mask.kilde = 'salg' AND coalesce(o.maskin_salg, false))
        OR (mask.kilde = 'leje' AND coalesce(o.maskin_leje, false)))
      AND (NOT mask.brugt OR coalesce(o.maskin_brugt, false))
    GROUP BY o.maaned
  ),
  nyk AS (
    SELECT n.maaned, n.db, n.rang, n.beloeb
    FROM public.ny_kunde_bonus_maaned(_fra, _til) n WHERE n.saelger = _saelger
  ),
  raa AS (
    SELECT o.maaned, o.id AS ordning_id, o.flatrate,
           o.db_bund, o.db_top, o.maskin_bund, o.maskin_top, o.total_bund, o.total_top,
           db_pr.grundlag, coalesce(o.db_provision_pct, 0) AS pct,
           db_pr.grundlag * coalesce(o.db_provision_pct, 0) / 100 - coalesce(o.db_fradrag, 0) AS db_raa,
           mask_pr.w, mask_pr.a, mask_pr.r,
           mask_pr.w * coalesce(o.bonus_wittenborg, 0) + mask_pr.a * coalesce(o.bonus_animo, 0)
         + mask_pr.r * coalesce(o.bonus_rex, 0) AS mask_raa,
           nyk.db AS nyk_db, nyk.rang AS nyk_rang, coalesce(nyk.beloeb, 0) AS nyk_beloeb
    FROM o
    JOIN db_pr ON db_pr.maaned = o.maaned
    JOIN mask_pr ON mask_pr.maaned = o.maaned
    LEFT JOIN nyk ON nyk.maaned = o.maaned
  ),
  klemt AS (
    SELECT raa.*,
           least(greatest(raa.db_raa, coalesce(raa.db_bund, raa.db_raa)),
                 coalesce(raa.db_top, greatest(raa.db_raa, coalesce(raa.db_bund, raa.db_raa)))) AS db_klemt,
           least(greatest(raa.mask_raa, coalesce(raa.maskin_bund, raa.mask_raa)),
                 coalesce(raa.maskin_top, greatest(raa.mask_raa, coalesce(raa.maskin_bund, raa.mask_raa)))) AS mask_klemt
    FROM raa
  )
  SELECT k.maaned, k.ordning_id, round(k.grundlag, 2), k.pct,
         round(CASE WHEN k.flatrate IS NOT NULL THEN 0 ELSE k.db_klemt END, 2),
         k.w, k.a, k.r,
         round(CASE WHEN k.flatrate IS NOT NULL THEN 0 ELSE k.mask_klemt END, 2),
         round(k.nyk_db, 2), k.nyk_rang,
         round(CASE WHEN k.flatrate IS NOT NULL THEN 0 ELSE k.nyk_beloeb END, 2),
         round(CASE WHEN k.flatrate IS NOT NULL THEN k.flatrate
           ELSE least(
             greatest(k.db_klemt + k.mask_klemt + k.nyk_beloeb, coalesce(k.total_bund, k.db_klemt + k.mask_klemt + k.nyk_beloeb)),
             coalesce(k.total_top, greatest(k.db_klemt + k.mask_klemt + k.nyk_beloeb, coalesce(k.total_bund, k.db_klemt + k.mask_klemt + k.nyk_beloeb))))
           END, 2)
  FROM klemt k
  ORDER BY k.maaned;
END;
$function$;