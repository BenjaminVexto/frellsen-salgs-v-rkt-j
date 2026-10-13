CREATE OR REPLACE FUNCTION public.navn_norm(_n text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(COALESCE(_n,'')), '(a/s|i/s|k/s|p/s|a\.m\.b\.a\.?|f\.m\.b\.a\.?|s\.m\.b\.a\.?)', ' ', 'g'),
      '[^a-z0-9æøåäöüé]+', ' ', 'g'),
    '\m(aps|ivs|amba|fmba|smba|kommune|kommunes|og|af|the)\M', ' ', 'g'),
  '\s+', ' ', 'g'))
$$;

-- Særprægede ord (>= 5 tegn, ikke generiske) til "fælles meningsfuldt ord".
CREATE OR REPLACE FUNCTION public.navn_ord(_n text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT w), '{}')
  FROM unnest(regexp_split_to_array(public.navn_norm(_n), ' ')) w
  WHERE length(w) >= 5
    AND w !~ '^\d+$'
    AND w NOT IN ('holding','service','services','danmark','denmark','gruppen','group','invest','ejendom','ejendomme',
                  'selskab','selskabet','forening','foreningen','andelsboligforening','ejerforening','ejerforeningen',
                  'consult','consulting','company','center','centret','centeret','handel','international','nordic',
                  'scandinavia','partner','partners','advokat','advokater','kontor','byggeri','administration',
                  'boligforening','afdeling','region','regionen','plejecenter','plejecentret','plejehjem','skole',
                  'skolen','boernehave','børnehave','børnehus','børnehuset','vuggestue','institution','klinik','klinikken')
$$;

