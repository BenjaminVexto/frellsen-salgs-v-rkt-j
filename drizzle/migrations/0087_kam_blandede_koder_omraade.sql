ALTER TABLE public.kam_aftale ADD COLUMN kpg1 text[] NOT NULL DEFAULT '{}', ADD COLUMN kpg2 text[] NOT NULL DEFAULT '{}', ADD COLUMN kpg3 text[] NOT NULL DEFAULT '{}', ADD COLUMN omraade jsonb;
ALTER TABLE public.scenarie_kam ADD COLUMN kpg1 text[] NOT NULL DEFAULT '{}', ADD COLUMN kpg2 text[] NOT NULL DEFAULT '{}', ADD COLUMN kpg3 text[] NOT NULL DEFAULT '{}', ADD COLUMN omraade jsonb, ADD COLUMN ny_i_scenarie boolean NOT NULL DEFAULT false;
ALTER TABLE public.scenarie_kam ALTER COLUMN kodetype SET DEFAULT 'kpg1';
UPDATE public.kam_aftale SET kpg1 = CASE WHEN kodetype='kpg1' THEN koder ELSE '{}' END, kpg2 = CASE WHEN kodetype='kpg2' THEN koder ELSE '{}' END, kpg3 = CASE WHEN kodetype='kpg3' THEN koder ELSE '{}' END;
UPDATE public.scenarie_kam SET kpg1 = CASE WHEN kodetype='kpg1' THEN koder ELSE '{}' END, kpg2 = CASE WHEN kodetype='kpg2' THEN koder ELSE '{}' END, kpg3 = CASE WHEN kodetype='kpg3' THEN koder ELSE '{}' END;
COMMENT ON COLUMN public.kam_aftale.kodetype IS 'DEPRECATED: replaced by kpg1/kpg2/kpg3';
COMMENT ON COLUMN public.kam_aftale.koder IS 'DEPRECATED: replaced by kpg1/kpg2/kpg3';
COMMENT ON COLUMN public.scenarie_kam.kodetype IS 'DEPRECATED: replaced by kpg1/kpg2/kpg3';
COMMENT ON COLUMN public.scenarie_kam.koder IS 'DEPRECATED: replaced by kpg1/kpg2/kpg3';

