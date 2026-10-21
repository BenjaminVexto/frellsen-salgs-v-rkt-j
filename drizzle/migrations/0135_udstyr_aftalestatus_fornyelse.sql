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
  ), agg AS (
    SELECT u.lev, sum(leje) leje, sum(belastning) bel, sum(service_ind) si, sum(aftale_kost) ak, sum(montoer) mo,
      sum(reservedele) rd, sum(patroner) pa, sum(varer_db) vdb, count(*) FILTER (WHERE varer_db <> 0) vmd,
      (array_agg(extract(month FROM u.maaned)::int ORDER BY u.service_ind DESC) FILTER (WHERE u.service_ind > 0))[1] fm
    FROM udstyr_lok_maaned u WHERE u.lev IN (SELECT lev FROM lok) AND u.maaned BETWEEN _fra AND _til GROUP BY u.lev
  ), lt AS (
    SELECT lev, jsonb_object_agg(maskintype, s) typer FROM (
      SELECT lev, maskintype, sum(leje) s FROM udstyr_leje_type_maaned WHERE lev IN (SELECT lev FROM lok) AND maaned BETWEEN _fra AND _til GROUP BY 1,2) x GROUP BY lev
  ), mk AS (
    SELECT m.id, m.serienr, m.lev_kundenr lev, m.beskrivelse, udstyr_type_tekst(m.beskrivelse) type,
      CASE WHEN m.udlanstype ~ '^\d' THEN left(m.udlanstype,1)::int ELSE 0 END udl,
      coalesce(m.lease_leje_dato, m.kobt_dato) opsat, m.taellerstand taeller,
      e.aftale_type, e.status
    FROM machines m
    LEFT JOIN LATERAL (SELECT aftale_type, data->>'status' status FROM machine_enrichment e
       WHERE e.serienr = m.serienr AND e.record_status='aktiv' AND (e.afdeling_nr IS NULL OR e.afdeling_nr = 11)
       ORDER BY e.updated_at DESC LIMIT 1) e ON true
    WHERE m.record_status = 'aktiv' AND m.afdeling_nr = 11 AND m.lev_kundenr IN (SELECT lev FROM lok)
  )
  SELECT jsonb_build_object(
    'erAdmin', _admin,
    'lok', coalesce((SELECT jsonb_agg(jsonb_build_object('lev', lok.lev, 'id', lok.id, 'cid', lok.company_id, 'kunde', lok.kunde,
        'adr', concat_ws(', ', lok.address, concat_ws(' ', lok.zip, lok.city)),
        'leje', coalesce(a.leje,0), 'bel', coalesce(a.bel,0), 'si', coalesce(a.si,0), 'ak', coalesce(a.ak,0), 'mo', coalesce(a.mo,0),
        'rd', coalesce(a.rd,0), 'pa', coalesce(a.pa,0), 'vdb', coalesce(a.vdb,0), 'vmd', coalesce(a.vmd,0), 'fm', a.fm,
        'lt', coalesce(lt.typer,'{}'::jsonb)))
      FROM lok LEFT JOIN agg a ON a.lev = lok.lev LEFT JOIN lt ON lt.lev = lok.lev
      WHERE a.lev IS NOT NULL OR EXISTS (SELECT 1 FROM mk WHERE mk.lev = lok.lev)), '[]'::jsonb),
    'mk', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'sn', serienr, 'lev', lev, 'b', beskrivelse, 't', type, 'u', udl,
        'o', opsat, 'tl', taeller, 'at', aftale_type, 'st', status)) FROM mk), '[]'::jsonb)
  ) INTO res;
  RETURN res;
END $$;