CREATE OR REPLACE FUNCTION public.cvr_match_crm(cvr_rows jsonb)
RETURNS TABLE(cvr text, match_type text, sikker boolean, score real, company_id uuid, company_name text, kundenr text, ikke_kontakt boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Ingen adgang';
  END IF;
  RETURN QUERY
  WITH inp AS MATERIALIZED (
    SELECT r->>'cvr' AS cvr,
           COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'pnumre','[]'::jsonb))), '{}'::text[]) AS pnr,
           public.addr_n_vej(r->>'address') AS v,
           public.addr_n_husnr(r->>'address') AS h,
           NULLIF(regexp_replace(COALESCE(r->>'zip',''), '\D', '', 'g'), '') AS zip,
           right(regexp_replace(COALESCE(r->>'phone',''), '\D', '', 'g'), 8) AS tel,
           public.navn_norm(r->>'name') AS nn,
           public.navn_ord(r->>'name') AS ord,
           public.navn_norm(r->>'city') AS byn
    FROM jsonb_array_elements(cvr_rows) r
    WHERE r->>'cvr' ~ '^\d{8}$'
  ),
  comp AS MATERIALIZED (
    SELECT c.id, c.name, c.visma_id,
           NULLIF(upper(regexp_replace(COALESCE(c.cvr,''), '^\s*DK|[\s-]', '', 'gi')), '') AS ncvr,
           upper(regexp_replace(COALESCE(c.parent_cvr,''), '^\s*DK|[\s-]', '', 'gi')) AS npcvr,
           right(regexp_replace(COALESCE(c.phone,''), '\D', '', 'g'), 8) AS tel,
           c.address, NULLIF(regexp_replace(COALESCE(c.zip,''), '\D', '', 'g'), '') AS zip
    FROM public.companies c
  ),
  utencvr AS MATERIALIZED (SELECT * FROM comp WHERE ncvr IS NULL),
  sikre AS (
    SELECT i.cvr, 1 AS pri, 'cvr'::text AS t, c.id AS cid, c.visma_id::text AS knr
      FROM inp i JOIN comp c ON c.ncvr = i.cvr
    UNION ALL
    SELECT i.cvr, 2, 'parent_cvr', c.id, c.visma_id::text
      FROM inp i JOIN comp c ON c.npcvr = i.cvr
    UNION ALL
    SELECT i.cvr, 3, 'penhed', l.company_id, l.visma_delivery_no::text
      FROM inp i JOIN public.location_pnr_link k ON k.p_nummer = ANY(i.pnr)
      JOIN public.locations l ON l.id = k.location_id
  ),
  -- Adresse/telefon-kandidater: kun CRM-virksomheder uden CVR
  lok AS MATERIALIZED (
    SELECT l.company_id, l.visma_delivery_no::text AS knr, l.zip_norm::text AS zip, l.address,
           right(regexp_replace(COALESCE(l.phone,''), '\D', '', 'g'), 8) AS tel
    FROM public.locations l JOIN utencvr u ON u.id = l.company_id
  ),
  lok_adr AS MATERIALIZED (
    SELECT l.company_id, l.knr, l.zip, public.addr_n_vej(l.address) AS v, public.addr_n_husnr(l.address) AS h
    FROM lok l WHERE l.zip IN (SELECT i.zip FROM inp i WHERE i.zip IS NOT NULL)
    UNION ALL
    SELECT u.id, u.visma_id::text, u.zip, public.addr_n_vej(u.address), public.addr_n_husnr(u.address)
    FROM utencvr u WHERE u.zip IN (SELECT i.zip FROM inp i WHERE i.zip IS NOT NULL)
  ),
  tel_k AS MATERIALIZED (
    SELECT l.company_id, l.knr, l.tel FROM lok l WHERE length(l.tel) = 8
    UNION ALL
    SELECT u.id, u.visma_id::text, u.tel FROM utencvr u WHERE length(u.tel) = 8
  ),
  kand AS (
    SELECT i.cvr, a.company_id AS cid, a.knr, true AS adr, false AS tlf
      FROM inp i JOIN lok_adr a ON a.zip = i.zip AND a.v = i.v AND a.h = i.h
     WHERE i.v IS NOT NULL AND i.h IS NOT NULL
    UNION ALL
    SELECT i.cvr, t.company_id, t.knr, false, true
      FROM inp i JOIN tel_k t ON t.tel = i.tel WHERE length(i.tel) = 8
  ),
  par AS (
    SELECT k.cvr, k.cid, max(k.knr) AS knr, bool_or(k.adr) AS adr, bool_or(k.tlf) AS tlf
    FROM kand k GROUP BY k.cvr, k.cid
  ),
  vurd AS (
    SELECT p.*, similarity(i.nn, public.navn_norm(u.name)) AS sc,
           EXISTS (
             SELECT 1 FROM unnest(i.ord) w
             WHERE w = ANY(public.navn_ord(u.name))
               AND w <> COALESCE(i.byn,'') AND position(w IN COALESCE(i.v,'')) = 0
           ) AS faelles
    FROM par p JOIN inp i ON i.cvr = p.cvr JOIN utencvr u ON u.id = p.cid
  ),
  usikre AS (
    SELECT v.cvr, v.cid, v.knr, v.sc,
      CASE
        WHEN v.adr AND (v.sc >= 0.4 OR v.faelles) THEN 4
        WHEN v.adr AND v.tlf THEN 5
        WHEN v.tlf AND (v.sc >= 0.4 OR v.faelles) THEN 6
        WHEN v.adr THEN 7
        ELSE 8 END AS pri
    FROM vurd v
  ),
  alle AS (
    SELECT s.cvr, s.pri, s.cid, s.knr, NULL::real AS sc FROM sikre s
    UNION ALL
    SELECT u.cvr, u.pri, u.cid, u.knr, u.sc FROM usikre u
  )
  SELECT DISTINCT ON (a.cvr) a.cvr,
    (ARRAY['cvr','parent_cvr','penhed','adresse_navn','adresse_telefon','telefon_navn','adresse','telefon'])[a.pri],
    a.pri <= 6, a.sc, a.cid, co.name, a.knr, COALESCE(co.ikke_kontakt, false)
  FROM alle a JOIN public.companies co ON co.id = a.cid
  ORDER BY a.cvr, a.pri, a.sc DESC NULLS LAST, (a.knr IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.cvr_match_crm(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cvr_match_crm(jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.cvr_findes_i_crm(jsonb) IS 'DEPRECATED: replaced by cvr_match_crm';