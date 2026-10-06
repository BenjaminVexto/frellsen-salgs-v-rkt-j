ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS customer_type public.customer_type,
  ADD COLUMN IF NOT EXISTS sidste_forbrugskoeb date,
  ADD COLUMN IF NOT EXISTS rytme_koebsmaaneder integer,
  ADD COLUMN IF NOT EXISTS rytme_interval_mdr numeric,
  ADD COLUMN IF NOT EXISTS naeste_koeb_forventet date,
  ADD COLUMN IF NOT EXISTS over_rytme boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS koeber_paa_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS rytme_koebsmaaneder integer,
  ADD COLUMN IF NOT EXISTS rytme_interval_mdr numeric,
  ADD COLUMN IF NOT EXISTS naeste_koeb_forventet date,
  ADD COLUMN IF NOT EXISTS over_rytme boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS koeber_paa_konto text,
  ADD COLUMN IF NOT EXISTS koeber_paa_company_id uuid;

COMMENT ON COLUMN public.locations.customer_type IS 'Kundestatus for lokationen alene, inkl. købsrytme. Virksomhedens status = bedste af lokationerne.';
COMMENT ON COLUMN public.locations.koeber_paa_location_id IS 'Aktiv søsterkonto med samme CVR, afdeling og adresse (eller postnr.), når denne lokation er sovende.';

CREATE OR REPLACE FUNCTION public.kundestatus_rang(_t public.customer_type)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE _t WHEN 'aktiv_kunde' THEN 1 WHEN 'sovende_kunde' THEN 2 WHEN 'servicekunde' THEN 3
                 WHEN 'tidligere_kunde' THEN 4 WHEN 'nyt_emne' THEN 5 ELSE 9 END
$$;

-- Aktiv-grænse i dage: max(3 mdr, 1,5 x eget interval) når der er en etableret rytme (>= 3 købsmåneder).
CREATE OR REPLACE FUNCTION public.rytme_graense_dage(_koebsmaaneder integer, _interval numeric)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN coalesce(_koebsmaaneder,0) >= 3 AND _interval IS NOT NULL
              THEN greatest(90, round(1.5 * _interval * 30.44)::int) ELSE 90 END
$$;

