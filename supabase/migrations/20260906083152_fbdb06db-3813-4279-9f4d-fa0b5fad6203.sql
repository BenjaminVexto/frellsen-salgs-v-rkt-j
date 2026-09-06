DROP FUNCTION IF EXISTS public.dublet_kandidater();

CREATE OR REPLACE FUNCTION public.dublet_kandidater()
RETURNS TABLE(
  cvr text,
  lighed numeric,
  samme_postnr boolean,
  samme_adresse boolean,
  dead_id uuid,
  dead_name text,
  dead_visma_id text,
  dead_afdeling_nr integer,
  dead_created_in_visma date,
  dead_zip text,
  dead_address text,
  dead_visma_enhed text,
  dead_binding_status text,
  dead_afvist_at timestamptz,
  dead_afloest_af_company_id uuid,
  alive_id uuid,
  alive_name text,
  alive_visma_id text,
  alive_afdeling_nr integer,
  alive_created_in_visma date,
  alive_zip text,
  alive_address text,
  alive_visma_enhed text,
  alive_last_varekoeb date,
  alive_turnover_12m numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dead AS (
    SELECT c.id, c.name, c.cvr, c.visma_id, c.afdeling_nr, c.created_in_visma,
           c.zip, c.address, c.visma_enhed, c.binding_status, c.dublet_afvist_at,
           c.afloest_af_company_id,
           public.dublet_navn_norm(c.name) AS nn
    FROM public.companies c
    WHERE c.cvr IS NOT NULL AND btrim(c.cvr) <> ''
      AND c.last_purchase_date IS NULL
      AND c.last_sales_date IS NULL
      AND c.has_active_equipment IS NOT TRUE
  ),
  alive AS (
    SELECT c.id, c.name, c.cvr, c.visma_id, c.afdeling_nr, c.created_in_visma,
           c.zip, c.address, c.visma_enhed, c.last_purchase_date, c.last_sales_date,
           c.turnover_12m,
           public.dublet_navn_norm(c.name) AS nn
    FROM public.companies c
    WHERE c.cvr IS NOT NULL AND btrim(c.cvr) <> ''
      AND (c.last_purchase_date IS NOT NULL
           OR c.last_sales_date IS NOT NULL
           OR c.has_active_equipment IS TRUE)
  )
  SELECT DISTINCT ON (d.id)
    btrim(d.cvr),
    round(similarity(d.nn, a.nn)::numeric, 3),
    (d.zip IS NOT NULL AND d.zip = a.zip),
    (public.addr_base(d.address) IS NOT NULL
      AND public.addr_base(d.address) <> ''
      AND public.addr_base(d.address) = public.addr_base(a.address)),
    d.id, d.name, d.visma_id, d.afdeling_nr, d.created_in_visma, d.zip,
    d.address, d.visma_enhed,
    d.binding_status, d.dublet_afvist_at, d.afloest_af_company_id,
    a.id, a.name, a.visma_id, a.afdeling_nr, a.created_in_visma, a.zip,
    a.address, a.visma_enhed,
    GREATEST(a.last_sales_date, a.last_purchase_date),
    a.turnover_12m
  FROM dead d
  JOIN alive a
    ON btrim(a.cvr) = btrim(d.cvr)
   AND a.id <> d.id
   AND similarity(d.nn, a.nn) >= 0.6
  ORDER BY d.id, similarity(d.nn, a.nn) DESC, a.last_purchase_date DESC NULLS LAST
$$;

REVOKE ALL ON FUNCTION public.dublet_kandidater() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dublet_kandidater() TO service_role;