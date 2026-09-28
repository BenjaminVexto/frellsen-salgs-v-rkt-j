DO $$
DECLARE r record; d text; nd text;
  ny text := $x$public.kundetype(c.customer_segment_3) <> 'intern' AND btrim(coalesce(c.customer_segment_3,'')) NOT LIKE '10 [%'$x$;
BEGIN
  d := pg_get_functiondef('public.penhed_sync_candidates()'::regprocedure);
  nd := replace(d, $x$public.kundetype(c.customer_segment_3) <> 'intern'$x$, ny);
  nd := replace(nd, 'NOT public.is_offentlig_kunde(c.name, c.main_branch_code, c.is_public, c.institution_type)', $x$public.kundetype(c.customer_segment_3) <> 'offentlig'$x$);
  EXECUTE nd;

  FOR r IN SELECT 'salgsintelligens_penhed_status' v UNION ALL SELECT 'salgsintelligens_mersalg' LOOP
    d := pg_get_viewdef(('public.'||r.v)::regclass);
    nd := replace(d, $x$(kundetype(c.customer_segment_3) <> 'intern'::text)$x$, '(' || ny || ')');
    nd := replace(nd, '(NOT is_offentlig_kunde(c.name, c.main_branch_code, c.is_public, c.institution_type))', $x$(public.kundetype(c.customer_segment_3) <> 'offentlig')$x$);
    IF nd = d THEN RAISE EXCEPTION 'Ingen ændring i %', r.v; END IF;
    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s', r.v, nd);
  END LOOP;
END $$;

DROP FUNCTION public.kunde_sektor(text, text, text, boolean, public.institution_type, text);