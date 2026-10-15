CREATE OR REPLACE FUNCTION public.cvr_norm(_cvr text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN x ~ '^\d{8}$' THEN x END FROM (SELECT regexp_replace(upper(COALESCE(_cvr,'')), '^\s*DK|\D', '', 'g') AS x) s
$$;

CREATE INDEX IF NOT EXISTS companies_cvr_norm_idx ON public.companies (public.cvr_norm(cvr)) WHERE afloest_af_company_id IS NULL;

CREATE OR REPLACE FUNCTION public._status_rang(_t text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _t WHEN 'aktiv_kunde' THEN 1 WHEN 'servicekunde' THEN 2 WHEN 'sovende_kunde' THEN 3 WHEN 'tidligere_kunde' THEN 4 ELSE 5 END
$$;

-- Må brugeren se salgstal for kontoen? (admin/salgssupport, ansvarlig sælger eller lokationssælger)
CREATE OR REPLACE FUNCTION public._maa_se_kontosalg(_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.can_access_company(auth.uid(), _company_id)
      OR EXISTS (SELECT 1 FROM locations l WHERE l.company_id = _company_id AND l.saelger_user_id = auth.uid())
$$;

-- Grupper af konti med samme CVR (kun grupper med flere konti)
CREATE OR REPLACE FUNCTION public.cvr_grupper()
RETURNS TABLE(cvr text, antal_konti int, aktive int, bedste_status text, oms_12m numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _fra date := (date_trunc('month', now()) - interval '12 months')::date;
        _til date := date_trunc('month', now())::date;
BEGIN
  IF public.er_telemarketing() THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  RETURN QUERY
  WITH k AS (
    SELECT c.id, public.cvr_norm(c.cvr) AS n, c.customer_type::text AS t
    FROM companies c
    WHERE c.afloest_af_company_id IS NULL AND public.cvr_norm(c.cvr) IS NOT NULL
      AND c.afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[])
  ), g AS (
    SELECT k.n FROM k GROUP BY k.n HAVING count(*) > 1
  ), s AS (
    SELECT m.company_id, sum(m.rev) AS rev FROM sales_kunde_maaned m
    WHERE m.period >= _fra AND m.period < _til AND m.company_id IN (SELECT k.id FROM k JOIN g ON g.n = k.n)
    GROUP BY m.company_id
  )
  SELECT k.n, count(*)::int, count(*) FILTER (WHERE k.t = 'aktiv_kunde')::int,
         (array_agg(k.t ORDER BY public._status_rang(k.t)))[1], COALESCE(sum(s.rev), 0)
  FROM k JOIN g ON g.n = k.n LEFT JOIN s ON s.company_id = k.id
  GROUP BY k.n;
END $$;

-- Konti i én CVR-gruppe; salgstal pr. konto kun hvor brugeren må se dem
CREATE OR REPLACE FUNCTION public.cvr_gruppe_konti(_cvr text)
RETURNS TABLE(company_id uuid, name text, visma_id text, address text, zip text, city text, customer_type text,
  saelger_navn text, oms_12m numeric, maa_se_salg boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _fra date := (date_trunc('month', now()) - interval '12 months')::date;
        _til date := date_trunc('month', now())::date;
BEGIN
  IF public.er_telemarketing() THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  RETURN QUERY
  WITH k AS (
    SELECT c.* FROM companies c
    WHERE c.afloest_af_company_id IS NULL AND public.cvr_norm(c.cvr) = public.cvr_norm(_cvr)
      AND c.afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[])
  ), s AS (
    SELECT m.company_id, sum(m.rev) AS rev FROM sales_kunde_maaned m
    WHERE m.period >= _fra AND m.period < _til AND m.company_id IN (SELECT k.id FROM k)
    GROUP BY m.company_id
  )
  SELECT k.id, k.name::text, k.visma_id::text, k.address::text, k.zip::text, k.city::text, k.customer_type::text,
         p.full_name::text,
         CASE WHEN public._maa_se_kontosalg(k.id) THEN COALESCE(s.rev, 0) END,
         public._maa_se_kontosalg(k.id)
  FROM k LEFT JOIN s ON s.company_id = k.id LEFT JOIN profiles p ON p.id = k.assigned_to
  ORDER BY public._status_rang(k.customer_type::text), k.name, k.visma_id;
END $$;

-- Alle P-enheder på CVR'et med dækning på tværs af konti i afdelingen
CREATE OR REPLACE FUNCTION public.cvr_penhed_oversigt(_cvr text, _afdeling_nr int)
RETURNS TABLE(p_number text, address text, zip text, city text, ansatte int, ansatte_interval text, status text,
  location_id uuid, visma_delivery_no text, company_id uuid, company_name text, customer_type text,
  saelger_navn text, oms_12m numeric, via_company_id uuid, via_company_name text, note text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _fra date := (date_trunc('month', now()) - interval '12 months')::date;
        _til date := date_trunc('month', now())::date;
BEGIN
  IF public.er_telemarketing() THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  IF NOT (_afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[])) THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  RETURN QUERY
  SELECT cp.p_number, cp.address, cp.zip, cp.city, COALESCE(cp.ansatte_praecis, cp.ansatte_estimat)::int, cp.ansatte_interval,
    CASE WHEN lk.kilde IN ('auto','manuel') THEN 'direkte' WHEN lk.kilde = 'indirekte' THEN 'indirekte' ELSE 'ikke' END,
    lk.location_id, COALESCE(lo.visma_delivery_no, lk.visma_delivery_no)::text,
    co.id, co.name::text, co.customer_type::text, COALESCE(ps.full_name, pa.full_name)::text,
    CASE WHEN co.id IS NOT NULL AND public._maa_se_kontosalg(co.id) THEN
      (SELECT COALESCE(sum(m.rev), 0) FROM sales_kunde_maaned m WHERE m.company_id = co.id AND m.period >= _fra AND m.period < _til) END,
    lk.via_company_id, vc.name::text, lk.note
  FROM cvr_penheder cp
  LEFT JOIN LATERAL (
    SELECT x.* FROM location_pnr_link x
    WHERE x.p_nummer = cp.p_number AND x.afdeling_nr = _afdeling_nr AND x.kilde <> 'afvist'
    ORDER BY CASE x.kilde WHEN 'manuel' THEN 1 WHEN 'auto' THEN 2 ELSE 3 END LIMIT 1
  ) lk ON true
  LEFT JOIN locations lo ON lo.id = lk.location_id
  LEFT JOIN companies co ON co.id = COALESCE(lo.company_id, lk.company_id) AND lk.kilde IN ('auto','manuel')
  LEFT JOIN profiles ps ON ps.id = lo.saelger_user_id
  LEFT JOIN profiles pa ON pa.id = co.assigned_to
  LEFT JOIN companies vc ON vc.id = lk.via_company_id
  WHERE cp.is_active AND cp.cvr = public.cvr_norm(_cvr)
  ORDER BY 7 DESC, COALESCE(cp.ansatte_praecis, cp.ansatte_estimat) DESC NULLS LAST;
END $$;

REVOKE ALL ON FUNCTION public.cvr_grupper() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cvr_gruppe_konti(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cvr_penhed_oversigt(text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._maa_se_kontosalg(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cvr_grupper() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cvr_gruppe_konti(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cvr_penhed_oversigt(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public._maa_se_kontosalg(uuid) TO authenticated;