CREATE OR REPLACE FUNCTION public.kunde_rytme_genberegn(_company_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _fg text[] := public.maalepunkt_forbrug_grupper(); _ref date := public.seneste_fakturadato(); n int;
BEGIN
  PERFORM set_config('app.skm_skip', 'on', true);

  -- 1) Lokationer
  WITH lok AS (
    SELECT l.id, l.visma_delivery_no FROM public.locations l
    WHERE _company_ids IS NULL OR l.company_id = ANY(_company_ids)
  ), fbm AS (
    SELECT sm.location_id, date_trunc('month', sm.period)::date AS m,
           max(coalesce(sm.last_invoice_date, sm.period)) AS d
    FROM public.sales_monthly sm JOIN lok ON lok.id = sm.location_id
    WHERE coalesce(sm.revenue,0) > 0
      AND substring(btrim(coalesce(sm.product_group_1,'')) FROM '^(\d+)') = ANY(_fg)
      AND sm.period >= (date_trunc('month', _ref) - interval '24 months')::date
    GROUP BY 1, 2
  ), ry AS (
    SELECT location_id, count(*)::int AS n, max(d) AS sidste,
           CASE WHEN count(*) >= 3 THEN
             ((extract(year from age(max(m), min(m)))*12 + extract(month from age(max(m), min(m))))::numeric / (count(*) - 1))
           END AS iv
    FROM fbm GROUP BY 1
  ), la AS (
    SELECT sm.location_id, max(coalesce(sm.last_invoice_date, sm.period)) AS d
    FROM public.sales_monthly sm JOIN lok ON lok.id = sm.location_id
    WHERE coalesce(sm.revenue,0) > 0 OR coalesce(sm.quantity,0) > 0 OR coalesce(sm.order_count,0) > 0
    GROUP BY 1
  ), eqm AS (
    SELECT DISTINCT u.location_id FROM public.location_equipment_units u JOIN lok ON lok.id = u.location_id
    WHERE NOT coalesce(u.is_filter, false)
  ), beregnet AS (
    SELECT lok.id, ry.n, ry.iv, ry.sidste, la.d AS la, (eqm.location_id IS NOT NULL) AS eq,
           lok.visma_delivery_no IS NOT NULL AS hv,
           public.rytme_graense_dage(ry.n, ry.iv) AS g
    FROM lok LEFT JOIN ry ON ry.location_id = lok.id
    LEFT JOIN la ON la.location_id = lok.id
    LEFT JOIN eqm ON eqm.location_id = lok.id
  )
  UPDATE public.locations l SET
    sidste_forbrugskoeb = b.sidste,
    rytme_koebsmaaneder = b.n,
    rytme_interval_mdr = CASE WHEN b.n >= 3 THEN round(b.iv, 2) END,
    naeste_koeb_forventet = CASE WHEN b.n >= 3 AND b.sidste IS NOT NULL
      THEN (b.sidste + make_interval(days => round(b.iv * 30.44)::int))::date END,
    over_rytme = (b.n >= 3 AND b.sidste IS NOT NULL
      AND b.sidste < _ref - greatest(90, round(b.iv * 30.44)::int)
      AND b.sidste >= _ref - b.g),
    customer_type = CASE
      WHEN b.sidste IS NOT NULL AND b.sidste >= _ref - b.g THEN 'aktiv_kunde'::public.customer_type
      WHEN b.la IS NULL AND b.sidste IS NULL AND NOT b.eq THEN NULL
      ELSE public.kundestatus_dage(b.sidste, b.la, b.eq, b.hv, _ref) END
  FROM beregnet b WHERE l.id = b.id;

  -- 2) Virksomheder: rytme på hele virksomheden; status = bedste af (lokationer, virksomhedens grundstatus)
  WITH co AS (
    SELECT c.id FROM public.companies c WHERE _company_ids IS NULL OR c.id = ANY(_company_ids)
  ), fbm AS (
    SELECT sm.company_id, date_trunc('month', sm.period)::date AS m,
           max(coalesce(sm.last_invoice_date, sm.period)) AS d
    FROM public.sales_monthly sm JOIN co ON co.id = sm.company_id
    WHERE coalesce(sm.revenue,0) > 0
      AND substring(btrim(coalesce(sm.product_group_1,'')) FROM '^(\d+)') = ANY(_fg)
      AND sm.period >= (date_trunc('month', _ref) - interval '24 months')::date
    GROUP BY 1, 2
  ), ry AS (
    SELECT company_id, count(*)::int AS n, max(d) AS sidste,
           CASE WHEN count(*) >= 3 THEN
             ((extract(year from age(max(m), min(m)))*12 + extract(month from age(max(m), min(m))))::numeric / (count(*) - 1))
           END AS iv
    FROM fbm GROUP BY 1
  ), bedste AS (
    SELECT l.company_id, min(public.kundestatus_rang(l.customer_type)) AS r
    FROM public.locations l JOIN co ON co.id = l.company_id
    WHERE l.customer_type IS NOT NULL GROUP BY 1
  ), beregnet AS (
    SELECT co.id, ry.n, ry.iv, ry.sidste, public.rytme_graense_dage(ry.n, ry.iv) AS g, bedste.r AS lok_r
    FROM co LEFT JOIN ry ON ry.company_id = co.id LEFT JOIN bedste ON bedste.company_id = co.id
  )
  UPDATE public.companies c SET
    rytme_koebsmaaneder = b.n,
    rytme_interval_mdr = CASE WHEN b.n >= 3 THEN round(b.iv, 2) END,
    naeste_koeb_forventet = CASE WHEN b.n >= 3 AND b.sidste IS NOT NULL
      THEN (b.sidste + make_interval(days => round(b.iv * 30.44)::int))::date END,
    over_rytme = (b.n >= 3 AND b.sidste IS NOT NULL
      AND b.sidste < _ref - greatest(90, round(b.iv * 30.44)::int)
      AND b.sidste >= _ref - b.g),
    customer_type = (
      SELECT t FROM (VALUES
        (c.customer_type),
        (CASE WHEN b.sidste IS NOT NULL AND b.sidste >= _ref - b.g THEN 'aktiv_kunde'::public.customer_type END),
        (CASE b.lok_r WHEN 1 THEN 'aktiv_kunde'::public.customer_type WHEN 2 THEN 'sovende_kunde'::public.customer_type
           WHEN 3 THEN 'servicekunde'::public.customer_type WHEN 4 THEN 'tidligere_kunde'::public.customer_type END)
      ) v(t) WHERE t IS NOT NULL ORDER BY public.kundestatus_rang(t) LIMIT 1)
  FROM beregnet b WHERE c.id = b.id;

  -- 3) Søsterkonti: sovende lokation med aktiv lokation på samme CVR, afdeling og adresse (eller postnr. når adressen mangler)
  UPDATE public.locations l SET koeber_paa_location_id = NULL
  WHERE koeber_paa_location_id IS NOT NULL AND (_company_ids IS NULL OR l.company_id = ANY(_company_ids));

  WITH kand AS (
    SELECT DISTINCT ON (l.id) l.id, s.id AS sid
    FROM public.locations l
    JOIN public.companies c ON c.id = l.company_id
    JOIN public.companies cs ON cs.cvr = c.cvr AND cs.afloest_af_company_id IS NULL
    JOIN public.locations s ON s.company_id = cs.id AND s.id <> l.id
    WHERE l.customer_type = 'sovende_kunde' AND s.customer_type = 'aktiv_kunde'
      AND c.cvr IS NOT NULL AND c.cvr ~ '^\d{8}$'
      AND s.afdeling_nr = l.afdeling_nr
      AND s.zip_norm = l.zip_norm
      AND (
        (nullif(btrim(coalesce(l.address,'')),'') IS NULL OR nullif(btrim(coalesce(s.address,'')),'') IS NULL)
        OR (public.addr_vej(l.address) = public.addr_vej(s.address)
            AND coalesce(public.addr_husnr(l.address),'') = coalesce(public.addr_husnr(s.address),''))
      )
      AND (_company_ids IS NULL OR l.company_id = ANY(_company_ids) OR s.company_id = ANY(_company_ids))
    ORDER BY l.id, s.sidste_forbrugskoeb DESC NULLS LAST
  )
  UPDATE public.locations l SET koeber_paa_location_id = k.sid FROM kand k WHERE l.id = k.id;

  -- Virksomhed markeres, når den er sovende og en af dens sovende lokationer køber på en søsterkonto
  UPDATE public.companies c SET koeber_paa_konto = x.konto, koeber_paa_company_id = x.cid
  FROM (
    SELECT c2.id,
      (SELECT s.visma_delivery_no FROM public.locations l JOIN public.locations s ON s.id = l.koeber_paa_location_id
        WHERE l.company_id = c2.id AND c2.customer_type = 'sovende_kunde' AND s.company_id <> c2.id
        ORDER BY s.sidste_forbrugskoeb DESC NULLS LAST LIMIT 1) AS konto,
      (SELECT s.company_id FROM public.locations l JOIN public.locations s ON s.id = l.koeber_paa_location_id
        WHERE l.company_id = c2.id AND c2.customer_type = 'sovende_kunde' AND s.company_id <> c2.id
        ORDER BY s.sidste_forbrugskoeb DESC NULLS LAST LIMIT 1) AS cid
    FROM public.companies c2
    WHERE _company_ids IS NULL OR c2.id = ANY(_company_ids)
       OR c2.cvr IN (SELECT cvr FROM public.companies WHERE id = ANY(_company_ids))
  ) x
  WHERE c.id = x.id AND (c.koeber_paa_konto IS DISTINCT FROM x.konto OR c.koeber_paa_company_id IS DISTINCT FROM x.cid);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.kunde_rytme_genberegn(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kunde_rytme_genberegn(uuid[]) TO service_role;

-- Admin-liste over søsterkonti-par
CREATE OR REPLACE FUNCTION public.soesterkonti_par()
RETURNS TABLE(afdeling_nr int, cvr text, sovende_company_id uuid, sovende_navn text, sovende_konto text, sovende_adresse text,
              sovende_sidste_koeb date, aktiv_company_id uuid, aktiv_navn text, aktiv_konto text, aktiv_adresse text,
              aktiv_sidste_koeb date, samme_virksomhed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT l.afdeling_nr, c.cvr, c.id, c.name, l.visma_delivery_no,
         concat_ws(', ', l.address, concat_ws(' ', l.zip, l.city)), l.sidste_forbrugskoeb,
         cs.id, cs.name, s.visma_delivery_no,
         concat_ws(', ', s.address, concat_ws(' ', s.zip, s.city)), s.sidste_forbrugskoeb,
         c.id = cs.id
  FROM public.locations l
  JOIN public.locations s ON s.id = l.koeber_paa_location_id
  JOIN public.companies c ON c.id = l.company_id
  JOIN public.companies cs ON cs.id = s.company_id
  WHERE (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'salgssupport'))
    AND l.afdeling_nr = ANY (public.my_afdelinger())
  ORDER BY l.afdeling_nr, c.name
$$;
GRANT EXECUTE ON FUNCTION public.soesterkonti_par() TO authenticated;