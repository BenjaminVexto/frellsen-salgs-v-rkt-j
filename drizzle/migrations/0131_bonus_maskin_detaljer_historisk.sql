DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.bonus_maskin_detaljer'::regproc);
  IF position('CASE WHEN l.user_id IS NOT NULL THEN l.maskiner ELSE c.detaljer END' IN d) = 0 THEN RAISE EXCEPTION 'Mønster ikke fundet'; END IF;
  -- Historiske (lønseddel) måneder: admin ser den beregnede liste til sammenligning, sælgere ser intet.
  EXECUTE replace(d, 'CASE WHEN l.user_id IS NOT NULL THEN l.maskiner ELSE c.detaljer END',
    'CASE WHEN l.user_id IS NULL OR (l.kilde = ''loenseddel'' AND public.is_admin(auth.uid())) THEN c.detaljer ELSE l.maskiner END');
END $do$;