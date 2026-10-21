ALTER TABLE public.udstyr_lok_maaned ADD COLUMN IF NOT EXISTS reparation_kost numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.udstyr_lok_maaned.reparation_kost IS 'Kostpris (beløb − DB) for reservedele (17) + montør/kørsel (18).';

CREATE OR REPLACE FUNCTION public.udstyr_refresh_maaned(_m date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM udstyr_lok_maaned WHERE maaned = _m;
  DELETE FROM udstyr_leje_type_maaned WHERE maaned = _m;
  INSERT INTO udstyr_lok_maaned (lev, maaned, leje, belastning, service_ind, aftale_kost, montoer, reservedele, patroner, varer_db, reparation_kost)
  SELECT visma_delivery_no, _m,
    coalesce(sum(beloeb) FILTER (WHERE varegruppe_1='16' AND varegruppe_2='80' AND varenr<>'70000'),0),
    coalesce(sum(db) FILTER (WHERE varenr='70000'),0),
    coalesce(sum(beloeb) FILTER (WHERE varegruppe_1='16' AND varegruppe_2='82' AND varenr<>'70000'),0),
    coalesce(sum(beloeb-db) FILTER (WHERE varegruppe_1='16' AND varegruppe_2='82' AND varenr<>'70000'),0),
    coalesce(sum(db) FILTER (WHERE varegruppe_1='16' AND varegruppe_2='83'),0),
    coalesce(sum(db) FILTER (WHERE varegruppe_1='18'),0),
    coalesce(sum(db) FILTER (WHERE varegruppe_1='17'),0),
    coalesce(sum(db) FILTER (WHERE coalesce(varegruppe_1,'') NOT IN ('16','17','18') AND varenr<>'70000'),0),
    coalesce(sum(beloeb-db) FILTER (WHERE varegruppe_1 IN ('17','18')),0)
  FROM invoice_lines WHERE afdeling_nr=11 AND period=_m AND visma_delivery_no IS NOT NULL
  GROUP BY visma_delivery_no;
  INSERT INTO udstyr_leje_type_maaned (lev, maaned, maskintype, leje)
  SELECT i.visma_delivery_no, _m, udstyr_type_leje(p.bonusklasse, i.varetekst), sum(i.beloeb)
  FROM invoice_lines i LEFT JOIN products p ON p.varenr=i.varenr
  WHERE i.afdeling_nr=11 AND i.period=_m AND i.varegruppe_1='16' AND i.varegruppe_2='80' AND i.varenr<>'70000' AND i.visma_delivery_no IS NOT NULL
  GROUP BY 1,2,3;
END $$;
REVOKE ALL ON FUNCTION public.udstyr_refresh_maaned(date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.udstyr_grundlag(_saelger uuid, _alle boolean, _fra date, _til date, _company uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin boolean; res jsonb;
BEGIN
  IF public.er_telemarketing() THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  _admin := public.is_admin(auth.uid());
  IF NOT _admin THEN _saelger := auth.uid(); _alle := false; END IF;
  WITH lok AS (
    SELECT l.id, l.visma_delivery_no lev, l.company_id, c.name kunde, l.address, l.zip, l.city
    FROM locations l JOIN companies c ON c.id = l.company_id
    WHERE l.afdeling_nr = 11 AND l.visma_delivery_no IS NOT NULL
      AND (_alle OR l.saelger_user_id = _saelger)
      AND (_company IS NULL OR l.company_id = _company)
      AND public.kundetype(c.customer_segment_3) <> 'intern'
      AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.full_name IS NOT NULL AND lower(btrim(p.full_name)) = lower(btrim(c.name)))
  ), agg AS (
    SELECT u.lev, sum(leje) leje, sum(belastning) bel, sum(service_ind) si, sum(aftale_kost) ak, sum(montoer) mo,
      sum(reservedele) rd, sum(patroner) pa, sum(varer_db) vdb, count(*) FILTER (WHERE varer_db <> 0) vmd,
      sum(reparation_kost) rk,
      (array_agg(extract(month FROM u.maaned)::int ORDER BY u.service_ind DESC) FILTER (WHERE u.service_ind > 0))[1] fm
    FROM udstyr_lok_maaned u WHERE u.lev IN (SELECT lev FROM lok) AND u.maaned BETWEEN _fra AND _til GROUP BY u.lev
  ), lt AS (
    SELECT lev, jsonb_object_agg(maskintype, s) typer FROM (
      SELECT lev, maskintype, sum(leje) s FROM udstyr_leje_type_maaned WHERE lev IN (SELECT lev FROM lok) AND maaned BETWEEN _fra AND _til GROUP BY 1,2) x GROUP BY lev
  ), mk AS (
    SELECT m.id::text id, m.serienr, m.lev_kundenr lev, m.beskrivelse, udstyr_type_tekst(m.beskrivelse) type,
      CASE WHEN m.udlanstype ~ '^\d' THEN left(m.udlanstype,1)::int ELSE 0 END udl,
      coalesce(m.lease_leje_dato, m.kobt_dato) opsat, m.taellerstand taeller,
      e.aftale_type, e.status
    FROM machines m
    LEFT JOIN LATERAL (SELECT aftale_type, data->>'status' status FROM machine_enrichment e
       WHERE e.serienr = m.serienr AND e.record_status='aktiv' AND (e.afdeling_nr IS NULL OR e.afdeling_nr = 11)
         AND NOT (public.udstyr_er_filter(m.beskrivelse) AND NOT public.udstyr_er_filter(e.data->>'maskin_type'))
       ORDER BY e.updated_at DESC LIMIT 1) e ON true
    WHERE m.record_status = 'aktiv' AND m.afdeling_nr = 11 AND m.lev_kundenr IN (SELECT lev FROM lok)
    UNION ALL
    SELECT 'e:' || e.serienr, e.serienr, e.data->>'lev_kundenr', d.b, udstyr_type_tekst(d.b), 0,
      coalesce(e.lease_leje_dato, e.kobt_dato,
        CASE WHEN e.data->>'beregnet_startdato' ~ '^\d{4}-\d{2}-\d{2}$' THEN (e.data->>'beregnet_startdato')::date END),
      CASE WHEN e.data->>'taellerstand' ~ '^\d+$' THEN (e.data->>'taellerstand')::numeric END,
      e.aftale_type, e.data->>'status'
    FROM machine_enrichment e
    CROSS JOIN LATERAL (SELECT regexp_replace(coalesce(e.data->>'maskin_type',''), '^\d+\s*\[|\]$', '', 'g') b) d
    WHERE e.record_status = 'aktiv' AND (e.afdeling_nr IS NULL OR e.afdeling_nr = 11)
      AND e.data->>'lev_kundenr' IN (SELECT lev FROM lok)
      AND NOT public.udstyr_er_filter(e.data->>'maskin_type')
      AND NOT EXISTS (SELECT 1 FROM machines m WHERE m.serienr = e.serienr AND m.record_status = 'aktiv'
                      AND NOT public.udstyr_er_filter(m.beskrivelse))
  )
  SELECT jsonb_build_object(
    'erAdmin', _admin,
    'lok', coalesce((SELECT jsonb_agg(jsonb_build_object('lev', lok.lev, 'id', lok.id, 'cid', lok.company_id, 'kunde', lok.kunde,
        'adr', concat_ws(', ', lok.address, concat_ws(' ', lok.zip, lok.city)),
        'leje', coalesce(a.leje,0), 'bel', coalesce(a.bel,0), 'si', coalesce(a.si,0), 'ak', coalesce(a.ak,0), 'mo', coalesce(a.mo,0),
        'rd', coalesce(a.rd,0), 'pa', coalesce(a.pa,0), 'vdb', coalesce(a.vdb,0), 'vmd', coalesce(a.vmd,0), 'fm', a.fm,
        'rk', coalesce(a.rk,0), 'lt', coalesce(lt.typer,'{}'::jsonb)))
      FROM lok LEFT JOIN agg a ON a.lev = lok.lev LEFT JOIN lt ON lt.lev = lok.lev
      WHERE a.lev IS NOT NULL OR EXISTS (SELECT 1 FROM mk WHERE mk.lev = lok.lev)), '[]'::jsonb),
    'mk', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'sn', serienr, 'lev', lev, 'b', beskrivelse, 't', type, 'u', udl,
        'o', opsat, 'tl', taeller, 'at', aftale_type, 'st', status)) FROM mk), '[]'::jsonb)
  ) INTO res;
  RETURN res;
END $$;

INSERT INTO public.udstyr_refresh_ko(maaned)
SELECT DISTINCT period FROM public.invoice_lines WHERE afdeling_nr=11 AND period >= date '2024-01-01' ON CONFLICT DO NOTHING;