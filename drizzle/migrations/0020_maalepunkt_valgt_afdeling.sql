CREATE OR REPLACE FUNCTION public.maalepunkt_afdelinger(_saelger uuid, _afdeling_nr integer)
RETURNS integer[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN _afdeling_nr IS NULL THEN public.maalepunkt_afdelinger(_saelger)
    ELSE coalesce(array(SELECT x FROM unnest(public.maalepunkt_afdelinger(_saelger)) x WHERE x = _afdeling_nr), '{}'::int[])
  END
$$;
GRANT EXECUTE ON FUNCTION public.maalepunkt_afdelinger(uuid, integer) TO authenticated, service_role;

DO $do$
DECLARE r record; nydef text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('maalepunkt_aktive_kunder','maalepunkt_db','maalepunkt_db_detaljer','maalepunkt_maskiner',
                        'maalepunkt_maskiner_detaljer','maalepunkt_nye_kunder','maalepunkt_nye_kunder_detaljer','maalepunkt_omsaetning')
      AND pg_get_functiondef(p.oid) LIKE '%public.maalepunkt_afdelinger(_saelger)%'
      AND pg_get_function_arguments(p.oid) NOT LIKE '%_afdeling_nr%'
  LOOP
    nydef := replace(r.def, 'public.' || r.proname || '(' || r.args || ')',
                     'public.' || r.proname || '(' || r.args || ', _afdeling_nr integer DEFAULT NULL::integer)');
    nydef := replace(nydef, 'public.maalepunkt_afdelinger(_saelger)', 'public.maalepunkt_afdelinger(_saelger, _afdeling_nr)');
    EXECUTE 'DROP FUNCTION ' || r.oid::regprocedure::text;
    EXECUTE nydef;
  END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION public.maalepunkt_aktive_kunder_unikke(_saelger uuid, _fra date, _til date, _afdeling_nr integer DEFAULT NULL)
RETURNS TABLE(kategori text, antal integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;
  RETURN QUERY
  WITH kunder AS (
    SELECT c.id, public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kat,
           coalesce(c.has_active_equipment, false) AS udstyr
    FROM public.companies c
    WHERE c.afdeling_nr = ANY (_afd)
      AND (_saelger IS NULL OR c.assigned_to = _saelger)
      AND c.afloest_af_company_id IS NULL
      AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  )
  SELECT k.kat, count(*)::int
  FROM kunder k
  WHERE k.udstyr OR EXISTS (
    SELECT 1 FROM public.sales_monthly sm
    WHERE sm.company_id = k.id AND sm.afdeling_nr = ANY (_afd) AND sm.revenue > 0
      AND sm.period > (date_trunc('month', _fra) - interval '12 months')::date
      AND sm.period <= LEAST(date_trunc('month', _til)::date, (date_trunc('month', current_date) - interval '1 month')::date)
  )
  GROUP BY 1;
END $$;
GRANT EXECUTE ON FUNCTION public.maalepunkt_aktive_kunder_unikke(uuid, date, date, integer) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';