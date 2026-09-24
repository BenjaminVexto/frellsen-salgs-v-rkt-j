ALTER TABLE public.cvr_penheder
  ADD COLUMN IF NOT EXISTS ansatte_interval text,
  ADD COLUMN IF NOT EXISTS ansatte_praecis integer,
  ADD COLUMN IF NOT EXISTS ansatte_estimat integer,
  ADD COLUMN IF NOT EXISTS beskaeftigelse_periode text;

CREATE TABLE public.location_pnr_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  p_nummer text NOT NULL,
  afdeling_nr integer NOT NULL REFERENCES public.afdeling(afdeling_nr),
  visma_delivery_no text,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  kilde text NOT NULL CHECK (kilde IN ('auto','manuel','afvist')),
  oprettet_af uuid,
  oprettet_dato timestamptz NOT NULL DEFAULT now(),
  UNIQUE (p_nummer, afdeling_nr)
);
CREATE INDEX location_pnr_link_loc_idx ON public.location_pnr_link(afdeling_nr, visma_delivery_no);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_pnr_link TO authenticated;
GRANT ALL ON public.location_pnr_link TO service_role;
ALTER TABLE public.location_pnr_link ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Læs koblinger i egne afdelinger" ON public.location_pnr_link FOR SELECT TO authenticated
  USING (afdeling_nr = ANY (public.my_afdelinger()));
CREATE POLICY "Opret koblinger i egne afdelinger" ON public.location_pnr_link FOR INSERT TO authenticated
  WITH CHECK (afdeling_nr = ANY (public.my_afdelinger()) AND kilde IN ('manuel','afvist') AND oprettet_af = auth.uid());
CREATE POLICY "Ret koblinger i egne afdelinger" ON public.location_pnr_link FOR UPDATE TO authenticated
  USING (afdeling_nr = ANY (public.my_afdelinger()))
  WITH CHECK (afdeling_nr = ANY (public.my_afdelinger()) AND kilde IN ('manuel','afvist'));
CREATE POLICY "Slet koblinger i egne afdelinger" ON public.location_pnr_link FOR DELETE TO authenticated
  USING (afdeling_nr = ANY (public.my_afdelinger()));

-- Effektiv lokation: bundet til Vismas leveringsnr. + afdeling; location_id er kun genvej
CREATE OR REPLACE FUNCTION public.pnr_link_location(_afd integer, _dno text, _loc uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT l.id FROM locations l WHERE l.id = _loc),
    (SELECT l.id FROM locations l JOIN companies c ON c.id = l.company_id
      WHERE l.afdeling_nr = _afd AND l.visma_delivery_no = _dno
      ORDER BY (c.afloest_af_company_id IS NULL) DESC, l.created_at LIMIT 1))
$$;

