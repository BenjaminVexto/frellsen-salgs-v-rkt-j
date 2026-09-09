CREATE OR REPLACE FUNCTION public.kundetype(_segment_3 text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN btrim(coalesce(_segment_3, '')) LIKE '40 [%' THEN 'offentlig'
    WHEN btrim(coalesce(_segment_3, '')) LIKE '5 [%'  THEN 'intern'
    ELSE 'privat'
  END
$$;

REVOKE ALL ON FUNCTION public.kundetype(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kundetype(text) TO authenticated, service_role;

-- Den hidtidige hjælpefunktion bevares som indgang, men bindingsfeltet ignoreres nu.
CREATE OR REPLACE FUNCTION public.maalepunkt_kundekategori(_binding text, _segment3 text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT nullif(public.kundetype(_segment3), 'intern')
$$;