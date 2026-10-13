CREATE TABLE public.distrikt_scenarie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  navn text NOT NULL,
  beskrivelse text,
  oprettet_af uuid DEFAULT auth.uid(),
  oprettet_at timestamptz NOT NULL DEFAULT now(),
  opdateret_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'kladde' CHECK (status IN ('kladde','gjort_gaeldende','arkiveret'))
);
CREATE TABLE public.scenarie_saelger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenarie_id uuid NOT NULL REFERENCES public.distrikt_scenarie(id) ON DELETE CASCADE,
  navn text NOT NULL,
  farve text NOT NULL DEFAULT '#888888',
  profil_id uuid,
  oprettet_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.scenarie_distrikt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenarie_id uuid NOT NULL REFERENCES public.distrikt_scenarie(id) ON DELETE CASCADE,
  kilde_distrikt_id uuid,
  navn text NOT NULL,
  farve text NOT NULL DEFAULT '#888888',
  landsdel text CHECK (landsdel IN ('Øst','Vest')),
  sort int NOT NULL DEFAULT 0,
  saelger_user_id uuid,
  saelger_fiktiv_id uuid REFERENCES public.scenarie_saelger(id) ON DELETE SET NULL,
  daekkes_af_user_id uuid
);
CREATE TABLE public.scenarie_flade (
  scenarie_id uuid NOT NULL REFERENCES public.distrikt_scenarie(id) ON DELETE CASCADE,
  flade int NOT NULL REFERENCES public.postnummer_flader(flade),
  distrikt_id uuid NOT NULL REFERENCES public.scenarie_distrikt(id) ON DELETE CASCADE,
  PRIMARY KEY (scenarie_id, flade)
);
CREATE INDEX ON public.scenarie_distrikt(scenarie_id);
CREATE INDEX ON public.scenarie_saelger(scenarie_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distrikt_scenarie, public.scenarie_saelger, public.scenarie_distrikt, public.scenarie_flade TO authenticated;
GRANT ALL ON public.distrikt_scenarie, public.scenarie_saelger, public.scenarie_distrikt, public.scenarie_flade TO service_role;

ALTER TABLE public.distrikt_scenarie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarie_saelger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarie_distrikt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarie_flade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin alt" ON public.distrikt_scenarie FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin alt" ON public.scenarie_saelger FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin alt" ON public.scenarie_distrikt FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin alt" ON public.scenarie_flade FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Kopiér det gældende distriktskort ind i et nyt scenarie
CREATE OR REPLACE FUNCTION public.scenarie_opret(_navn text, _beskrivelse text DEFAULT NULL, _status text DEFAULT 'kladde')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sid uuid;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Kun admin'; END IF;
  INSERT INTO distrikt_scenarie(navn, beskrivelse, status, oprettet_af) VALUES (_navn, _beskrivelse, _status, auth.uid()) RETURNING id INTO sid;
  CREATE TEMP TABLE _m ON COMMIT DROP AS SELECT id AS gammel, gen_random_uuid() AS ny FROM distrikter;
  INSERT INTO scenarie_distrikt(id, scenarie_id, kilde_distrikt_id, navn, farve, landsdel, sort, saelger_user_id, daekkes_af_user_id)
    SELECT m.ny, sid, d.id, d.navn, d.farve, d.landsdel, d.sort, d.saelger_user_id, d.daekkes_af_user_id FROM distrikter d JOIN _m m ON m.gammel = d.id;
  INSERT INTO scenarie_flade(scenarie_id, flade, distrikt_id) SELECT sid, f.flade, m.ny FROM distrikt_flade f JOIN _m m ON m.gammel = f.distrikt_id;
  DROP TABLE _m;
  RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION public.scenarie_kopier(_id uuid, _navn text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  DROP TABLE _ms; DROP TABLE _md;
  RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION public.scenarie_gor_gaeldende(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE arkiv uuid; mangler text;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Kun admin'; END IF;
  IF NOT EXISTS (SELECT 1 FROM distrikt_scenarie WHERE id = _id) THEN RAISE EXCEPTION 'Scenarie findes ikke'; END IF;
  SELECT string_agg(DISTINCT s.navn, ', ') INTO mangler FROM scenarie_distrikt d JOIN scenarie_saelger s ON s.id = d.saelger_fiktiv_id
    WHERE d.scenarie_id = _id AND s.profil_id IS NULL;
  IF mangler IS NOT NULL THEN RAISE EXCEPTION 'Fiktive sælgere skal kobles til en rigtig profil først: %', mangler; END IF;

  arkiv := scenarie_opret('Gældende før ' || to_char(now() AT TIME ZONE 'Europe/Copenhagen', 'DD-MM-YYYY HH24:MI'), 'Automatisk gemt, da et scenarie blev gjort gældende', 'arkiveret');

  -- Opdatér/indsæt distrikter
  UPDATE scenarie_distrikt SET kilde_distrikt_id = gen_random_uuid()
    WHERE scenarie_id = _id AND (kilde_distrikt_id IS NULL OR NOT EXISTS (SELECT 1 FROM distrikter x WHERE x.id = kilde_distrikt_id))
      AND kilde_distrikt_id IS DISTINCT FROM NULL OR (scenarie_id = _id AND kilde_distrikt_id IS NULL);
  -- dubletter (to scenariedistrikter med samme kilde, fx efter kopi) får nyt id
  UPDATE scenarie_distrikt d SET kilde_distrikt_id = gen_random_uuid()
    WHERE d.scenarie_id = _id AND EXISTS (SELECT 1 FROM scenarie_distrikt e WHERE e.scenarie_id = _id AND e.kilde_distrikt_id = d.kilde_distrikt_id AND e.id < d.id);

  INSERT INTO distrikter(id, navn, farve, landsdel, sort, saelger_user_id, daekkes_af_user_id, aktiv)
    SELECT d.kilde_distrikt_id, d.navn, d.farve, d.landsdel, d.sort, COALESCE(d.saelger_user_id, s.profil_id),
      CASE WHEN COALESCE(d.saelger_user_id, s.profil_id) IS NULL THEN d.daekkes_af_user_id END, true
    FROM scenarie_distrikt d LEFT JOIN scenarie_saelger s ON s.id = d.saelger_fiktiv_id WHERE d.scenarie_id = _id
  ON CONFLICT (id) DO UPDATE SET navn = EXCLUDED.navn, farve = EXCLUDED.farve, landsdel = EXCLUDED.landsdel, sort = EXCLUDED.sort,
    saelger_user_id = EXCLUDED.saelger_user_id, daekkes_af_user_id = EXCLUDED.daekkes_af_user_id, aktiv = true;

  -- Flader
  DELETE FROM distrikt_flade f WHERE NOT EXISTS (SELECT 1 FROM scenarie_flade s WHERE s.scenarie_id = _id AND s.flade = f.flade);
  INSERT INTO distrikt_flade(flade, distrikt_id, opdateret_af, opdateret_at)
    SELECT s.flade, d.kilde_distrikt_id, auth.uid(), now() FROM scenarie_flade s JOIN scenarie_distrikt d ON d.id = s.distrikt_id WHERE s.scenarie_id = _id
  ON CONFLICT (flade) DO UPDATE SET distrikt_id = EXCLUDED.distrikt_id, opdateret_af = EXCLUDED.opdateret_af, opdateret_at = EXCLUDED.opdateret_at
    WHERE distrikt_flade.distrikt_id IS DISTINCT FROM EXCLUDED.distrikt_id;

  DELETE FROM distrikter x WHERE NOT EXISTS (SELECT 1 FROM scenarie_distrikt d WHERE d.scenarie_id = _id AND d.kilde_distrikt_id = x.id);

  UPDATE distrikt_scenarie SET status = 'gjort_gaeldende', opdateret_at = now() WHERE id = _id;
  RETURN arkiv;
END $$;

REVOKE ALL ON FUNCTION public.scenarie_opret(text,text,text), public.scenarie_kopier(uuid,text), public.scenarie_gor_gaeldende(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scenarie_opret(text,text,text), public.scenarie_kopier(uuid,text), public.scenarie_gor_gaeldende(uuid) TO authenticated;