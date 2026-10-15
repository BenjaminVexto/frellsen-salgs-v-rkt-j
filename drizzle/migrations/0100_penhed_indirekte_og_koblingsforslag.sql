ALTER TABLE public.location_pnr_link DROP CONSTRAINT location_pnr_link_kilde_check;
ALTER TABLE public.location_pnr_link ADD CONSTRAINT location_pnr_link_kilde_check
  CHECK (kilde = ANY (ARRAY['auto','manuel','afvist','indirekte']));
ALTER TABLE public.location_pnr_link
  ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN via_company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN note text,
  ADD COLUMN relation_oprettet boolean NOT NULL DEFAULT false;
ALTER TABLE public.location_pnr_link ADD CONSTRAINT location_pnr_link_indirekte_chk
  CHECK (kilde <> 'indirekte' OR (via_company_id IS NOT NULL AND company_id IS NOT NULL AND location_id IS NULL));
CREATE UNIQUE INDEX location_pnr_link_indirekte_uq ON public.location_pnr_link(p_nummer, afdeling_nr) WHERE kilde = 'indirekte';
CREATE INDEX location_pnr_link_via_idx ON public.location_pnr_link(via_company_id) WHERE via_company_id IS NOT NULL;

ALTER TABLE public.penhed_handling_log DROP CONSTRAINT IF EXISTS penhed_handling_log_handling_check;
ALTER TABLE public.penhed_handling_log ADD CONSTRAINT penhed_handling_log_handling_check
  CHECK (handling = ANY (ARRAY['kobl','fjern_kobling','ikke_relevant','fortryd_ikke_relevant','indirekte','fortryd_indirekte','afvis_forslag']));

CREATE TABLE public.penhed_forslag_afvist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  p_nummer text NOT NULL,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (p_nummer, location_id)
);
GRANT SELECT, INSERT, DELETE ON public.penhed_forslag_afvist TO authenticated;
GRANT ALL ON public.penhed_forslag_afvist TO service_role;
ALTER TABLE public.penhed_forslag_afvist ENABLE ROW LEVEL SECURITY;
CREATE POLICY tm_spaerret ON public.penhed_forslag_afvist AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));
CREATE POLICY "Læs afviste forslag" ON public.penhed_forslag_afvist FOR SELECT TO authenticated USING (true);
CREATE POLICY "Afvis forslag" ON public.penhed_forslag_afvist FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Fortryd afvisning" ON public.penhed_forslag_afvist FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE VIEW public.salgsintelligens_penhed_status WITH (security_invoker = on) AS
WITH kunde_cvr AS (
  SELECT DISTINCT c.afdeling_nr, c.cvr
  FROM companies c
  WHERE c.cvr IS NOT NULL
    AND c.customer_type = ANY (ARRAY['aktiv_kunde'::customer_type, 'sovende_kunde'::customer_type])
    AND kundetype(c.customer_segment_3) <> 'intern'
    AND btrim(COALESCE(c.customer_segment_3, '')) !~~ '10 [%'
    AND kundetype(c.customer_segment_3) <> 'offentlig'
    AND NOT EXISTS (SELECT 1 FROM cvr_blocklist b WHERE b.cvr = c.cvr)
)
SELECT k.afdeling_nr, k.cvr, p.p_number, p.name AS penhed_navn, p.address, p.zip, p.city,
  CASE WHEN lk.kilde = ANY (ARRAY['auto','manuel']) THEN 'daekket'
       WHEN lk.kilde = 'indirekte' THEN 'indirekte'
       ELSE 'none' END AS match_status,
  p.ansatte_interval, p.ansatte_praecis, p.ansatte_estimat,
  lk.kilde AS link_kilde,
  lk.visma_delivery_no AS link_visma_delivery_no,
  CASE WHEN lk.kilde = ANY (ARRAY['auto','manuel']) THEN pnr_link_location(lk.afdeling_nr, lk.visma_delivery_no, lk.location_id) ELSE NULL::uuid END AS link_location_id