-- Auto-match: kun entydige par (én aktiv P-enhed <-> én leveringsadresse) pr. afdeling
CREATE OR REPLACE FUNCTION public.auto_link_penheder(_cvrs text[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      AND l.zip = p.zip
      AND addr_vej(l.address) IS NOT NULL
      AND addr_vej(l.address) = addr_vej(p.address)
      AND addr_husnr(l.address) = addr_husnr(p.address)
  ), entydig AS (
    SELECT k.* FROM kand k
    WHERE (SELECT count(*) FROM kand k2 WHERE k2.p_number = k.p_number AND k2.afdeling_nr = k.afdeling_nr) = 1
      AND (SELECT count(*) FROM kand k3 WHERE k3.location_id = k.location_id) = 1
  )
  INSERT INTO location_pnr_link (p_nummer, afdeling_nr, visma_delivery_no, location_id, kilde)
  SELECT p_number, afdeling_nr, visma_delivery_no, location_id, 'auto' FROM entydig
  ON CONFLICT (p_nummer, afdeling_nr) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.auto_link_penheder(text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_link_penheder(text[]) TO service_role;

CREATE OR REPLACE VIEW public.salgsintelligens_penhed_status AS
WITH kunde_cvr AS (
  SELECT DISTINCT c.afdeling_nr, c.cvr FROM companies c
  WHERE c.cvr IS NOT NULL
    AND c.customer_type = ANY (ARRAY['aktiv_kunde'::customer_type,'sovende_kunde'::customer_type])
    AND coalesce(c.binding_status,'') <> 'intern_privat'
    AND NOT is_offentlig_kunde(c.name, c.main_branch_code, c.is_public, c.institution_type)
    AND NOT EXISTS (SELECT 1 FROM cvr_blocklist b WHERE b.cvr = c.cvr)
)
SELECT k.afdeling_nr, k.cvr, p.p_number, p.name AS penhed_navn, p.address, p.zip, p.city,
  CASE WHEN lk.kilde IN ('auto','manuel') THEN 'daekket' ELSE 'none' END AS match_status,
  p.ansatte_interval, p.ansatte_praecis, p.ansatte_estimat,
  lk.kilde AS link_kilde, lk.visma_delivery_no AS link_visma_delivery_no,
  CASE WHEN lk.kilde IN ('auto','manuel') THEN pnr_link_location(lk.afdeling_nr, lk.visma_delivery_no, lk.location_id) END AS link_location_id
FROM kunde_cvr k
JOIN cvr_penheder p ON p.cvr = k.cvr AND p.is_active
LEFT JOIN location_pnr_link lk ON lk.p_nummer = p.p_number AND lk.afdeling_nr = k.afdeling_nr;

CREATE OR REPLACE VIEW public.salgsintelligens_mersalg AS
WITH agg AS (
  SELECT s.afdeling_nr, s.cvr,
    (count(*) FILTER (WHERE s.match_status = 'none'))::integer AS potential,
    (count(*) FILTER (WHERE s.match_status <> 'none'))::integer AS daekket,
    (count(*))::integer AS penheder_total,
    coalesce(sum(s.ansatte_estimat) FILTER (WHERE s.match_status = 'none'),0)::integer AS ansatte_ikke_daekket,
    coalesce(sum(s.ansatte_estimat),0)::integer AS ansatte_total,
    coalesce(max(s.ansatte_estimat) FILTER (WHERE s.match_status = 'none'),0)::integer AS max_ansatte_ikke_daekket
  FROM salgsintelligens_penhed_status s GROUP BY s.afdeling_nr, s.cvr
), hoved AS (
  SELECT DISTINCT ON (c.afdeling_nr, c.cvr) c.afdeling_nr, c.cvr, c.id AS company_id, c.name, c.city, c.assigned_to
  FROM companies c
  WHERE c.cvr IS NOT NULL
    AND c.customer_type = ANY (ARRAY['aktiv_kunde'::customer_type,'sovende_kunde'::customer_type])
    AND coalesce(c.binding_status,'') <> 'intern_privat'
  ORDER BY c.afdeling_nr, c.cvr, (SELECT count(*) FROM locations l WHERE l.company_id = c.id) DESC, c.name
), enheder AS (
  SELECT afdeling_nr, cvr, (count(*))::integer AS antal_kundenumre FROM companies WHERE cvr IS NOT NULL GROUP BY afdeling_nr, cvr
)
SELECT a.afdeling_nr, a.cvr, a.potential, a.daekket, a.penheder_total, h.company_id, h.name, h.city, h.assigned_to, e.antal_kundenumre,
  a.ansatte_ikke_daekket, a.ansatte_total, a.max_ansatte_ikke_daekket
FROM agg a
JOIN hoved h ON h.afdeling_nr = a.afdeling_nr AND h.cvr = a.cvr
JOIN enheder e ON e.afdeling_nr = a.afdeling_nr AND e.cvr = a.cvr
WHERE a.potential > 0;

-- Ugentlig synk: mandag kl. 02
CREATE OR REPLACE FUNCTION public.queue_penhed_sync_ugentlig()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO cvr_penhed_sync_jobs (cvrs)
  SELECT array_agg(cvr) FROM (
    SELECT cvr, (row_number() OVER (ORDER BY cvr) - 1) / 25 AS g FROM penhed_sync_candidates() WHERE cvr ~ '^\d{8}$'
  ) x GROUP BY g;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.queue_penhed_sync_ugentlig() FROM anon, authenticated;
SELECT cron.schedule('penhed-sync-ugentlig', '0 2 * * 1', 'select public.queue_penhed_sync_ugentlig();');