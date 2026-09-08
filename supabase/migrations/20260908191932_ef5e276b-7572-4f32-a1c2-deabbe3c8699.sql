-- 1) Nye kolonner på locations
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS zip_norm text
    GENERATED ALWAYS AS (nullif(regexp_replace(coalesce(zip, ''), '\D', '', 'g'), '')) STORED;

CREATE INDEX IF NOT EXISTS locations_region_idx ON public.locations (region);
CREATE INDEX IF NOT EXISTS locations_zip_norm_idx ON public.locations (zip_norm);

-- 2) Backfill
UPDATE public.locations l
SET region = public.region_for_postnr(l.zip)
WHERE l.region IS DISTINCT FROM public.region_for_postnr(l.zip);

-- 3) Hold region opdateret ved ændring af postnummer på lokationen
CREATE OR REPLACE FUNCTION public.locations_set_region()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.region := public.region_for_postnr(NEW.zip);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS locations_set_region_trg ON public.locations;
CREATE TRIGGER locations_set_region_trg
BEFORE INSERT OR UPDATE OF zip ON public.locations
FOR EACH ROW EXECUTE FUNCTION public.locations_set_region();

-- 4) Hold region opdateret når intervallerne redigeres
CREATE OR REPLACE FUNCTION public.postnummer_region_refresh_locations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.locations l
  SET region = public.region_for_postnr(l.zip)
  WHERE l.region IS DISTINCT FROM public.region_for_postnr(l.zip);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS postnummer_region_refresh_trg ON public.postnummer_region;
CREATE TRIGGER postnummer_region_refresh_trg
AFTER INSERT OR UPDATE OR DELETE ON public.postnummer_region
FOR EACH STATEMENT EXECUTE FUNCTION public.postnummer_region_refresh_locations();

-- 5) analyse_pivot uden funktionskald i den varme sti + paginering
DROP FUNCTION IF EXISTS public.analyse_pivot(date, date, text, integer, uuid[], text[], text[], text[], text);

CREATE OR REPLACE FUNCTION public.analyse_pivot(
  _fra date,
  _til date,
  _opdel text,
  _afdeling_nr integer,
  _saelger_ids uuid[] DEFAULT NULL::uuid[],
  _kundeprisgrupper text[] DEFAULT NULL::text[],
  _varegrupper text[] DEFAULT NULL::text[],
  _regioner text[] DEFAULT NULL::text[],
  _kg_gruppe text DEFAULT '2'::text,
  _limit integer DEFAULT 200,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  noegle text,
  navn text,
  omsaetning numeric,
  kg numeric,
  stk numeric,
  db numeric,
  antal_kunder integer,
  total_grupper integer,
  total_omsaetning numeric,
  total_kg numeric,
  total_stk numeric,
  total_db numeric,
  total_kunder integer
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  _brug_lok boolean := (_opdel IN ('region', 'postnummer') OR _regioner IS NOT NULL);
  _maa_db boolean := public.maa_se_db(auth.uid());
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT sm.company_id, sm.product_group_1, sm.revenue, sm.weight_kg, sm.quantity, sm.contribution,
           c.name AS c_navn, c.customer_category, c.assigned_to,
           l.zip_norm AS l_zip,
           nullif(btrim(coalesce(l.city, '')), '') AS l_city,
           coalesce(l.region, 'Ukendt') AS l_region
    FROM public.sales_monthly sm
    JOIN public.companies c ON c.id = sm.company_id
    LEFT JOIN public.locations l ON _brug_lok AND l.id = sm.location_id
    WHERE sm.afdeling_nr = _afdeling_nr
      AND sm.period >= date_trunc('month', _fra)::date
      AND sm.period <= date_trunc('month', _til)::date
      AND c.afloest_af_company_id IS NULL
      AND (_saelger_ids IS NULL OR c.assigned_to = ANY(_saelger_ids))
      AND (_kundeprisgrupper IS NULL OR coalesce(c.customer_category, '—') = ANY(_kundeprisgrupper))
      AND (_varegrupper IS NULL OR coalesce(sm.product_group_1, '—') = ANY(_varegrupper))
      AND (_regioner IS NULL OR coalesce(l.region, 'Ukendt') = ANY(_regioner))
  ), keyed AS (
    SELECT b.*, CASE _opdel
      WHEN 'kunde' THEN b.company_id::text
      WHEN 'varegruppe' THEN coalesce(b.product_group_1, '—')
      WHEN 'kundeprisgruppe' THEN coalesce(b.customer_category, '—')
      WHEN 'region' THEN b.l_region
      WHEN 'postnummer' THEN coalesce(b.l_zip, 'Ukendt')
      ELSE coalesce(b.assigned_to::text, '—')
    END AS k
    FROM base b
  ), agg AS (
    SELECT
      k2.k AS noegle,
      CASE _opdel
        WHEN 'kunde' THEN max(k2.c_navn)
        WHEN 'varegruppe' THEN coalesce(public.gruppe_navn(_afdeling_nr, k2.k), k2.k)
        WHEN 'kundeprisgruppe' THEN k2.k
        WHEN 'region' THEN k2.k
        WHEN 'postnummer' THEN CASE WHEN k2.k = 'Ukendt' THEN 'Ukendt'
          ELSE btrim(k2.k || ' ' || coalesce(max(k2.l_city), '')) END
        ELSE coalesce(public.saelger_navn(nullif(k2.k, '—')::uuid), 'Ingen sælger')
      END AS navn,
      coalesce(sum(k2.revenue), 0)::numeric AS omsaetning,
      coalesce(sum(k2.weight_kg) FILTER (
        WHERE _kg_gruppe IS NULL OR coalesce(k2.product_group_1, '—') = _kg_gruppe
      ), 0)::numeric AS kg,
      coalesce(sum(k2.quantity), 0)::numeric AS stk,
      CASE WHEN _maa_db THEN coalesce(sum(k2.contribution), 0)::numeric ELSE NULL END AS db,
      count(DISTINCT k2.company_id)::int AS antal_kunder
    FROM keyed k2
    GROUP BY k2.k
  )
  SELECT
    a.noegle,
    a.navn,
    a.omsaetning,
    a.kg,
    a.stk,
    a.db,
    a.antal_kunder,
    (count(*) OVER ())::int AS total_grupper,
    (sum(a.omsaetning) OVER ())::numeric AS total_omsaetning,
    (sum(a.kg) OVER ())::numeric AS total_kg,
    (sum(a.stk) OVER ())::numeric AS total_stk,
    CASE WHEN _maa_db THEN (sum(a.db) OVER ())::numeric ELSE NULL END AS total_db,
    (SELECT count(DISTINCT b2.company_id)::int FROM base b2) AS total_kunder
  FROM agg a
  ORDER BY a.omsaetning DESC
  OFFSET greatest(coalesce(_offset, 0), 0)
  LIMIT CASE WHEN _limit IS NULL OR _limit <= 0 THEN NULL ELSE _limit END;
END;
$function$;
