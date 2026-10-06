CREATE OR REPLACE FUNCTION public.lok_saelger(_location_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT l.saelger_user_id FROM public.locations l WHERE l.id = _location_id AND l.i_aktoer $$;
REVOKE EXECUTE ON FUNCTION public.lok_saelger(uuid) FROM anon;

DO $do$
DECLARE r record; d text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('_maalepunkt_db_detaljer_raw','bonus_db_detaljer','maalepunkt_aktive_kunder_detaljer',
                        'maalepunkt_db','maalepunkt_omsaetning','maalepunkt_oms_detaljer','portfolio_db_ytd')
      AND p.prosrc ~ 'c\.assigned_to\s*=\s*_saelger'
      AND p.prosrc LIKE '%sales_monthly sm%'
  LOOP
    d := pg_get_functiondef(r.oid);
    d := regexp_replace(d, 'c\.assigned_to\s*=\s*_saelger', 'public.lok_saelger(sm.location_id) = _saelger', 'g');
    EXECUTE d;
  END LOOP;
END
$do$;