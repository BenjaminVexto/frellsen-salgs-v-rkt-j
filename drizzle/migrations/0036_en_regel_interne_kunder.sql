GRANT EXECUTE ON FUNCTION public.kundetype(text) TO authenticated, service_role;

DO $$
DECLARE r record; d text; nd text;
BEGIN
  -- Portefølje: egen regex -> central kundetype()
  FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace
           AND proname IN ('portfolio_aggregat','portfolio_totaler','portfolio_db_ytd','penhed_sync_candidates')
  LOOP
    d := pg_get_functiondef(r.oid);
    nd := regexp_replace(d, $re$coalesce\(c\.customer_segment_3,\s*''\)\s*!~\s*'\^\\s\*5\\s\*\\\['$re$, $x$public.kundetype(c.customer_segment_3) <> 'intern'$x$, 'gi');
    nd := replace(nd, $x$coalesce(c.binding_status,'') <> 'intern_privat'$x$, $x$public.kundetype(c.customer_segment_3) <> 'intern'$x$);
    IF nd <> d THEN EXECUTE nd; END IF;
  END LOOP;

  -- Afdelingspotentiale-views
  FOR r IN SELECT 'salgsintelligens_penhed_status' v UNION ALL SELECT 'salgsintelligens_mersalg' LOOP
    d := pg_get_viewdef(('public.'||r.v)::regclass);
    nd := replace(d, $x$(COALESCE(c.binding_status, ''::text) <> 'intern_privat'::text)$x$, $x$(public.kundetype(c.customer_segment_3) <> 'intern'::text)$x$);
    IF nd <> d THEN EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s', r.v, nd); END IF;
  END LOOP;
END $$;