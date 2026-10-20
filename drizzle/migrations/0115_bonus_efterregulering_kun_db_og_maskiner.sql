CREATE OR REPLACE FUNCTION public._bonus_laas_saelger(_admin uuid, _saelger uuid, _maaned date, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = 0 AS $$
DECLARE
  m date := date_trunc('month', _maaned)::date;
  k date; lv record; lb record; t1 numeric; t3 numeric; d1 numeric; d3 numeric; b record; r1 numeric; r3 numeric;
BEGIN
  IF NOT public.is_admin(_admin) THEN RAISE EXCEPTION 'Kun admin kan låse bonus'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _admin::text, true);
  IF m >= date_trunc('month', now())::date THEN RAISE EXCEPTION 'Kun afsluttede måneder kan låses'; END IF;
  IF EXISTS (SELECT 1 FROM bonus_laas WHERE user_id = _saelger AND maaned = m) THEN RETURN; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _bl_live (maaned date, ordning_id uuid, db_grundlag numeric, db_provision_pct numeric, db_bonus numeric,
    antal_wittenborg numeric, antal_animo numeric, antal_rex numeric, maskinbonus numeric, ny_kunde_db numeric, ny_kunde_rang integer,
    ny_kunde_bonus numeric, samlet_bonus numeric, l1561 numeric, l1563 numeric) ON COMMIT DROP;
  DELETE FROM _bl_live;
  INSERT INTO _bl_live
  SELECT bp.*, CASE WHEN o.flatrate IS NOT NULL THEN bp.samlet_bonus ELSE bp.db_bonus END,
              CASE WHEN o.flatrate IS NOT NULL THEN 0 ELSE bp.samlet_bonus - bp.db_bonus END
  FROM public.bonus_pr_maaned(_saelger, (m - interval '6 months')::date, m) bp
  LEFT JOIN bonus_ordning o ON o.id = bp.ordning_id;

  -- Efterregulering (seneste 6 låste måneder). DB: db_bonus efter minimum/fradrag; 1563: kun maskinbonus
  -- (ny kunde-bonus er endelig ved låsning). Fast provision: samlet bonus på 1561. Både + og − oprettes.
  FOR k IN SELECT l.maaned FROM bonus_laas l WHERE l.user_id = _saelger AND l.maaned < m AND l.maaned >= (m - interval '6 months')::date ORDER BY 1 LOOP
    SELECT x.* INTO lv FROM (SELECT 1) dd LEFT JOIN _bl_live x ON x.maaned = k;
    SELECT l.*, o.flatrate AS fast INTO lb FROM bonus_laas l LEFT JOIN bonus_ordning o ON o.id = l.ordning_id
      WHERE l.user_id = _saelger AND l.maaned = k;
    SELECT coalesce(sum(beloeb) FILTER (WHERE loenart = 1561), 0), coalesce(sum(beloeb) FILTER (WHERE loenart = 1563), 0)
      INTO t1, t3 FROM bonus_regulering WHERE user_id = _saelger AND kilde_maaned = k AND type = 'efterregulering';
    IF lb.fast IS NOT NULL THEN
      d1 := round(coalesce(lv.samlet_bonus, 0) - lb.samlet_bonus - t1, 2);
      d3 := 0;
    ELSE
      d1 := round(coalesce(lv.db_bonus, 0) - lb.db_bonus - t1, 2);
      d3 := round(coalesce(lv.maskinbonus, 0) - lb.maskinbonus - t3, 2);
    END IF;
    IF round(d1) <> 0 THEN
      INSERT INTO bonus_regulering (user_id, udbetalingsmaaned, kilde_maaned, type, loenart, beloeb, tekst, oprettet_af)
      VALUES (_saelger, m, k, 'efterregulering', 1561, d1, 'Efterregulering ' || to_char(k, 'TMmonth YYYY') || ': DB (sene fakturaer)', _admin);
    END IF;
    IF round(d3) <> 0 THEN
      INSERT INTO bonus_regulering (user_id, udbetalingsmaaned, kilde_maaned, type, loenart, beloeb, tekst, oprettet_af)
      VALUES (_saelger, m, k, 'efterregulering', 1563, d3, 'Efterregulering ' || to_char(k, 'TMmonth YYYY') || ': maskiner', _admin);
    END IF;
  END LOOP;

  SELECT * INTO b FROM _bl_live WHERE maaned = m;
  SELECT coalesce(sum(beloeb) FILTER (WHERE loenart = 1561), 0), coalesce(sum(beloeb) FILTER (WHERE loenart = 1563), 0)
    INTO r1, r3 FROM bonus_regulering WHERE user_id = _saelger AND udbetalingsmaaned = m;
  INSERT INTO bonus_laas (user_id, maaned, ordning_id, db_grundlag, db_provision_pct, db_bonus, antal_wittenborg, antal_animo, antal_rex,
    maskinbonus, samlet_bonus, ny_kunde_db, ny_kunde_rang, ny_kunde_bonus, regulering, loen_1561, loen_1563, maskiner, laast_note, laast_af, laast_at)
  VALUES (_saelger, m, b.ordning_id, coalesce(b.db_grundlag,0), coalesce(b.db_provision_pct,0), coalesce(b.db_bonus,0), coalesce(b.antal_wittenborg,0),
    coalesce(b.antal_animo,0), coalesce(b.antal_rex,0), coalesce(b.maskinbonus,0), coalesce(b.samlet_bonus,0), b.ny_kunde_db, b.ny_kunde_rang,
    coalesce(b.ny_kunde_bonus,0), r1 + r3, coalesce(b.l1561,0) + r1, coalesce(b.l1563,0) + r3,
    coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM public.bonus_maskin_detaljer(_saelger, m, m) d), '[]'::jsonb), _note, _admin, now());
END $$;
REVOKE ALL ON FUNCTION public._bonus_laas_saelger(uuid, uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._bonus_laas_saelger(uuid, uuid, date, text) TO service_role;