ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS loennr text;

ALTER TABLE public.bonus_laas
  ADD COLUMN ny_kunde_db numeric,
  ADD COLUMN ny_kunde_rang integer,
  ADD COLUMN ny_kunde_bonus numeric NOT NULL DEFAULT 0,
  ADD COLUMN regulering numeric NOT NULL DEFAULT 0,
  ADD COLUMN loen_1561 numeric NOT NULL DEFAULT 0,
  ADD COLUMN loen_1563 numeric NOT NULL DEFAULT 0,
  ADD COLUMN maskiner jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN laast_note text;

CREATE TABLE public.bonus_laas_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maaned date NOT NULL,
  handling text NOT NULL CHECK (handling IN ('laas','laas_op')),
  begrundelse text,
  bruger uuid,
  tidspunkt timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bonus_laas_log TO authenticated;
GRANT ALL ON public.bonus_laas_log TO service_role;
ALTER TABLE public.bonus_laas_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin læser låselog" ON public.bonus_laas_log FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY tm_spaerret ON public.bonus_laas_log AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));

CREATE TABLE public.bonus_regulering (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  udbetalingsmaaned date NOT NULL,
  kilde_maaned date,
  type text NOT NULL CHECK (type IN ('efterregulering','manuel')),
  loenart integer NOT NULL CHECK (loenart IN (1561,1563)),
  beloeb numeric NOT NULL,
  tekst text NOT NULL DEFAULT '',
  oprettet_af uuid DEFAULT auth.uid(),
  oprettet_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bonus_regulering_udb_idx ON public.bonus_regulering (udbetalingsmaaned);
CREATE INDEX bonus_regulering_kilde_idx ON public.bonus_regulering (user_id, kilde_maaned);
GRANT SELECT, INSERT, DELETE ON public.bonus_regulering TO authenticated;
GRANT ALL ON public.bonus_regulering TO service_role;
ALTER TABLE public.bonus_regulering ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin og egen læser reguleringer" ON public.bonus_regulering FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Admin opretter manuel regulering" ON public.bonus_regulering FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) AND type = 'manuel');
CREATE POLICY "Admin sletter manuel regulering" ON public.bonus_regulering FOR DELETE TO authenticated USING (public.is_admin(auth.uid()) AND type = 'manuel');
CREATE POLICY tm_spaerret ON public.bonus_regulering AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));

CREATE OR REPLACE FUNCTION public._bonus_regulering_aaben()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.bonus_regulering;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF EXISTS (SELECT 1 FROM public.bonus_laas l WHERE l.maaned = r.udbetalingsmaaned) THEN
    RAISE EXCEPTION 'Måneden er låst – reguleringer kan ikke ændres';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.udbetalingsmaaned := date_trunc('month', NEW.udbetalingsmaaned)::date; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER bonus_regulering_aaben BEFORE INSERT OR UPDATE OR DELETE ON public.bonus_regulering
  FOR EACH ROW EXECUTE FUNCTION public._bonus_regulering_aaben();

