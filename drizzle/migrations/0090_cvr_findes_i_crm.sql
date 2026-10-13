CREATE OR REPLACE FUNCTION public.cvr_findes_i_crm(cvr_rows jsonb)
RETURNS TABLE(cvr text, match_type text, company_id uuid, company_name text, kundenr text, ikke_kontakt boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Ingen adgang';
  END IF;
  RETURN QUERY
  WITH inp AS (
    SELECT r->>'cvr' AS cvr,
           COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'pnumre','[]'::jsonb))), '{}'::text[]) AS pnr,
           public.addr_n_vej(r->>'address') AS v,
           public.addr_n_husnr(r->>'address') AS h,
           NULLIF(regexp_replace(COALESCE(r->>'zip',''), '\D', '', 'g'), '') AS zip,
           right(regexp_replace(COALESCE(r->>'phone',''), '\D', '', 'g'), 8) AS tel
    FROM jsonb_array_elements(cvr_rows) r
    WHERE r->>'cvr' ~ '^\d{8}$'
  ),
  comp AS (
    SELECT c.id, c.visma_id,
           upper(regexp_replace(COALESCE(c.cvr,''), '^\s*DK|[\s-]', '', 'gi')) AS ncvr,
           upper(regexp_replace(COALESCE(c.parent_cvr,''), '^\s*DK|[\s-]', '', 'gi')) AS npcvr,
           right(regexp_replace(COALESCE(c.phone,''), '\D', '', 'g'), 8) AS tel,
           c.address, NULLIF(regexp_replace(COALESCE(c.zip,''), '\D', '', 'g'), '') AS zip
    FROM public.companies c
  ),
  m AS (
    SELECT i.cvr, 1 AS pri, 'cvr'::text AS t, c.id AS cid, c.visma_id::text AS knr
      FROM inp i JOIN comp c ON c.ncvr = i.cvr
    UNION ALL
    SELECT i.cvr, 2, 'parent_cvr', c.id, c.visma_id::text
      FROM inp i JOIN comp c ON c.npcvr = i.cvr
    UNION ALL
    SELECT i.cvr, 3, 'penhed', l.company_id, l.visma_delivery_no::text
      FROM inp i JOIN public.location_pnr_link k ON k.p_nummer = ANY(i.pnr)
      JOIN public.locations l ON l.id = k.location_id
    UNION ALL
    SELECT i.cvr, 4, 'adresse', l.company_id, l.visma_delivery_no::text
      FROM inp i JOIN public.locations l
        ON l.zip_norm::text = i.zip
       AND public.addr_n_vej(l.address) = i.v AND public.addr_n_husnr(l.address) = i.h
     WHERE i.v IS NOT NULL AND i.h IS NOT NULL
    UNION ALL
    SELECT i.cvr, 4, 'adresse', c.id, c.visma_id::text
      FROM inp i JOIN comp c
        ON c.zip = i.zip AND public.addr_n_vej(c.address) = i.v AND public.addr_n_husnr(c.address) = i.h
     WHERE i.v IS NOT NULL AND i.h IS NOT NULL
    UNION ALL
    SELECT i.cvr, 5, 'telefon', c.id, c.visma_id::text
      FROM inp i JOIN comp c ON c.tel = i.tel WHERE length(i.tel) = 8
    UNION ALL
    SELECT i.cvr, 5, 'telefon', l.company_id, l.visma_delivery_no::text
      FROM inp i JOIN public.locations l
        ON right(regexp_replace(COALESCE(l.phone,''), '\D', '', 'g'), 8) = i.tel
     WHERE length(i.tel) = 8
  )
  SELECT DISTINCT ON (m.cvr) m.cvr, m.t, m.cid, co.name, m.knr, COALESCE(co.ikke_kontakt, false)
  FROM m JOIN public.companies co ON co.id = m.cid
  ORDER BY m.cvr, m.pri, (m.knr IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.cvr_findes_i_crm(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cvr_findes_i_crm(jsonb) TO authenticated, service_role;