FROM kunde_cvr k
JOIN cvr_penheder p ON p.cvr = k.cvr AND p.is_active
LEFT JOIN LATERAL (
  SELECT x.* FROM location_pnr_link x
  WHERE x.p_nummer = p.p_number AND x.afdeling_nr = k.afdeling_nr
  ORDER BY CASE x.kilde WHEN 'manuel' THEN 1 WHEN 'auto' THEN 2 WHEN 'indirekte' THEN 3 ELSE 4 END, x.oprettet_dato DESC
  LIMIT 1
) lk ON true;

CREATE OR REPLACE FUNCTION public.penhed_saet_indirekte(_p_nummer text, _afdeling_nr integer, _company_id uuid, _via_company_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ny boolean := false; _id uuid;
BEGIN
  IF public.er_telemarketing() THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  IF NOT (_afdeling_nr = ANY (public.my_afdelinger())) THEN RAISE EXCEPTION 'Ingen adgang til afdelingen'; END IF;
  IF NOT public.can_access_company(auth.uid(), _company_id) THEN RAISE EXCEPTION 'Ingen adgang til virksomheden'; END IF;
  IF _company_id = _via_company_id THEN RAISE EXCEPTION 'Forhandleren kan ikke være virksomheden selv'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cvr_penheder WHERE p_number = _p_nummer) THEN RAISE EXCEPTION 'Ukendt P-enhed'; END IF;

  INSERT INTO company_relations (from_company_id, to_company_id, relation_type, created_by)
  VALUES (_company_id, _via_company_id, 'forsynes_af', auth.uid())
  ON CONFLICT (from_company_id, to_company_id, relation_type) DO NOTHING
  RETURNING id INTO _id;
  _ny := _id IS NOT NULL;
  IF _ny THEN
    INSERT INTO company_relations (from_company_id, to_company_id, relation_type, created_by)
    VALUES (_via_company_id, _company_id, 'leverer_til', auth.uid())
    ON CONFLICT (from_company_id, to_company_id, relation_type) DO NOTHING;
  END IF;

  DELETE FROM location_pnr_link WHERE p_nummer = _p_nummer AND afdeling_nr = _afdeling_nr AND kilde = 'indirekte';
  INSERT INTO location_pnr_link (p_nummer, afdeling_nr, kilde, company_id, via_company_id, note, relation_oprettet, oprettet_af)
  VALUES (_p_nummer, _afdeling_nr, 'indirekte', _company_id, _via_company_id, NULLIF(btrim(_note), ''), _ny, auth.uid());
  INSERT INTO penhed_handling_log (p_nummer, handling, begrundelse) VALUES (_p_nummer, 'indirekte', NULLIF(btrim(_note), ''));
END $$;

