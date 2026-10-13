CREATE TABLE public.kam_aftale (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  navn text NOT NULL,
  kodetype text NOT NULL DEFAULT 'kpg1' CHECK (kodetype IN ('kpg1','kpg2','kpg3')),
  koder text[] NOT NULL DEFAULT '{}',
  kam_ansvarlige uuid[] NOT NULL DEFAULT '{}',
  aktiv boolean NOT NULL DEFAULT true,
  oprettet_at timestamptz NOT NULL DEFAULT now(),
  opdateret_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kam_aftale TO authenticated;
GRANT ALL ON public.kam_aftale TO service_role;
ALTER TABLE public.kam_aftale ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin kam_aftale" ON public.kam_aftale FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.scenarie_kam (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenarie_id uuid NOT NULL REFERENCES public.distrikt_scenarie(id) ON DELETE CASCADE,
  kilde_kam_id uuid,
  navn text NOT NULL,
  kodetype text NOT NULL CHECK (kodetype IN ('kpg1','kpg2','kpg3')),
  koder text[] NOT NULL DEFAULT '{}',
  kam_ansvarlige uuid[] NOT NULL DEFAULT '{}',
  kam_fiktive uuid[] NOT NULL DEFAULT '{}',
  aktiv boolean NOT NULL DEFAULT true
);
CREATE INDEX scenarie_kam_scenarie_idx ON public.scenarie_kam(scenarie_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenarie_kam TO authenticated;
GRANT ALL ON public.scenarie_kam TO service_role;
ALTER TABLE public.scenarie_kam ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin scenarie_kam" ON public.scenarie_kam FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Migrér gamle KAM-koder (KPG3) til én aftale
INSERT INTO public.kam_aftale (navn, kodetype, koder)
SELECT 'KAM (importeret)', 'kpg3', coalesce(array_agg(DISTINCT c.customer_segment_3) FILTER (WHERE c.customer_segment_3 IS NOT NULL), '{}')
FROM public.companies c
WHERE substring(c.customer_segment_3 from '^\s*(\d+)') = ANY ((SELECT kam_kpg3 FROM public.salgskort_indstilling WHERE id = 1)::text[]);
COMMENT ON COLUMN public.salgskort_indstilling.kam_kpg3 IS 'DEPRECATED: replaced by kam_aftale';

-- Eksisterende scenarier får en kopi af KAM-aftalerne
INSERT INTO public.scenarie_kam (scenarie_id, kilde_kam_id, navn, kodetype, koder, kam_ansvarlige, aktiv)
SELECT s.id, k.id, k.navn, k.kodetype, k.koder, k.kam_ansvarlige, k.aktiv FROM public.distrikt_scenarie s CROSS JOIN public.kam_aftale k;

CREATE OR REPLACE FUNCTION public.scenarie_opret(_navn text, _beskrivelse text DEFAULT NULL::text, _status text DEFAULT 'kladde'::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sid uuid;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Kun admin'; END IF;
  INSERT INTO distrikt_scenarie(navn, beskrivelse, status, oprettet_af) VALUES (_navn, _beskrivelse, _status, auth.uid()) RETURNING id INTO sid;
  CREATE TEMP TABLE _m ON COMMIT DROP AS SELECT id AS gammel, gen_random_uuid() AS ny FROM distrikter;
  INSERT INTO scenarie_distrikt(id, scenarie_id, kilde_distrikt_id, navn, farve, landsdel, sort, saelger_user_id, daekkes_af_user_id)
    SELECT m.ny, sid, d.id, d.navn, d.farve, d.landsdel, d.sort, d.saelger_user_id, d.daekkes_af_user_id FROM distrikter d JOIN _m m ON m.gammel = d.id;
  INSERT INTO scenarie_flade(scenarie_id, flade, distrikt_id) SELECT sid, f.flade, m.ny FROM distrikt_flade f JOIN _m m ON m.gammel = f.distrikt_id;
  INSERT INTO scenarie_kam(scenarie_id, kilde_kam_id, navn, kodetype, koder, kam_ansvarlige, aktiv)
    SELECT sid, k.id, k.navn, k.kodetype, k.koder, k.kam_ansvarlige, k.aktiv FROM kam_aftale k;
  DROP TABLE _m;
  RETURN sid;
END $function$;

CREATE OR REPLACE FUNCTION public.scenarie_kopier(_id uuid, _navn text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sid uuid;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Kun admin'; END IF;
  INSERT INTO distrikt_scenarie(navn, beskrivelse, oprettet_af) SELECT _navn, beskrivelse, auth.uid() FROM distrikt_scenarie WHERE id = _id RETURNING id INTO sid;
  IF sid IS NULL THEN RAISE EXCEPTION 'Scenarie findes ikke'; END IF;
  CREATE TEMP TABLE _ms ON COMMIT DROP AS SELECT id AS gammel, gen_random_uuid() AS ny FROM scenarie_saelger WHERE scenarie_id = _id;
  CREATE TEMP TABLE _md ON COMMIT DROP AS SELECT id AS gammel, gen_random_uuid() AS ny FROM scenarie_distrikt WHERE scenarie_id = _id;
  INSERT INTO scenarie_saelger(id, scenarie_id, navn, farve, profil_id) SELECT m.ny, sid, s.navn, s.farve, s.profil_id FROM scenarie_saelger s JOIN _ms m ON m.gammel = s.id;
  INSERT INTO scenarie_distrikt(id, scenarie_id, kilde_distrikt_id, navn, farve, landsdel, sort, saelger_user_id, saelger_fiktiv_id, daekkes_af_user_id)
    SELECT m.ny, sid, d.kilde_distrikt_id, d.navn, d.farve, d.landsdel, d.sort, d.saelger_user_id, ms.ny, d.daekkes_af_user_id
    FROM scenarie_distrikt d JOIN _md m ON m.gammel = d.id LEFT JOIN _ms ms ON ms.gammel = d.saelger_fiktiv_id;
  INSERT INTO scenarie_flade(scenarie_id, flade, distrikt_id) SELECT sid, f.flade, m.ny FROM scenarie_flade f JOIN _md m ON m.gammel = f.distrikt_id WHERE f.scenarie_id = _id;
  INSERT INTO scenarie_regel(scenarie_id, sortering, type, saelger_user_id, saelger_fiktiv_id, betingelse, aktiv)
    SELECT sid, r.sortering, r.type, r.saelger_user_id, ms.ny, r.betingelse, r.aktiv
    FROM scenarie_regel r LEFT JOIN _ms ms ON ms.gammel = r.saelger_fiktiv_id WHERE r.scenarie_id = _id;
  INSERT INTO scenarie_kam(scenarie_id, kilde_kam_id, navn, kodetype, koder, kam_ansvarlige, kam_fiktive, aktiv)
    SELECT sid, k.kilde_kam_id, k.navn, k.kodetype, k.koder, k.kam_ansvarlige,
      coalesce((SELECT array_agg(ms.ny) FROM unnest(k.kam_fiktive) f JOIN _ms ms ON ms.gammel = f), '{}'), k.aktiv
    FROM scenarie_kam k WHERE k.scenarie_id = _id;
  DROP TABLE _ms; DROP TABLE _md;
  RETURN sid;
END $function$;

CREATE OR REPLACE FUNCTION public.scenarie_gor_gaeldende(_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE arkiv uuid; mangler text;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Kun admin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM distrikt_scenarie WHERE id = _id) THEN RAISE EXCEPTION 'Scenarie findes ikke'; END IF;
  SELECT string_agg(DISTINCT s.navn, ', ') INTO mangler FROM scenarie_saelger s
    WHERE s.scenarie_id = _id AND s.profil_id IS NULL
      AND (EXISTS (SELECT 1 FROM scenarie_distrikt d WHERE d.scenarie_id = _id AND d.saelger_fiktiv_id = s.id)
        OR EXISTS (SELECT 1 FROM scenarie_kam k WHERE k.scenarie_id = _id AND s.id = ANY(k.kam_fiktive)));
  IF mangler IS NOT NULL THEN RAISE EXCEPTION 'Fiktive sælgere skal kobles til en rigtig profil først: %', mangler; END IF;

  arkiv := scenarie_opret('Gældende før ' || to_char(now() AT TIME ZONE 'Europe/Copenhagen', 'DD-MM-YYYY HH24:MI'), 'Automatisk gemt, da et scenarie blev gjort gældende', 'arkiveret');

  UPDATE scenarie_distrikt SET kilde_distrikt_id = gen_random_uuid()
    WHERE scenarie_id = _id AND (kilde_distrikt_id IS NULL OR NOT EXISTS (SELECT 1 FROM distrikter x WHERE x.id = kilde_distrikt_id))
      AND kilde_distrikt_id IS DISTINCT FROM NULL OR (scenarie_id = _id AND kilde_distrikt_id IS NULL);
  UPDATE scenarie_distrikt d SET kilde_distrikt_id = gen_random_uuid()
    WHERE d.scenarie_id = _id AND EXISTS (SELECT 1 FROM scenarie_distrikt e WHERE e.scenarie_id = _id AND e.kilde_distrikt_id = d.kilde_distrikt_id AND e.id < d.id);

  INSERT INTO distrikter(id, navn, farve, landsdel, sort, saelger_user_id, daekkes_af_user_id, aktiv)
    SELECT d.kilde_distrikt_id, d.navn, d.farve, d.landsdel, d.sort, COALESCE(d.saelger_user_id, s.profil_id),
      CASE WHEN COALESCE(d.saelger_user_id, s.profil_id) IS NULL THEN d.daekkes_af_user_id END, true
    FROM scenarie_distrikt d LEFT JOIN scenarie_saelger s ON s.id = d.saelger_fiktiv_id WHERE d.scenarie_id = _id
  ON CONFLICT (id) DO UPDATE SET navn = EXCLUDED.navn, farve = EXCLUDED.farve, landsdel = EXCLUDED.landsdel, sort = EXCLUDED.sort,
    saelger_user_id = EXCLUDED.saelger_user_id, daekkes_af_user_id = EXCLUDED.daekkes_af_user_id, aktiv = true;

  DELETE FROM distrikt_flade f WHERE NOT EXISTS (SELECT 1 FROM scenarie_flade s WHERE s.scenarie_id = _id AND s.flade = f.flade);
  INSERT INTO distrikt_flade(flade, distrikt_id, opdateret_af, opdateret_at)
    SELECT s.flade, d.kilde_distrikt_id, auth.uid(), now() FROM scenarie_flade s JOIN scenarie_distrikt d ON d.id = s.distrikt_id WHERE s.scenarie_id = _id
  ON CONFLICT (flade) DO UPDATE SET distrikt_id = EXCLUDED.distrikt_id, opdateret_af = EXCLUDED.opdateret_af, opdateret_at = EXCLUDED.opdateret_at
    WHERE distrikt_flade.distrikt_id IS DISTINCT FROM EXCLUDED.distrikt_id;

  DELETE FROM distrikter x WHERE NOT EXISTS (SELECT 1 FROM scenarie_distrikt d WHERE d.scenarie_id = _id AND d.kilde_distrikt_id = x.id);

  -- KAM-ansvarlige overføres (fiktive via deres koblede profil)
  UPDATE kam_aftale a SET kam_ansvarlige = (
      SELECT coalesce(array_agg(DISTINCT u), '{}') FROM (
        SELECT unnest(k.kam_ansvarlige) u
        UNION SELECT s.profil_id FROM scenarie_saelger s WHERE s.id = ANY(k.kam_fiktive) AND s.profil_id IS NOT NULL) z),
    opdateret_at = now()
  FROM scenarie_kam k WHERE k.scenarie_id = _id AND k.kilde_kam_id = a.id;

  UPDATE distrikt_scenarie SET status = 'gjort_gaeldende', opdateret_at = now() WHERE id = _id;
  RETURN arkiv;
END $function$;