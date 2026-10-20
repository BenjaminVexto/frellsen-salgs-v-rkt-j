DROP FUNCTION IF EXISTS public.bonus_laas_maaned(date, text);
DROP FUNCTION IF EXISTS public.bonus_afregning(date);
DROP FUNCTION IF EXISTS public._bonus_loenart_grundlag(uuid, date);

-- Sælgere der indgår i afregningen for en måned
CREATE OR REPLACE FUNCTION public.bonus_afregning_saelgere(_maaned date)
RETURNS TABLE(user_id uuid, navn text, loennr text, flatrate numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH m AS (SELECT date_trunc('month', _maaned)::date AS m),
  ids AS (
    SELECT o.user_id FROM bonus_ordning o, m WHERE o.gyldig_fra <= m.m AND (o.gyldig_til IS NULL OR o.gyldig_til >= m.m)
    UNION SELECT r.user_id FROM bonus_regulering r, m WHERE r.udbetalingsmaaned = m.m
    UNION SELECT l.user_id FROM bonus_laas l, m WHERE l.maaned >= (m.m - interval '6 months')::date AND l.maaned <= m.m
  )
  SELECT i.user_id, p.full_name, p.loennr,
    (SELECT o.flatrate FROM bonus_ordning o, m WHERE o.user_id = i.user_id AND o.gyldig_fra <= m.m AND (o.gyldig_til IS NULL OR o.gyldig_til >= m.m) ORDER BY o.gyldig_fra DESC LIMIT 1)
  FROM ids i LEFT JOIN profiles p ON p.id = i.user_id
  WHERE public.is_admin(auth.uid())
  ORDER BY p.full_name
$$;

CREATE OR REPLACE FUNCTION public.bonus_laas_start(_maaned date)
RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m date := date_trunc('month', _maaned)::date;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin kan låse bonus'; END IF;
  IF m >= date_trunc('month', now())::date THEN RAISE EXCEPTION 'Kun afsluttede måneder kan låses'; END IF;
  IF EXISTS (SELECT 1 FROM bonus_laas WHERE maaned > m) THEN RAISE EXCEPTION 'En senere måned er allerede låst'; END IF;
  RETURN QUERY SELECT s.user_id FROM public.bonus_afregning_saelgere(m) s;
END $$;

-- Låser én sælger. Kaldes kun af serveren (service role) efter admin-tjek; _admin bliver auth.uid() i transaktionen.
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
  SELECT b.*, CASE WHEN o.flatrate IS NOT NULL THEN b.samlet_bonus ELSE b.db_bonus END,
              CASE WHEN o.flatrate IS NOT NULL THEN 0 ELSE b.samlet_bonus - b.db_bonus END
  FROM public.bonus_pr_maaned(_saelger, (m - interval '6 months')::date, m) b
  LEFT JOIN bonus_ordning o ON o.id = b.ordning_id;

  -- Efterregulering af tidligere låste måneder (seneste 6)
  FOR k IN SELECT l.maaned FROM bonus_laas l WHERE l.user_id = _saelger AND l.maaned < m AND l.maaned >= (m - interval '6 months')::date ORDER BY 1 LOOP
    SELECT coalesce(x.l1561, 0) l1561, coalesce(x.l1563, 0) l1563 INTO lv FROM (SELECT 1) d LEFT JOIN _bl_live x ON x.maaned = k;
    SELECT l.loen_1561 - coalesce((SELECT sum(r.beloeb) FROM bonus_regulering r WHERE r.user_id = _saelger AND r.udbetalingsmaaned = k AND r.loenart = 1561), 0) l1561,
           l.loen_1563 - coalesce((SELECT sum(r.beloeb) FROM bonus_regulering r WHERE r.user_id = _saelger AND r.udbetalingsmaaned = k AND r.loenart = 1563), 0) l1563
      INTO lb FROM bonus_laas l WHERE l.user_id = _saelger AND l.maaned = k;
    SELECT coalesce(sum(beloeb) FILTER (WHERE loenart = 1561), 0), coalesce(sum(beloeb) FILTER (WHERE loenart = 1563), 0)
      INTO t1, t3 FROM bonus_regulering WHERE user_id = _saelger AND kilde_maaned = k AND type = 'efterregulering';
    d1 := round(lv.l1561 - lb.l1561 - t1, 2);
    d3 := round(lv.l1563 - lb.l1563 - t3, 2);
    IF round(d1) <> 0 THEN
      INSERT INTO bonus_regulering (user_id, udbetalingsmaaned, kilde_maaned, type, loenart, beloeb, tekst, oprettet_af)
      VALUES (_saelger, m, k, 'efterregulering', 1561, d1, 'Efterregulering ' || to_char(k, 'TMmonth YYYY') || ': sene fakturaer', _admin);
    END IF;
    IF round(d3) <> 0 THEN
      INSERT INTO bonus_regulering (user_id, udbetalingsmaaned, kilde_maaned, type, loenart, beloeb, tekst, oprettet_af)
      VALUES (_saelger, m, k, 'efterregulering', 1563, d3, 'Efterregulering ' || to_char(k, 'TMmonth YYYY') || ': sene fakturaer/maskiner', _admin);
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

CREATE OR REPLACE FUNCTION public.bonus_laas_afslut(_maaned date, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m date := date_trunc('month', _maaned)::date;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin kan låse bonus'; END IF;
  IF EXISTS (SELECT 1 FROM public.bonus_afregning_saelgere(m) s WHERE NOT EXISTS (SELECT 1 FROM bonus_laas l WHERE l.user_id = s.user_id AND l.maaned = m)) THEN
    RAISE EXCEPTION 'Ikke alle sælgere er låst endnu';
  END IF;
  INSERT INTO bonus_laas_log (maaned, handling, begrundelse, bruger) VALUES (m, 'laas', _note, auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.bonus_laas_op(_maaned date, _begrundelse text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m date := date_trunc('month', _maaned)::date;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin kan låse op'; END IF;
  IF coalesce(btrim(_begrundelse), '') = '' THEN RAISE EXCEPTION 'Angiv en begrundelse'; END IF;
  IF NOT EXISTS (SELECT 1 FROM bonus_laas WHERE maaned = m) THEN RAISE EXCEPTION 'Måneden er ikke låst'; END IF;
  IF EXISTS (SELECT 1 FROM bonus_laas WHERE maaned > m) THEN RAISE EXCEPTION 'Lås først senere måneder op'; END IF;
  DELETE FROM bonus_laas WHERE maaned = m;
  DELETE FROM bonus_regulering WHERE udbetalingsmaaned = m AND type = 'efterregulering';
  INSERT INTO bonus_laas_log (maaned, handling, begrundelse, bruger) VALUES (m, 'laas_op', _begrundelse, auth.uid());
END $$;

REVOKE ALL ON FUNCTION public.bonus_afregning_saelgere(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bonus_laas_start(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bonus_laas_afslut(date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._bonus_laas_saelger(uuid, uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bonus_afregning_saelgere(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bonus_laas_start(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bonus_laas_afslut(date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._bonus_laas_saelger(uuid, uuid, date, text) TO service_role;