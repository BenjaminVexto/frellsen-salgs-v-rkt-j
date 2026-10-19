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
    ORDER BY s.serienr, (coalesce(il.antal, 0) > 0) DESC, il.faktura_dato DESC
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
  sn_net AS (
    SELECT btrim(split_part(il.varetekst, ':', 2)) AS serienr, il.ordre_nr,
           sum(il.antal) AS net, min(il.faktura_dato) FILTER (WHERE il.antal > 0) AS fdato
    FROM public.invoice_lines il
    WHERE il.afdeling_nr = 11 AND il.varegruppe_2 = '83' AND il.varetekst ILIKE 'serienr%'
      AND il.ordre_nr IS NOT NULL
      AND btrim(split_part(il.varetekst, ':', 2)) IN (SELECT mk.serienr FROM med_kunde mk WHERE mk.maaned >= DATE '2026-09-01')
    GROUP BY 1, 2
  ),
  lev_ordre AS (
    SELECT DISTINCT ON (mk.serienr, mk.maaned) mk.serienr, mk.maaned, s.ordre_nr
    FROM med_kunde mk
    JOIN sn_net s ON s.serienr = mk.serienr AND s.net > 0 AND s.fdato IS NOT NULL
    WHERE mk.maaned >= DATE '2026-09-01'
      AND s.fdato BETWEEN mk.dato - 60 AND mk.dato + 60
    ORDER BY mk.serienr, mk.maaned, abs(s.fdato - mk.dato)
  ),
  retur AS (
    SELECT x.ordre_nr, sum(x.nb) AS retur_beloeb, string_agg(x.txt, ' / ') AS retur_txt
    FROM (
      SELECT il.ordre_nr, il.varenr, min(il.varetekst) AS txt, sum(il.antal) AS na, sum(il.beloeb) AS nb
      FROM public.invoice_lines il
      WHERE il.afdeling_nr = 11 AND il.varegruppe_1 = '16' AND il.varegruppe_2 IN ('78','80','84')
        AND il.ordre_nr IN (SELECT lo.ordre_nr FROM lev_ordre lo)
        AND NOT public.maskin_er_tilvalg(il.varetekst)
        AND coalesce(il.varetekst, '') !~* 'brita|kit|filter|beholder|mælk|bordplade|flowjet|pumpe|grums|vitrifrigo'
      GROUP BY 1, 2
    ) x
    WHERE x.na < 0
    GROUP BY 1
  ),
  binding AS (
    SELECT DISTINCT ON (me.serienr) me.serienr, me.binding_ophor
    FROM public.machine_enrichment me
    WHERE me.record_status = 'aktiv'
    ORDER BY me.serienr, me.updated_at DESC
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
           ) AS overtaget,
           (r.ordre_nr IS NOT NULL) AS udskiftning,
           coalesce(r.retur_beloeb, 0) AS retur_beloeb,
           bd.binding_ophor
    FROM med_kunde mk
    JOIN public.companies c ON c.id = mk.cid
    LEFT JOIN mtype mt ON mt.serienr = mk.serienr
    LEFT JOIN vare v ON v.serienr = mk.serienr
    LEFT JOIN public.products p ON p.varenr = v.varenr
    LEFT JOIN lev_ordre lo ON lo.serienr = mk.serienr AND lo.maaned = mk.maaned
    LEFT JOIN retur r ON r.ordre_nr = lo.ordre_nr
    LEFT JOIN binding bd ON bd.serienr = mk.serienr
    WHERE (CASE WHEN mk.har_lok THEN mk.lok_saelger ELSE c.assigned_to END) = _saelger AND public.maalepunkt_adgang(_saelger)
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  ),
  vurderet AS (
    SELECT b.*,
           CASE
             WHEN NOT b.udskiftning THEN NULL
             WHEN b.kilde = 'salg' AND b.retur_beloeb < 0 THEN 'byttehandel'
             WHEN b.kilde = 'leje' AND (b.binding_ophor IS NULL
                  OR b.binding_ophor < (date_trunc('month', b.dato) + interval '23 months')::date) THEN 'ingen_binding'
             ELSE NULL
           END AS udskift_afvist
    FROM beriget b
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
         (b.overtaget OR b.bonusklasse IS NULL OR b.udskift_afvist IS NOT NULL) AS udeladt,
         CASE
           WHEN b.overtaget THEN 'Overtagelse: tidligere leje hos samme kunde'
           WHEN b.bonusklasse IS NULL THEN 'Uklassificeret: ingen maskintype i maskinregistret'
           WHEN b.udskift_afvist = 'byttehandel' THEN 'Udskiftning: Frellsen betaler for returmaskinen (byttehandel)'
           WHEN b.udskift_afvist = 'ingen_binding' THEN 'Udskiftning uden ny lejebinding på min. 2 år'
           ELSE NULL
         END AS aarsag
   FROM vurderet b
$function$;