CREATE OR REPLACE FUNCTION public._remap_omraade(o jsonb, m jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN o IS NULL OR o->>'type' IS DISTINCT FROM 'distrikt' THEN o
    ELSE jsonb_set(o, '{vaerdier}', coalesce((SELECT jsonb_agg(m->>v) FROM jsonb_array_elements_text(o->'vaerdier') v WHERE m ? v), '[]'::jsonb)) END
$$;

CREATE OR REPLACE FUNCTION public.scenarie_opret(_navn text, _beskrivelse text DEFAULT NULL::text, _status text DEFAULT 'kladde'::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sid uuid; mp jsonb;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Kun admin'; END IF;
  INSERT INTO distrikt_scenarie(navn, beskrivelse, status, oprettet_af) VALUES (_navn, _beskrivelse, _status, auth.uid()) RETURNING id INTO sid;
  CREATE TEMP TABLE _m ON COMMIT DROP AS SELECT id AS gammel, gen_random_uuid() AS ny FROM distrikter;
  INSERT INTO scenarie_distrikt(id, scenarie_id, kilde_distrikt_id, navn, farve, landsdel, sort, saelger_user_id, daekkes_af_user_id)
    SELECT m.ny, sid, d.id, d.navn, d.farve, d.landsdel, d.sort, d.saelger_user_id, d.daekkes_af_user_id FROM distrikter d JOIN _m m ON m.gammel = d.id;
  INSERT INTO scenarie_flade(scenarie_id, flade, distrikt_id) SELECT sid, f.flade, m.ny FROM distrikt_flade f JOIN _m m ON m.gammel = f.distrikt_id;
  SELECT coalesce(jsonb_object_agg(gammel::text, ny::text), '{}') INTO mp FROM _m;
  INSERT INTO scenarie_kam(scenarie_id, kilde_kam_id, navn, kodetype, koder, kpg1, kpg2, kpg3, omraade, kam_ansvarlige, aktiv)
    SELECT sid, k.id, k.navn, k.kodetype, k.koder, k.kpg1, k.kpg2, k.kpg3, _remap_omraade(k.omraade, mp), k.kam_ansvarlige, k.aktiv FROM kam_aftale k;
  DROP TABLE _m;
  RETURN sid;
END $function$;

CREATE OR REPLACE FUNCTION public.scenarie_kopier(_id uuid, _navn text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE sid uuid; mp jsonb;
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
  SELECT coalesce(jsonb_object_agg(gammel::text, ny::text), '{}') INTO mp FROM _md;
  INSERT INTO scenarie_regel(scenarie_id, sortering, type, saelger_user_id, saelger_fiktiv_id, betingelse, aktiv)
    SELECT sid, r.sortering, r.type, r.saelger_user_id, ms.ny, r.betingelse, r.aktiv
    FROM scenarie_regel r LEFT JOIN _ms ms ON ms.gammel = r.saelger_fiktiv_id WHERE r.scenarie_id = _id;
  INSERT INTO scenarie_kam(scenarie_id, kilde_kam_id, navn, kodetype, koder, kpg1, kpg2, kpg3, omraade, ny_i_scenarie, kam_ansvarlige, kam_fiktive, aktiv)
    SELECT sid, k.kilde_kam_id, k.navn, k.kodetype, k.koder, k.kpg1, k.kpg2, k.kpg3, _remap_omraade(k.omraade, mp), k.ny_i_scenarie, k.kam_ansvarlige,
      coalesce((SELECT array_agg(ms.ny) FROM unnest(k.kam_fiktive) f JOIN _ms ms ON ms.gammel = f), '{}'), k.aktiv
    FROM scenarie_kam k WHERE k.scenarie_id = _id;
  DROP TABLE _ms; DROP TABLE _md;
  RETURN sid;
END $function$;

CREATE OR REPLACE FUNCTION public.scenarie_gor_gaeldende(_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE arkiv uuid; mangler text; mp jsonb;
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

  -- KAM-aftaler: opret, ændr og slet ud fra scenariet (fiktive ansvarlige via deres koblede profil)
  SELECT coalesce(jsonb_object_agg(id::text, kilde_distrikt_id::text), '{}') INTO mp FROM scenarie_distrikt WHERE scenarie_id = _id;
  UPDATE scenarie_kam k SET kilde_kam_id = gen_random_uuid()
    WHERE k.scenarie_id = _id AND (k.kilde_kam_id IS NULL OR NOT EXISTS (SELECT 1 FROM kam_aftale a WHERE a.id = k.kilde_kam_id)
      OR EXISTS (SELECT 1 FROM scenarie_kam e WHERE e.scenarie_id = _id AND e.kilde_kam_id = k.kilde_kam_id AND e.id < k.id));
  INSERT INTO kam_aftale(id, navn, kpg1, kpg2, kpg3, omraade, kam_ansvarlige, aktiv, opdateret_at)
    SELECT k.kilde_kam_id, k.navn, k.kpg1, k.kpg2, k.kpg3, _remap_omraade(k.omraade, mp),
      (SELECT coalesce(array_agg(DISTINCT u), '{}') FROM (SELECT unnest(k.kam_ansvarlige) u
        UNION SELECT s.profil_id FROM scenarie_saelger s WHERE s.id = ANY(k.kam_fiktive) AND s.profil_id IS NOT NULL) z),
      k.aktiv, now()
    FROM scenarie_kam k WHERE k.scenarie_id = _id
  ON CONFLICT (id) DO UPDATE SET navn = EXCLUDED.navn, kpg1 = EXCLUDED.kpg1, kpg2 = EXCLUDED.kpg2, kpg3 = EXCLUDED.kpg3,
    omraade = EXCLUDED.omraade, kam_ansvarlige = EXCLUDED.kam_ansvarlige, aktiv = EXCLUDED.aktiv, opdateret_at = now();
  DELETE FROM kam_aftale a WHERE NOT EXISTS (SELECT 1 FROM scenarie_kam k WHERE k.scenarie_id = _id AND k.kilde_kam_id = a.id);

  UPDATE distrikt_scenarie SET status = 'gjort_gaeldende', opdateret_at = now() WHERE id = _id;
  RETURN arkiv;
END $function$;