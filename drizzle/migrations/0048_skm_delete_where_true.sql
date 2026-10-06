CREATE OR REPLACE FUNCTION public.skm_genberegn_alt(_afdeling_nr integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _skm_keys (company_id uuid, afdeling_nr int, period date);
  DELETE FROM pg_temp._skm_keys WHERE true;
  INSERT INTO pg_temp._skm_keys
    SELECT DISTINCT company_id, afdeling_nr, period FROM public.sales_monthly
    WHERE company_id IS NOT NULL AND afdeling_nr IS NOT NULL AND period IS NOT NULL
      AND (_afdeling_nr IS NULL OR afdeling_nr = _afdeling_nr);
  IF _afdeling_nr IS NULL THEN
    TRUNCATE public.sales_kunde_maaned;
    TRUNCATE public.location_mp_info;
  END IF;
  PERFORM public._skm_refresh_keys();
  SELECT count(*) INTO n FROM public.sales_kunde_maaned WHERE _afdeling_nr IS NULL OR afdeling_nr = _afdeling_nr;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.skm_genberegn_alt(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.skm_genberegn_alt(integer) TO service_role;

DO $do$
DECLARE d text := pg_get_functiondef('public._skm_refresh_keys()'::regprocedure);
BEGIN
  d := replace(d, 'DELETE FROM pg_temp._skm_keys;', 'DELETE FROM pg_temp._skm_keys WHERE true;');
  EXECUTE d;
END $do$;
