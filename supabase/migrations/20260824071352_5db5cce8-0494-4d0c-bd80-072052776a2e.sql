CREATE OR REPLACE VIEW public.forbrug_signal_virksomhed
WITH (security_invoker = on) AS
WITH pr_gruppe AS (
  SELECT
    fb.company_id,
    fb.afdeling_nr,
    fb.product_group_1,
    fb.klasse,
    fb.aarsag,
    fb.afvigelse_pct,
    fb.base_kg_pr_mdr,
    fb.akt_kg_pr_mdr,
    fb.tabt_kg_pr_mdr,
    fb.tabt_kr_pr_mdr,
    fb.handling_paakraevet,
    fb.forventet_interval_mdr,
    fb.mdr_siden_sidste_koeb,
    fb.sidste_koeb,
    pr.er_primaer
  FROM public.forbrug_signal_seneste fb
  JOIN public.produktgruppe_rolle pr
    ON pr.product_group_1 = fb.product_group_1
  WHERE fb.niveau = 'virksomhed'
),
alvor AS (
  SELECT * FROM (VALUES
    ('vaekst',0),('normal',1),('ny',1),('afventer_rytme',2),
    ('let_fald',3),('markant_fald',4),('kritisk',5),('stoppet',6)
  ) AS t(klasse, score)
),
rollup AS (
  SELECT
    g.company_id,
    g.afdeling_nr,
    max(g.klasse) FILTER (WHERE g.er_primaer) AS klasse_primaer,
    max(g.aarsag) FILTER (WHERE g.er_primaer) AS aarsag_primaer,
    round(max(g.afvigelse_pct) FILTER (WHERE g.er_primaer), 1) AS afvigelse_pct_primaer,
    round(max(g.base_kg_pr_mdr) FILTER (WHERE g.er_primaer), 1) AS base_kg_primaer,
    round(max(g.akt_kg_pr_mdr) FILTER (WHERE g.er_primaer), 1) AS akt_kg_primaer,
    max(g.sidste_koeb) FILTER (WHERE g.er_primaer) AS sidste_koeb_primaer,
    round(sum(g.tabt_kg_pr_mdr) FILTER (WHERE g.handling_paakraevet), 1) AS tabt_kg_pr_mdr,
    round(sum(g.tabt_kr_pr_mdr) FILTER (WHERE g.handling_paakraevet), 0) AS tabt_kr_pr_mdr,
    count(*) FILTER (WHERE g.handling_paakraevet) AS grupper_i_fald,
    count(*) AS grupper_i_alt,
    bool_or(g.handling_paakraevet) AS handling_paakraevet,
    max(a.score) FILTER (WHERE g.handling_paakraevet) AS vaerste_score,
    max(g.mdr_siden_sidste_koeb) FILTER (WHERE g.er_primaer) AS mdr_siden_sidste_koeb_primaer,
    max(g.forventet_interval_mdr) FILTER (WHERE g.er_primaer) AS forventet_interval_mdr_primaer
  FROM pr_gruppe g
  LEFT JOIN alvor a ON a.klasse = g.klasse
  GROUP BY g.company_id, g.afdeling_nr
)
SELECT
  r.company_id,
  r.afdeling_nr,
  c.assigned_to,
  r.klasse_primaer,
  r.aarsag_primaer,
  r.afvigelse_pct_primaer,
  r.base_kg_primaer,
  r.akt_kg_primaer,
  r.sidste_koeb_primaer,
  r.tabt_kg_pr_mdr,
  r.tabt_kr_pr_mdr,
  r.grupper_i_fald,
  r.grupper_i_alt,
  r.handling_paakraevet,
  r.vaerste_score,
  r.mdr_siden_sidste_koeb_primaer,
  r.forventet_interval_mdr_primaer
FROM rollup r
JOIN public.companies c ON c.id = r.company_id;

REVOKE ALL ON public.forbrug_signal_virksomhed FROM anon;
GRANT SELECT ON public.forbrug_signal_virksomhed TO authenticated, service_role;