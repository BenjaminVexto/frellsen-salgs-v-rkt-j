DO $m$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public._bonus_laas_saelger'::regproc);
  IF position('DELETE FROM _bl_live;' in d) = 0 THEN RAISE EXCEPTION 'mønster ikke fundet'; END IF;
  d := replace(d, 'DELETE FROM _bl_live;', 'DELETE FROM _bl_live WHERE true;');
  EXECUTE d;
END $m$;