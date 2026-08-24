CREATE OR REPLACE VIEW public.forbrug_baseline AS
WITH komplet AS (
  SELECT period, row_number() OVER (ORDER BY period DESC) AS rn
  FROM public.sales_period_completeness
  WHERE er_komplet
), nyeste AS (
  SELECT period AS nyeste_periode FROM komplet WHERE rn = 1
), aktuel_p AS (
  SELECT period, rn FROM komplet WHERE rn <= 6
), vindue AS (
  SELECT period, rn, 'aktuel'::text AS bucket FROM aktuel_p
  UNION ALL
  SELECT (period - interval '1 year')::date AS period, rn + 12 AS rn, 'baseline'::text AS bucket FROM aktuel_p
), grp AS (
  SELECT product_group_1 FROM public.produktgruppe_rolle WHERE rolle = 'forbrug'
), fakta AS (
  SELECT sm.company_id, sm.location_id, sm.product_group_1, sm.period, v.bucket, v.rn,
         sm.weight_kg / COALESCE(NULLIF(si.saeson_indeks, 0::numeric), 1.0) AS kg_korr,
         sm.weight_kg, sm.order_count, sm.quantity, sm.revenue
  FROM public.sales_monthly sm
    JOIN vindue v ON v.period = sm.period
    JOIN grp g ON g.product_group_1 = sm.product_group_1
    LEFT JOIN public.sales_season_index si
      ON si.product_group_1 = sm.product_group_1
     AND si.maaned = EXTRACT(month FROM sm.period)::integer
     AND si.komplette_maaneder_i_alt >= 6::numeric
     AND si.saeson_indeks >= 0.3 AND si.saeson_indeks <= 3.0
  WHERE sm.company_id IS NOT NULL
), samlet AS (
  SELECT 'virksomhed'::text AS niveau, company_id::text AS enhed_id, company_id, NULL::uuid AS location_id,
         product_group_1, period, bucket, rn, kg_korr, weight_kg, order_count, quantity, revenue
  FROM fakta
  UNION ALL
  SELECT 'lokation'::text, location_id::text, company_id, location_id,
         product_group_1, period, bucket, rn, kg_korr, weight_kg, order_count, quantity, revenue
  FROM fakta WHERE location_id IS NOT NULL
), agg AS (
  SELECT niveau, enhed_id,
    max(company_id::text)::uuid AS company_id,
    max(location_id::text)::uuid AS location_id,
    product_group_1,
    sum(kg_korr) FILTER (WHERE bucket = 'baseline') AS base_kg,
    count(DISTINCT period) FILTER (WHERE bucket = 'baseline' AND weight_kg > 0) AS base_aktive_mdr,
    count(DISTINCT period) FILTER (WHERE bucket = 'baseline' AND rn >= 16 AND rn <= 18 AND weight_kg > 0) AS base_tidlig_aktive_mdr,
    count(DISTINCT period) FILTER (WHERE bucket = 'baseline') AS base_mdr_i_vindue,
    sum(kg_korr) FILTER (WHERE bucket = 'aktuel') AS akt_kg,
    sum(weight_kg) FILTER (WHERE bucket = 'aktuel') AS akt_kg_raa,
    count(DISTINCT period) FILTER (WHERE bucket = 'aktuel' AND weight_kg > 0) AS akt_aktive_mdr,
    max(period) FILTER (WHERE weight_kg > 0) AS sidste_koeb,
    sum(order_count) FILTER (WHERE bucket = 'baseline') AS base_ordrer,
    sum(order_count) FILTER (WHERE bucket = 'aktuel') AS akt_ordrer,
    sum(revenue) FILTER (WHERE bucket = 'baseline') AS base_omsaetning,
    sum(revenue) FILTER (WHERE bucket = 'aktuel') AS akt_omsaetning
  FROM samlet
  GROUP BY niveau, enhed_id, product_group_1
), beregnet AS (
  SELECT a.*,
    a.base_kg / 6.0 AS base_kg_pr_mdr,
    a.akt_kg / 6.0 AS akt_kg_pr_mdr,
    round(6.0 / NULLIF(a.base_aktive_mdr, 0)::numeric, 1) AS forventet_interval_mdr,
    (EXTRACT(year FROM n.nyeste_periode) * 12::numeric + EXTRACT(month FROM n.nyeste_periode))::integer
      - (EXTRACT(year FROM a.sidste_koeb) * 12::numeric + EXTRACT(month FROM a.sidste_koeb))::integer AS mdr_siden_sidste_koeb
  FROM agg a CROSS JOIN nyeste n
  WHERE a.base_aktive_mdr >= 2 AND (a.base_kg / 6.0) >= 1.0
), klassificeret AS (
  SELECT b.*,
    round(100.0 * (b.akt_kg_pr_mdr - b.base_kg_pr_mdr) / NULLIF(b.base_kg_pr_mdr, 0::numeric), 1) AS afvigelse_pct,
    CASE
      WHEN COALESCE(b.base_tidlig_aktive_mdr, 0::bigint) = 0 THEN 'ny'
      WHEN COALESCE(b.akt_kg, 0) = 0 AND COALESCE(b.mdr_siden_sidste_koeb, 99)::numeric >= GREATEST(3::numeric, 2::numeric * COALESCE(b.forventet_interval_mdr, 3::numeric)) THEN 'stoppet'
      WHEN COALESCE(b.akt_kg, 0) = 0 THEN 'afventer_rytme'
      WHEN b.akt_kg_pr_mdr <= (0.40 * b.base_kg_pr_mdr) THEN 'kritisk'
      WHEN b.akt_kg_pr_mdr <= (0.70 * b.base_kg_pr_mdr) THEN 'markant_fald'
      WHEN b.akt_kg_pr_mdr <= (0.90 * b.base_kg_pr_mdr) THEN 'let_fald'
      WHEN b.akt_kg_pr_mdr >= (1.20 * b.base_kg_pr_mdr) THEN 'vaekst'
      ELSE 'normal'
    END AS klasse
  FROM beregnet b
), maal AS (
  SELECT k.*,
    round(100.0 * (k.akt_ordrer::numeric / 6.0 - k.base_ordrer::numeric / 6.0) / NULLIF(k.base_ordrer::numeric / 6.0, 0::numeric), 0) AS ordre_aendring_pct_calc,
    round(100.0 * (k.akt_kg / NULLIF(k.akt_ordrer, 0)::numeric - k.base_kg / NULLIF(k.base_ordrer, 0)::numeric) / NULLIF(k.base_kg / NULLIF(k.base_ordrer, 0)::numeric, 0::numeric), 0) AS stk_aendring_pct_calc
  FROM klassificeret k
)
SELECT niveau, enhed_id, company_id, location_id, product_group_1,
  base_kg, base_aktive_mdr, base_tidlig_aktive_mdr, base_mdr_i_vindue,
  akt_kg, akt_kg_raa, akt_aktive_mdr, sidste_koeb, base_ordrer, akt_ordrer,
  base_kg_pr_mdr, akt_kg_pr_mdr, forventet_interval_mdr, mdr_siden_sidste_koeb,
  afvigelse_pct, klasse, base_omsaetning, akt_omsaetning,
  round(base_kg_pr_mdr - akt_kg_pr_mdr, 1) AS tabt_kg_pr_mdr,
  round(base_omsaetning / 6.0 - akt_omsaetning / 6.0, 0) AS tabt_kr_pr_mdr,
  base_ordrer::numeric / 6.0 AS base_ordrer_pr_mdr,
  akt_ordrer::numeric / 6.0 AS akt_ordrer_pr_mdr,
  base_kg / NULLIF(base_ordrer, 0)::numeric AS base_kg_pr_ordre,
  akt_kg / NULLIF(akt_ordrer, 0)::numeric AS akt_kg_pr_ordre,
  ordre_aendring_pct_calc AS ordre_aendring_pct,
  stk_aendring_pct_calc AS stk_aendring_pct,
  CASE
    WHEN klasse <> ALL (ARRAY['let_fald','markant_fald','kritisk','stoppet']) THEN NULL::text
    WHEN ordre_aendring_pct_calc <= -15 AND stk_aendring_pct_calc <= -15 THEN 'faerre_og_mindre'
    WHEN ordre_aendring_pct_calc <= -15 THEN 'faerre_ordrer'
    WHEN ordre_aendring_pct_calc >= 15 AND stk_aendring_pct_calc <= -15 THEN 'hyppigere_mindre'
    WHEN stk_aendring_pct_calc <= -15 THEN 'mindre_pr_ordre'
    ELSE 'uklar'
  END AS aarsag,
  (klasse = ANY (ARRAY['let_fald','markant_fald','kritisk','stoppet'])) AND round(base_kg_pr_mdr - akt_kg_pr_mdr, 1) >= 2.0 AS handling_paakraevet
FROM maal;