CREATE OR REPLACE FUNCTION public.addr_n_del(_addr text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  select regexp_match(
    regexp_replace(
      btrim(regexp_replace(split_part(translate(lower(coalesce(_addr,'')),'éè','ee'), ',', 1), '\s+', ' ', 'g')),
      'v\.(\s|$)', 'vej\1', 'g'),
    '^([^0-9]*[^0-9\s])\s*([0-9]+)\s*([a-zæøå]?)([^a-zæøå]|$)')
$$;