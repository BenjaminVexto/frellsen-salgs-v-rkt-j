ALTER TABLE public.bonus_laas ADD COLUMN IF NOT EXISTS kilde text NOT NULL DEFAULT 'beregnet';
ALTER TABLE public.bonus_laas ADD CONSTRAINT bonus_laas_kilde_chk CHECK (kilde IN ('beregnet','loenseddel'));

CREATE TABLE public.bonus_historik_loenseddel (
  user_id uuid NOT NULL,
  maaned date NOT NULL,
  loenseddel_maaned date NOT NULL,
  loen_1561 numeric NOT NULL DEFAULT 0,
  loen_1563 numeric NOT NULL DEFAULT 0,
  importeret_at timestamptz NOT NULL DEFAULT now(),
  importeret_af uuid,
  PRIMARY KEY (user_id, maaned)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonus_historik_loenseddel TO authenticated;
GRANT ALL ON public.bonus_historik_loenseddel TO service_role;
ALTER TABLE public.bonus_historik_loenseddel ENABLE ROW LEVEL SECURITY;
CREATE POLICY bonus_historik_admin ON public.bonus_historik_loenseddel FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY tm_spaerret ON public.bonus_historik_loenseddel AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));

-- Sælgere ser aldrig låste måneder før september 2025
DROP POLICY "Admin og egen sælger læser bonuslåse" ON public.bonus_laas;
CREATE POLICY "Admin og egen sælger læser bonuslåse" ON public.bonus_laas FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR (user_id = auth.uid() AND maaned >= DATE '2025-09-01'));

-- Genetabler en historisk måned fra lønsedlen
CREATE OR REPLACE FUNCTION public.bonus_historik_genetabler(_user_id uuid, _maaned date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h public.bonus_historik_loenseddel;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin'; END IF;
  SELECT * INTO h FROM bonus_historik_loenseddel WHERE user_id = _user_id AND maaned = date_trunc('month', _maaned)::date;
  IF h.user_id IS NULL THEN RAISE EXCEPTION 'Ingen lønseddeldata for måneden'; END IF;
  INSERT INTO bonus_laas (user_id, maaned, kilde, db_grundlag, db_bonus, maskinbonus, samlet_bonus, ny_kunde_bonus, regulering,
    loen_1561, loen_1563, maskiner, laast_note, laast_af, laast_at)
  VALUES (h.user_id, h.maaned, 'loenseddel', 0, 0, 0, h.loen_1561 + h.loen_1563, 0, 0, h.loen_1561, h.loen_1563, '[]'::jsonb,
    'Historisk jf. lønseddel', auth.uid(), now())
  ON CONFLICT DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public.bonus_historik_genetabler(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonus_historik_genetabler(uuid, date) TO authenticated;

-- Efterregulering springer lønseddelrækker over; sælger-afskæring i læsefunktionerne
DO $do$
DECLARE d text; f text;
BEGIN
  d := pg_get_functiondef('public._bonus_laas_saelger'::regproc);
  IF position('l.maaned < m AND l.maaned >=' IN d) = 0 THEN RAISE EXCEPTION 'Mønster ikke fundet i _bonus_laas_saelger'; END IF;
  EXECUTE replace(d, 'l.maaned < m AND l.maaned >=', 'l.kilde = ''beregnet'' AND l.maaned < m AND l.maaned >=');
  FOREACH f IN ARRAY ARRAY['bonus_pr_maaned','bonus_db_detaljer','bonus_maskin_detaljer'] LOOP
    d := pg_get_functiondef(('public.' || f)::regproc);
    IF position('IF NOT public.maalepunkt_adgang(_saelger) THEN' IN d) = 0 THEN RAISE EXCEPTION 'Mønster ikke fundet i %', f; END IF;
    EXECUTE replace(d, 'IF NOT public.maalepunkt_adgang(_saelger) THEN',
      'IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) AND _fra < DATE ''2025-09-01'' THEN _fra := DATE ''2025-09-01''; END IF;
  IF NOT public.maalepunkt_adgang(_saelger) THEN');
  END LOOP;
END $do$;