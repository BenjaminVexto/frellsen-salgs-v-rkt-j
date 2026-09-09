CREATE OR REPLACE FUNCTION public.maskin_modelfamilie(_txt text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE t text;
BEGIN
  t := lower(coalesce(_txt, ''));
  t := regexp_replace(t, '([0-9]),([0-9])', '\1.\2', 'g');
  t := regexp_replace(t, '\([^)]*\)', ' ', 'g');
  t := regexp_replace(t, '[0-9]+(\.[0-9]+)?( *- *[0-9]+(\.[0-9]+)?)? *kw', ' ', 'g');
  t := regexp_replace(t, '[0-9]+ *v( |,|$)', ' ', 'g');
  t := replace(t, '/', ' ');
  t := regexp_replace(t, '\s*inkl\.?\s*', ' ', 'g');
  -- kun et selvstændigt suffiks ", Leje" / ", L" fjernes
  FOR i IN 1..3 LOOP
    t := regexp_replace(t, '[,.[:space:]]+(leje|l)[,.[:space:]]*$', '');
  END LOOP;
  t := regexp_replace(t, '[^a-z0-9æøå+]', '', 'g');
  RETURN t;
END;
$$;