CREATE OR REPLACE FUNCTION public.penhed_fjern_indirekte(_p_nummer text, _afdeling_nr integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF public.er_telemarketing() THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  IF NOT (_afdeling_nr = ANY (public.my_afdelinger())) THEN RAISE EXCEPTION 'Ingen adgang til afdelingen'; END IF;
  DELETE FROM location_pnr_link WHERE p_nummer = _p_nummer AND afdeling_nr = _afdeling_nr AND kilde = 'indirekte'
  RETURNING company_id, via_company_id, relation_oprettet INTO r;
  IF r.company_id IS NULL THEN RETURN; END IF;
  IF r.relation_oprettet AND NOT EXISTS (
    SELECT 1 FROM location_pnr_link WHERE kilde = 'indirekte' AND company_id = r.company_id AND via_company_id = r.via_company_id
  ) THEN
    DELETE FROM company_relations
     WHERE (from_company_id = r.company_id AND to_company_id = r.via_company_id AND relation_type = 'forsynes_af')
        OR (from_company_id = r.via_company_id AND to_company_id = r.company_id AND relation_type = 'leverer_til');
  END IF;
  INSERT INTO penhed_handling_log (p_nummer, handling) VALUES (_p_nummer, 'fortryd_indirekte');
END $$;

REVOKE ALL ON FUNCTION public.penhed_saet_indirekte(text, integer, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.penhed_fjern_indirekte(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.penhed_saet_indirekte(text, integer, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.penhed_fjern_indirekte(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.penhed_koblingsforslag(_cvr text DEFAULT NULL)
RETURNS TABLE(p_nummer text, cvr text, penhed_adresse text, penhed_zip text, penhed_city text, ansatte integer,
  afdeling_nr integer, location_id uuid, visma_delivery_no text, lokation_adresse text,
  company_id uuid, company_name text, samme_cvr boolean, husnr_afstand integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' SET statement_timeout TO '60s' AS $$
  WITH p AS MATERIALIZED (
    SELECT cp.p_number AS pnr, cp.cvr AS pcvr, cp.address AS padr, cp.zip AS pzip, cp.city AS pcity,
           COALESCE(cp.ansatte_praecis, cp.ansatte_estimat)::int AS ans,
           addr_n_vej(cp.address) AS pv, addr_n_husnr(cp.address) AS ph
    FROM cvr_penheder cp
    WHERE cp.is_active AND (_cvr IS NULL OR cp.cvr = _cvr)
      AND addr_n_vej(cp.address) IS NOT NULL AND cp.zip IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM penhed_ikke_relevant ir WHERE ir.p_nummer = cp.p_number)
  ), l AS MATERIALIZED (
    SELECT lo.id AS lid, lo.afdeling_nr AS lafd, lo.visma_delivery_no::text AS knr, lo.address AS ladr, lo.zip AS lzip,
           addr_n_vej(lo.address) AS lv, addr_n_husnr(lo.address) AS lh,
           c.id AS cid, c.name::text AS cname,
           NULLIF(upper(regexp_replace(COALESCE(c.cvr,''), '^\s*DK|[\s-]', '', 'gi')), '') AS ccvr
    FROM locations lo JOIN companies c ON c.id = lo.company_id
    WHERE lo.visma_delivery_no IS NOT NULL AND c.afloest_af_company_id IS NULL
      AND lo.zip IN (SELECT p.pzip FROM p)
      AND NOT EXISTS (SELECT 1 FROM location_pnr_link x WHERE x.location_id = lo.id AND x.kilde IN ('auto','manuel'))
  ), k AS (
    SELECT p.*, l.*, (l.ccvr IS NOT NULL AND l.ccvr = p.pcvr) AS sc,
           abs(substring(l.lh FROM '^\d+')::int - substring(p.ph FROM '^\d+')::int) AS afst
    FROM p JOIN l ON l.lzip = p.pzip AND l.lv = p.pv
    WHERE p.ph ~ '^\d{1,6}' AND l.lh ~ '^\d{1,6}'
      AND (l.ccvr = p.pcvr OR l.ccvr IS NULL)
  )
  SELECT k.pnr, k.pcvr, k.padr, k.pzip, k.pcity, k.ans, k.lafd, k.lid, k.knr, k.ladr,
         k.cid, k.cname, k.sc, k.afst
  FROM k
  WHERE k.afst <= 4
    AND NOT EXISTS (SELECT 1 FROM location_pnr_link x WHERE x.p_nummer = k.pnr AND x.afdeling_nr = k.lafd AND x.kilde IN ('auto','manuel','indirekte'))
    AND NOT EXISTS (SELECT 1 FROM location_pnr_link x WHERE x.p_nummer = k.pnr AND x.location_id = k.lid AND x.kilde = 'afvist')
    AND NOT EXISTS (SELECT 1 FROM penhed_forslag_afvist a WHERE a.p_nummer = k.pnr AND a.location_id = k.lid)
  ORDER BY k.sc DESC, k.afst, k.ans DESC NULLS LAST, k.pnr
$$;
REVOKE ALL ON FUNCTION public.penhed_koblingsforslag(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.penhed_koblingsforslag(text) TO authenticated;