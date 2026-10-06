-- Normaliseret adresse til P-enhed-matchning: vejnavn + husnr (+bogstav); etage/side/sal og tekst efter komma ignoreres.
CREATE OR REPLACE FUNCTION public.addr_n_del(_addr text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  select regexp_match(
    regexp_replace(
      btrim(regexp_replace(split_part(translate(lower(coalesce(_addr,'')),'éè','ee'), ',', 1), '\s+', ' ', 'g')),
      'v\.(\s|$)', 'vej\1', 'g'),
    '^(.*?[a-zæøå.])\s*(\d+)\s*([a-zæøå](?![a-zæøå]))?')
$$;

CREATE OR REPLACE FUNCTION public.addr_n_vej(_addr text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  select nullif(btrim(regexp_replace((public.addr_n_del(_addr))[1], '[.\s]+$', '')), '')
$$;

CREATE OR REPLACE FUNCTION public.addr_n_husnr(_addr text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  select nullif((public.addr_n_del(_addr))[2] || coalesce((public.addr_n_del(_addr))[3], ''), '')
$$;

-- En P-enhed kan nu kobles til flere lokationer på samme adresse.
ALTER TABLE public.location_pnr_link DROP CONSTRAINT IF EXISTS location_pnr_link_p_nummer_afdeling_nr_key;
CREATE UNIQUE INDEX IF NOT EXISTS location_pnr_link_p_loc_key ON public.location_pnr_link (p_nummer, location_id);
CREATE INDEX IF NOT EXISTS location_pnr_link_p_afd_idx ON public.location_pnr_link (p_nummer, afdeling_nr);
CREATE INDEX IF NOT EXISTS location_pnr_link_location_idx ON public.location_pnr_link (location_id);

CREATE OR REPLACE FUNCTION public.auto_link_penheder(_cvrs text[] DEFAULT NULL::text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE n integer;
BEGIN
  WITH kand AS (
    SELECT p.p_number, l.afdeling_nr, l.id AS location_id, l.visma_delivery_no
    FROM cvr_penheder p
    JOIN companies c ON c.cvr = p.cvr AND c.afloest_af_company_id IS NULL
    JOIN locations l ON l.company_id = c.id
    WHERE p.is_active
      AND (_cvrs IS NULL OR p.cvr = ANY(_cvrs))
      AND l.visma_delivery_no IS NOT NULL
      AND l.zip IS NOT NULL AND l.zip = p.zip
      AND addr_n_vej(l.address) IS NOT NULL
      AND addr_n_vej(l.address) = addr_n_vej(p.address)
      AND addr_n_husnr(l.address) = addr_n_husnr(p.address)
  ), sikker AS (
    -- Usikkert: en lokation der matcher flere P-enheder kobles ikke.
    SELECT k.* FROM kand k
    WHERE (SELECT count(*) FROM kand k3 WHERE k3.location_id = k.location_id) = 1
      AND NOT EXISTS (SELECT 1 FROM location_pnr_link x WHERE x.location_id = k.location_id)
      AND NOT EXISTS (SELECT 1 FROM location_pnr_link x WHERE x.p_nummer = k.p_number
                        AND x.afdeling_nr = k.afdeling_nr AND x.kilde = 'afvist')
  )
  INSERT INTO location_pnr_link (p_nummer, afdeling_nr, visma_delivery_no, location_id, kilde)
  SELECT p_number, afdeling_nr, visma_delivery_no, location_id, 'auto' FROM sikker
  ON CONFLICT (p_nummer, location_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;