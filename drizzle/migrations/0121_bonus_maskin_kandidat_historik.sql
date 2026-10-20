DO $migration$
DECLARE f text; a text; b text;
BEGIN
  f := pg_get_functiondef('public.bonus_maskin_grundlag(uuid,date,date)'::regprocedure);
  a := substring(f from position('  enheder AS (' in f) for position('  sn_net AS (' in f) - position('  enheder AS (' in f));
  IF a IS NULL OR a = '' THEN RAISE EXCEPTION 'Unexpected machine basis definition'; END IF;
  b := replace(a, '  enheder AS (', '  kandidat_enheder AS (');
  b := replace(b, 'FROM enheder e', 'FROM kandidat_enheder e');
  b := replace(b, '  ev_raa AS (', '  kandidat_events AS (');
  b := replace(b, 'FROM ev_raa r', 'FROM kandidat_events r');
  b := replace(b, '  ev AS (', '  ev AS MATERIALIZED (');
  b := replace(b, '  med_kunde AS (', '  kandidat_kunde AS (');
  b := replace(b, 'FROM public.maskin_haendelser h WHERE h.serienr IS NOT NULL', 'FROM public.maskin_haendelser h WHERE h.serienr IS NOT NULL AND (h.kobt_dato >= date_trunc(''month'', _fra)::date AND h.kobt_dato < (date_trunc(''month'', _til) + interval ''1 month'')::date OR h.lease_leje_dato >= date_trunc(''month'', _fra)::date AND h.lease_leje_dato < (date_trunc(''month'', _til) + interval ''1 month'')::date)');
  b := replace(b, 'm.afdeling_nr = 11', 'm.afdeling_nr = 11 AND (m.kobt_dato >= date_trunc(''month'', _fra)::date AND m.kobt_dato < (date_trunc(''month'', _til) + interval ''1 month'')::date OR m.lease_leje_dato >= date_trunc(''month'', _fra)::date AND m.lease_leje_dato < (date_trunc(''month'', _til) + interval ''1 month'')::date)');
  b := b || $ctes$
  med_kunde AS MATERIALIZED (
    SELECT mk.* FROM kandidat_kunde mk JOIN public.companies c ON c.id = mk.cid
    WHERE (CASE WHEN mk.har_lok THEN mk.lok_saelger ELSE c.assigned_to END) = _saelger
      AND public.maalepunkt_adgang(_saelger)
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  ),
  kandidat_sn AS MATERIALIZED (SELECT DISTINCT serienr FROM med_kunde),
  kandidat_lok AS MATERIALIZED (SELECT DISTINCT lev_kundenr FROM med_kunde),
  historik_sn AS MATERIALIZED (
    SELECT serienr FROM kandidat_sn
    UNION SELECT h.serienr FROM public.maskin_haendelser h JOIN kandidat_lok k ON k.lev_kundenr = h.lev_kundenr
    UNION SELECT m.serienr FROM public.machines m JOIN kandidat_lok k ON k.lev_kundenr = m.lev_kundenr WHERE m.afdeling_nr=11
  ),
  enheder AS MATERIALIZED (
    SELECT h.serienr, h.lev_kundenr, h.company_id, h.kobt_dato, h.lease_leje_dato, h.maskin_type
    FROM historik_sn k JOIN public.maskin_haendelser h ON h.serienr=k.serienr
    UNION ALL
    SELECT m.serienr, m.lev_kundenr, NULL::uuid, m.kobt_dato, m.lease_leje_dato, NULL::text
    FROM historik_sn k JOIN public.machines m ON m.serienr=k.serienr WHERE m.afdeling_nr=11
  ),
  ev_raa AS MATERIALIZED (
    SELECT e.serienr, e.lev_kundenr, e.company_id, 'salg'::text AS kilde, e.kobt_dato AS dato, e.maskin_type
    FROM enheder e WHERE e.kobt_dato IS NOT NULL
    UNION ALL
    SELECT e.serienr, e.lev_kundenr, e.company_id, 'leje'::text, e.lease_leje_dato, e.maskin_type
    FROM enheder e WHERE e.lease_leje_dato IS NOT NULL
  ),
$ctes$;
  f := replace(f, a, '');
  f := replace(f, '  sn_ordre AS (', b || '  sn_ordre AS (');
  f := replace(f, E'FROM public.invoice_lines il\n    WHERE il.afdeling_nr = 11 AND il.varegruppe_1', E'FROM kandidat_sn ks JOIN public.invoice_lines il ON btrim(split_part(il.varetekst, '':'' , 2)) = ks.serienr\n    WHERE il.afdeling_nr = 11 AND il.varegruppe_1');
  f := replace(f, E'FROM public.maskin_haendelser h\n    WHERE h.serienr', E'FROM historik_sn hs JOIN public.maskin_haendelser h ON h.serienr = hs.serienr\n    WHERE h.serienr');
  f := replace(f, E'FROM public.machines m\n    WHERE m.afdeling_nr', E'FROM kandidat_lok kl JOIN public.machines m ON m.lev_kundenr=kl.lev_kundenr\n    WHERE m.afdeling_nr');
  EXECUTE f;
END $migration$;