-- Grundbeløb pr. lønart for en live-beregnet måned (før reguleringer)
CREATE OR REPLACE FUNCTION public._bonus_loenart_grundlag(_saelger uuid, _maaned date)
RETURNS TABLE(l1561 numeric, l1563 numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN o.flatrate IS NOT NULL THEN b.samlet_bonus ELSE b.db_bonus END,
         CASE WHEN o.flatrate IS NOT NULL THEN 0 ELSE b.samlet_bonus - b.db_bonus END
  FROM public.bonus_pr_maaned(_saelger, _maaned, _maaned) b
  LEFT JOIN public.bonus_ordning o ON o.id = b.ordning_id
$$;
REVOKE ALL ON FUNCTION public._bonus_loenart_grundlag(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bonus_laas_maaned(_maaned date, _note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m date := date_trunc('month', _maaned)::date;
  s uuid; k date; live record; laast record; tidl1561 numeric; tidl1563 numeric;
  d1561 numeric; d1563 numeric; antal integer := 0; b record; g record;
  reg1561 numeric; reg1563 numeric;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin kan låse bonus'; END IF;
  IF m >= date_trunc('month', now())::date THEN RAISE EXCEPTION 'Kun afsluttede måneder kan låses'; END IF;
  IF EXISTS (SELECT 1 FROM bonus_laas WHERE maaned = m) THEN RAISE EXCEPTION 'Måneden er allerede låst'; END IF;

  -- 1) Efterregulering af låste måneder de seneste 6 måneder
  FOR s, k IN SELECT l.user_id, l.maaned FROM bonus_laas l
              WHERE l.maaned < m AND l.maaned >= (m - interval '6 months')::date LOOP
    SELECT * INTO live FROM public._bonus_loenart_grundlag(s, k);
    SELECT l.loen_1561 - coalesce((SELECT sum(r.beloeb) FROM bonus_regulering r WHERE r.user_id = s AND r.udbetalingsmaaned = k AND r.loenart = 1561), 0) AS l1561,
           l.loen_1563 - coalesce((SELECT sum(r.beloeb) FROM bonus_regulering r WHERE r.user_id = s AND r.udbetalingsmaaned = k AND r.loenart = 1563), 0) AS l1563
      INTO laast FROM bonus_laas l WHERE l.user_id = s AND l.maaned = k;
    SELECT coalesce(sum(beloeb) FILTER (WHERE loenart = 1561), 0), coalesce(sum(beloeb) FILTER (WHERE loenart = 1563), 0)
      INTO tidl1561, tidl1563 FROM bonus_regulering
      WHERE user_id = s AND kilde_maaned = k AND type = 'efterregulering';
    d1561 := round(coalesce(live.l1561, 0) - laast.l1561 - tidl1561, 2);
    d1563 := round(coalesce(live.l1563, 0) - laast.l1563 - tidl1563, 2);
    IF round(d1561) <> 0 THEN
      INSERT INTO bonus_regulering (user_id, udbetalingsmaaned, kilde_maaned, type, loenart, beloeb, tekst, oprettet_af)
      VALUES (s, m, k, 'efterregulering', 1561, d1561, 'Efterregulering ' || to_char(k, 'TMmonth YYYY') || ': sene fakturaer', auth.uid());
    END IF;
    IF round(d1563) <> 0 THEN
      INSERT INTO bonus_regulering (user_id, udbetalingsmaaned, kilde_maaned, type, loenart, beloeb, tekst, oprettet_af)
      VALUES (s, m, k, 'efterregulering', 1563, d1563, 'Efterregulering ' || to_char(k, 'TMmonth YYYY') || ': sene fakturaer/maskiner', auth.uid());
    END IF;
  END LOOP;

  -- 2) Øjebliksbillede for alle sælgere med aktiv ordning eller reguleringer i måneden
  FOR s IN SELECT o.user_id FROM bonus_ordning o WHERE o.gyldig_fra <= m AND (o.gyldig_til IS NULL OR o.gyldig_til >= m)
           UNION SELECT r.user_id FROM bonus_regulering r WHERE r.udbetalingsmaaned = m LOOP
    SELECT * INTO b FROM public.bonus_pr_maaned(s, m, m);
    SELECT * INTO g FROM public._bonus_loenart_grundlag(s, m);
    SELECT coalesce(sum(beloeb) FILTER (WHERE loenart = 1561), 0), coalesce(sum(beloeb) FILTER (WHERE loenart = 1563), 0)
      INTO reg1561, reg1563 FROM bonus_regulering WHERE user_id = s AND udbetalingsmaaned = m;
    INSERT INTO bonus_laas (user_id, maaned, ordning_id, db_grundlag, db_provision_pct, db_bonus, antal_wittenborg, antal_animo, antal_rex,
      maskinbonus, samlet_bonus, ny_kunde_db, ny_kunde_rang, ny_kunde_bonus, regulering, loen_1561, loen_1563, maskiner, laast_note, laast_af, laast_at)
    VALUES (s, m, b.ordning_id, coalesce(b.db_grundlag,0), coalesce(b.db_provision_pct,0), coalesce(b.db_bonus,0), coalesce(b.antal_wittenborg,0),
      coalesce(b.antal_animo,0), coalesce(b.antal_rex,0), coalesce(b.maskinbonus,0), coalesce(b.samlet_bonus,0), b.ny_kunde_db, b.ny_kunde_rang,
      coalesce(b.ny_kunde_bonus,0), reg1561 + reg1563, coalesce(g.l1561,0) + reg1561, coalesce(g.l1563,0) + reg1563,
      coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM public.bonus_maskin_detaljer(s, m, m) d), '[]'::jsonb), _note, auth.uid(), now());
    antal := antal + 1;
  END LOOP;

  INSERT INTO bonus_laas_log (maaned, handling, begrundelse, bruger) VALUES (m, 'laas', _note, auth.uid());
  RETURN antal;
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

