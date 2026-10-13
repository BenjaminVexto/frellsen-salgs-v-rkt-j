DROP FUNCTION public._scenarie_regel_kopier(uuid, uuid);
CREATE OR REPLACE FUNCTION public.scenarie_kopier(_id uuid, _navn text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  DROP TABLE _ms; DROP TABLE _md;
  RETURN sid;
END $function$;