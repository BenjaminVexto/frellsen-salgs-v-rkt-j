
CREATE OR REPLACE FUNCTION public.udstyr_refresh_maaned(_m date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM udstyr_lok_maaned WHERE maaned = _m;
  DELETE FROM udstyr_leje_type_maaned WHERE maaned = _m;
  INSERT INTO udstyr_lok_maaned (lev, maaned, leje, belastning, service_ind, aftale_kost, montoer, reservedele, patroner, varer_db)
  SELECT visma_delivery_no, _m,
    coalesce(sum(beloeb) FILTER (WHERE varegruppe_1='16' AND varegruppe_2='80' AND varenr<>'70000'),0),
    coalesce(sum(db) FILTER (WHERE varenr='70000'),0),
    coalesce(sum(beloeb) FILTER (WHERE varegruppe_1='16' AND varegruppe_2='82' AND varenr<>'70000'),0),
    coalesce(sum(beloeb-db) FILTER (WHERE varegruppe_1='16' AND varegruppe_2='82' AND varenr<>'70000'),0),
    coalesce(sum(db) FILTER (WHERE varegruppe_1='16' AND varegruppe_2='83'),0),
    coalesce(sum(db) FILTER (WHERE varegruppe_1='18'),0),
    coalesce(sum(db) FILTER (WHERE varegruppe_1='17'),0),
    coalesce(sum(db) FILTER (WHERE coalesce(varegruppe_1,'') NOT IN ('16','17','18') AND varenr<>'70000'),0)
  FROM invoice_lines WHERE afdeling_nr=11 AND period=_m AND visma_delivery_no IS NOT NULL
  GROUP BY visma_delivery_no;
  INSERT INTO udstyr_leje_type_maaned (lev, maaned, maskintype, leje)
  SELECT i.visma_delivery_no, _m, udstyr_type_leje(p.bonusklasse, i.varetekst), sum(i.beloeb)
  FROM invoice_lines i LEFT JOIN products p ON p.varenr=i.varenr
  WHERE i.afdeling_nr=11 AND i.period=_m AND i.varegruppe_1='16' AND i.varegruppe_2='80' AND i.varenr<>'70000' AND i.visma_delivery_no IS NOT NULL
  GROUP BY 1,2,3;
END $$;
REVOKE ALL ON FUNCTION public.udstyr_refresh_maaned(date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._udstyr_ko_ny() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO udstyr_refresh_ko(maaned) SELECT DISTINCT period FROM new_rows WHERE period IS NOT NULL AND afdeling_nr=11 ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public._udstyr_ko_gammel() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO udstyr_refresh_ko(maaned) SELECT DISTINCT period FROM old_rows WHERE period IS NOT NULL AND afdeling_nr=11 ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;
CREATE TRIGGER udstyr_ko_insert AFTER INSERT ON public.invoice_lines REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public._udstyr_ko_ny();
CREATE TRIGGER udstyr_ko_delete AFTER DELETE ON public.invoice_lines REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public._udstyr_ko_gammel();
CREATE TRIGGER udstyr_ko_update_ny AFTER UPDATE ON public.invoice_lines REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public._udstyr_ko_ny();
CREATE TRIGGER udstyr_ko_update_gl AFTER UPDATE ON public.invoice_lines REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public._udstyr_ko_gammel();

CREATE OR REPLACE FUNCTION public.udstyr_toem_ko(_maks int DEFAULT 6) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT maaned FROM udstyr_refresh_ko ORDER BY tilfoejet_at LIMIT _maks FOR UPDATE SKIP LOCKED LOOP
    PERFORM udstyr_refresh_maaned(r.maaned);
    DELETE FROM udstyr_refresh_ko WHERE maaned = r.maaned;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.udstyr_toem_ko(int) FROM PUBLIC, anon, authenticated;

INSERT INTO public.udstyr_refresh_ko(maaned)
SELECT DISTINCT period FROM public.invoice_lines WHERE afdeling_nr=11 AND period >= date '2024-01-01' ON CONFLICT DO NOTHING;

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
      sum(reservedele) rd, sum(patroner) pa, sum(varer_db) vdb, count(*) FILTER (WHERE varer_db <> 0) vmd
    FROM udstyr_lok_maaned u WHERE u.lev IN (SELECT lev FROM lok) AND u.maaned BETWEEN _fra AND _til GROUP BY u.lev
  ), lt AS (
    SELECT lev, jsonb_object_agg(maskintype, s) typer FROM (
      SELECT lev, maskintype, sum(leje) s FROM udstyr_leje_type_maaned WHERE lev IN (SELECT lev FROM lok) AND maaned BETWEEN _fra AND _til GROUP BY 1,2) x GROUP BY lev
  ), mk AS (
    SELECT m.id, m.serienr, m.lev_kundenr lev, m.beskrivelse, m.varenr, udstyr_type_tekst(m.beskrivelse) type,
      CASE WHEN m.udlanstype ~ '^\d' THEN left(m.udlanstype,1)::int ELSE 0 END udl,
      coalesce(m.lease_leje_dato, m.kobt_dato) opsat, m.taellerstand taeller,
      e.aftale_type, coalesce(e.beregnet_slutdato, e.binding_ophor) aftale_slut
    FROM machines m
    LEFT JOIN LATERAL (SELECT aftale_type, beregnet_slutdato, binding_ophor FROM machine_enrichment e
       WHERE e.serienr = m.serienr AND e.record_status='aktiv' AND (e.afdeling_nr IS NULL OR e.afdeling_nr = 11)
       ORDER BY e.updated_at DESC LIMIT 1) e ON true
    WHERE m.record_status = 'aktiv' AND m.afdeling_nr = 11 AND m.lev_kundenr IN (SELECT lev FROM lok)
  )
  SELECT jsonb_build_object(
    'erAdmin', _admin,
    'lok', coalesce((SELECT jsonb_agg(jsonb_build_object('lev', lok.lev, 'id', lok.id, 'cid', lok.company_id, 'kunde', lok.kunde,
        'adr', concat_ws(', ', lok.address, concat_ws(' ', lok.zip, lok.city)),
        'leje', coalesce(a.leje,0), 'bel', coalesce(a.bel,0), 'si', coalesce(a.si,0), 'ak', coalesce(a.ak,0), 'mo', coalesce(a.mo,0),
        'rd', coalesce(a.rd,0), 'pa', coalesce(a.pa,0), 'vdb', coalesce(a.vdb,0), 'vmd', coalesce(a.vmd,0), 'lt', coalesce(lt.typer,'{}'::jsonb)))
      FROM lok LEFT JOIN agg a ON a.lev = lok.lev LEFT JOIN lt ON lt.lev = lok.lev
      WHERE a.lev IS NOT NULL OR EXISTS (SELECT 1 FROM mk WHERE mk.lev = lok.lev)), '[]'::jsonb),
    'mk', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'sn', serienr, 'lev', lev, 'b', beskrivelse, 't', type, 'u', udl,
        'o', opsat, 'tl', taeller, 'at', aftale_type, 'as', aftale_slut)) FROM mk), '[]'::jsonb)
  ) INTO res;
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.udstyr_grundlag(uuid, boolean, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.udstyr_grundlag(uuid, boolean, date, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.udstyr_linjer(_lev text, _fra date, _til date)
RETURNS TABLE(period date, varenr text, varetekst text, varegruppe text, antal numeric, beloeb numeric, kostpris numeric, db numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin'; END IF;
  RETURN QUERY SELECT i.period, i.varenr, i.varetekst, i.varegruppe_1||'/'||coalesce(i.varegruppe_2,''), i.antal, i.beloeb, i.beloeb - i.db, i.db
  FROM invoice_lines i WHERE i.afdeling_nr=11 AND i.visma_delivery_no=_lev AND i.period BETWEEN _fra AND _til
    AND (i.varegruppe_1 IN ('16','17','18') OR i.varenr='70000') ORDER BY i.period DESC, i.varegruppe_1 LIMIT 2000;
END $$;
REVOKE ALL ON FUNCTION public.udstyr_linjer(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.udstyr_linjer(text, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.udstyr_leje_uden_bonusklasse()
RETURNS TABLE(varenr text, varetekst text, maskintype text, beloeb_12m numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin'; END IF;
  RETURN QUERY SELECT i.varenr, max(i.varetekst), udstyr_type_tekst(max(i.varetekst)), sum(i.beloeb)
  FROM invoice_lines i LEFT JOIN products p ON p.varenr=i.varenr
  WHERE i.afdeling_nr=11 AND i.varegruppe_1='16' AND i.varegruppe_2='80' AND i.varenr<>'70000'
    AND i.period >= (date_trunc('month', now()) - interval '12 months')::date
    AND (p.bonusklasse IS NULL OR lower(p.bonusklasse) = 'ingen')
  GROUP BY i.varenr ORDER BY 4 DESC;
END $$;
REVOKE ALL ON FUNCTION public.udstyr_leje_uden_bonusklasse() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.udstyr_leje_uden_bonusklasse() TO authenticated;