-- Afregningsoversigt: låste tal hvis låst, ellers live + åbne reguleringer
CREATE OR REPLACE FUNCTION public.bonus_afregning(_maaned date)
RETURNS TABLE(user_id uuid, navn text, loennr text, laast boolean, laast_at timestamptz, flatrate numeric,
  db_grundlag numeric, db_provision_pct numeric, db_bonus numeric, antal_wittenborg numeric, antal_animo numeric, antal_rex numeric,
  maskinbonus numeric, ny_kunde_bonus numeric, samlet_bonus numeric, regulering numeric, loen_1561 numeric, loen_1563 numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m date := date_trunc('month', _maaned)::date; s uuid; b record; g record; r1 numeric; r3 numeric;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin'; END IF;
  IF EXISTS (SELECT 1 FROM bonus_laas l WHERE l.maaned = m) THEN
    RETURN QUERY SELECT l.user_id, p.full_name, p.loennr, true, l.laast_at, o.flatrate, l.db_grundlag, l.db_provision_pct, l.db_bonus,
      l.antal_wittenborg, l.antal_animo, l.antal_rex, l.maskinbonus, l.ny_kunde_bonus, l.samlet_bonus, l.regulering, l.loen_1561, l.loen_1563
      FROM bonus_laas l LEFT JOIN profiles p ON p.id = l.user_id LEFT JOIN bonus_ordning o ON o.id = l.ordning_id
      WHERE l.maaned = m ORDER BY p.full_name;
    RETURN;
  END IF;
  FOR s IN SELECT x.uid FROM (SELECT o.user_id uid FROM bonus_ordning o WHERE o.gyldig_fra <= m AND (o.gyldig_til IS NULL OR o.gyldig_til >= m)
           UNION SELECT r.user_id FROM bonus_regulering r WHERE r.udbetalingsmaaned = m) x
           LEFT JOIN profiles p ON p.id = x.uid ORDER BY p.full_name LOOP
    SELECT * INTO b FROM public.bonus_pr_maaned(s, m, m);
    SELECT * INTO g FROM public._bonus_loenart_grundlag(s, m);
    SELECT coalesce(sum(beloeb) FILTER (WHERE loenart = 1561), 0), coalesce(sum(beloeb) FILTER (WHERE loenart = 1563), 0)
      INTO r1, r3 FROM bonus_regulering WHERE bonus_regulering.user_id = s AND udbetalingsmaaned = m;
    user_id := s;
    SELECT p.full_name, p.loennr INTO navn, loennr FROM profiles p WHERE p.id = s;
    laast := false; laast_at := NULL;
    SELECT o.flatrate INTO flatrate FROM bonus_ordning o WHERE o.id = b.ordning_id;
    db_grundlag := coalesce(b.db_grundlag,0); db_provision_pct := coalesce(b.db_provision_pct,0); db_bonus := coalesce(b.db_bonus,0);
    antal_wittenborg := coalesce(b.antal_wittenborg,0); antal_animo := coalesce(b.antal_animo,0); antal_rex := coalesce(b.antal_rex,0);
    maskinbonus := coalesce(b.maskinbonus,0); ny_kunde_bonus := coalesce(b.ny_kunde_bonus,0); samlet_bonus := coalesce(b.samlet_bonus,0);
    regulering := r1 + r3; loen_1561 := coalesce(g.l1561,0) + r1; loen_1563 := coalesce(g.l1563,0) + r3;
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.bonus_laas_maaned(date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bonus_laas_op(date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bonus_afregning(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonus_laas_maaned(date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bonus_laas_op(date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bonus_afregning(date) TO authenticated, service_role;