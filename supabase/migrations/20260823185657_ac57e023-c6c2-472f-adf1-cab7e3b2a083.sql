-- Forbrugsbaseline: udvidelse med omsætning, absolut tab, årsags-nedbrydning
-- og væsentlighedsflag. Bragt i trit med den definition der kører i databasen.
-- Idempotent (create or replace view).
--
-- Årsagskategorier (rækkefølgen er betydende):
--   faerre_og_mindre  = både færre ordrer og mindre pr. ordre — reel afgang.
--   faerre_ordrer     = kunden strækker lageret / bestiller sjældnere.
--   hyppigere_mindre  = kunden er gået over til hyppigere, mindre leveringer.
--                       Samlet forbrug falder alligevel — undersøg om det er
--                       lagerpolitik hos kunden, eller om en konkurrent dækker
--                       toppen af behovet.
--   mindre_pr_ordre   = færre medarbejdere eller sortiment overtaget.
--   uklar             = fald uden tydeligt ordremønster.

create or replace view public.forbrug_baseline as
with komplet as (
  select
    period,
    row_number() over (order by period desc) as rn
  from public.sales_period_completeness
  where er_komplet
), nyeste as (
  select period as nyeste_periode
  from komplet
  where rn = 1
), vindue as (
  select
    period,
    rn,
    case
      when rn <= 3 then 'aktuel'
      when rn >= 4 and rn <= 15 then 'baseline'
      else null
    end as bucket
  from komplet
  where rn <= 15
), grp as (
  select product_group_1
  from public.produktgruppe_rolle
  where rolle = 'forbrug'
), fakta as (
  select
    sm.company_id,
    sm.location_id,
    sm.product_group_1,
    sm.period,
    v.bucket,
    v.rn,
    sm.weight_kg / coalesce(nullif(si.saeson_indeks, 0::numeric), 1.0) as kg_korr,
    sm.weight_kg,
    sm.order_count,
    sm.quantity,
    sm.revenue
  from public.sales_monthly sm
  join vindue v on v.period = sm.period and v.bucket is not null
  join grp g on g.product_group_1 = sm.product_group_1
  left join public.sales_season_index si
    on si.product_group_1 = sm.product_group_1
   and si.maaned = extract(month from sm.period)::integer
   and si.komplette_maaneder_i_alt >= 6::numeric
   and si.saeson_indeks >= 0.3
   and si.saeson_indeks <= 3.0
  where sm.company_id is not null
), samlet as (
  select
    'virksomhed'::text as niveau,
    company_id::text as enhed_id,
    company_id,
    null::uuid as location_id,
    product_group_1,
    period,
    bucket,
    rn,
    kg_korr,
    weight_kg,
    order_count,
    quantity,
    revenue
  from fakta
  union all
  select
    'lokation'::text,
    location_id::text,
    company_id,
    location_id,
    product_group_1,
    period,
    bucket,
    rn,
    kg_korr,
    weight_kg,
    order_count,
    quantity,
    revenue
  from fakta
  where location_id is not null
), agg as (
  select
    niveau,
    enhed_id,
    max(company_id::text)::uuid as company_id,
    max(location_id::text)::uuid as location_id,
    product_group_1,
    sum(kg_korr) filter (where bucket = 'baseline') as base_kg,
    count(distinct period) filter (where bucket = 'baseline' and weight_kg > 0) as base_aktive_mdr,
    count(distinct period) filter (where bucket = 'baseline' and rn >= 10 and rn <= 15 and weight_kg > 0) as base_tidlig_aktive_mdr,
    count(distinct period) filter (where bucket = 'baseline') as base_mdr_i_vindue,
    sum(kg_korr) filter (where bucket = 'aktuel') as akt_kg,
    sum(weight_kg) filter (where bucket = 'aktuel') as akt_kg_raa,
    count(distinct period) filter (where bucket = 'aktuel' and weight_kg > 0) as akt_aktive_mdr,
    max(period) filter (where weight_kg > 0) as sidste_koeb,
    sum(order_count) filter (where bucket = 'baseline') as base_ordrer,
    sum(order_count) filter (where bucket = 'aktuel') as akt_ordrer,
    sum(revenue) filter (where bucket = 'baseline') as base_omsaetning,
    sum(revenue) filter (where bucket = 'aktuel') as akt_omsaetning
  from samlet
  group by niveau, enhed_id, product_group_1
), beregnet as (
  select
    a.niveau,
    a.enhed_id,
    a.company_id,
    a.location_id,
    a.product_group_1,
    a.base_kg,
    a.base_aktive_mdr,
    a.base_tidlig_aktive_mdr,
    a.base_mdr_i_vindue,
    a.akt_kg,
    a.akt_kg_raa,
    a.akt_aktive_mdr,
    a.sidste_koeb,
    a.base_ordrer,
    a.akt_ordrer,
    a.base_omsaetning,
    a.akt_omsaetning,
    a.base_kg / 12.0 as base_kg_pr_mdr,
    a.akt_kg / 3.0 as akt_kg_pr_mdr,
    round(12.0 / nullif(a.base_aktive_mdr, 0)::numeric, 1) as forventet_interval_mdr,
    (extract(year from n.nyeste_periode) * 12 + extract(month from n.nyeste_periode))::integer
      - (extract(year from a.sidste_koeb) * 12 + extract(month from a.sidste_koeb))::integer as mdr_siden_sidste_koeb
  from agg a
  cross join nyeste n
  where a.base_aktive_mdr >= 4
    and (a.base_kg / 12.0) >= 1.0
), klassificeret as (
  select
    b.niveau,
    b.enhed_id,
    b.company_id,
    b.location_id,
    b.product_group_1,
    b.base_kg,
    b.base_aktive_mdr,
    b.base_tidlig_aktive_mdr,
    b.base_mdr_i_vindue,
    b.akt_kg,
    b.akt_kg_raa,
    b.akt_aktive_mdr,
    b.sidste_koeb,
    b.base_ordrer,
    b.akt_ordrer,
    b.base_omsaetning,
    b.akt_omsaetning,
    b.base_kg_pr_mdr,
    b.akt_kg_pr_mdr,
    b.forventet_interval_mdr,
    b.mdr_siden_sidste_koeb,
    round(100.0 * (b.akt_kg_pr_mdr - b.base_kg_pr_mdr) / nullif(b.base_kg_pr_mdr, 0), 1) as afvigelse_pct,
    case
      when coalesce(b.base_tidlig_aktive_mdr, 0) = 0 then 'ny'
      when coalesce(b.akt_kg, 0) = 0
       and coalesce(b.mdr_siden_sidste_koeb, 99)::numeric >= greatest(3::numeric, 2::numeric * coalesce(b.forventet_interval_mdr, 3::numeric)) then 'stoppet'
      when coalesce(b.akt_kg, 0) = 0 then 'afventer_rytme'
      when b.akt_kg_pr_mdr <= (0.40 * b.base_kg_pr_mdr) then 'kritisk'
      when b.akt_kg_pr_mdr <= (0.70 * b.base_kg_pr_mdr) then 'markant_fald'
      when b.akt_kg_pr_mdr <= (0.90 * b.base_kg_pr_mdr) then 'let_fald'
      when b.akt_kg_pr_mdr >= (1.20 * b.base_kg_pr_mdr) then 'vaekst'
      else 'normal'
    end as klasse
  from beregnet b
), maal as (
  select
    k.*,
    round(100.0 * (k.akt_ordrer::numeric / 3.0 - k.base_ordrer::numeric / 12.0)
      / nullif(k.base_ordrer::numeric / 12.0, 0), 0) as ordre_aendring_pct_calc,
    round(100.0 * (k.akt_kg / nullif(k.akt_ordrer, 0)::numeric - k.base_kg / nullif(k.base_ordrer, 0)::numeric)
      / nullif(k.base_kg / nullif(k.base_ordrer, 0)::numeric, 0), 0) as stk_aendring_pct_calc
  from klassificeret k
)
select
  niveau,
  enhed_id,
  company_id,
  location_id,
  product_group_1,
  base_kg,
  base_aktive_mdr,
  base_tidlig_aktive_mdr,
  base_mdr_i_vindue,
  akt_kg,
  akt_kg_raa,
  akt_aktive_mdr,
  sidste_koeb,
  base_ordrer,
  akt_ordrer,
  base_kg_pr_mdr,
  akt_kg_pr_mdr,
  forventet_interval_mdr,
  mdr_siden_sidste_koeb,
  afvigelse_pct,
  klasse,
  base_omsaetning,
  akt_omsaetning,
  round(base_kg_pr_mdr - akt_kg_pr_mdr, 1) as tabt_kg_pr_mdr,
  round(base_omsaetning / 12.0 - akt_omsaetning / 3.0, 0) as tabt_kr_pr_mdr,
  base_ordrer::numeric / 12.0 as base_ordrer_pr_mdr,
  akt_ordrer::numeric / 3.0 as akt_ordrer_pr_mdr,
  base_kg / nullif(base_ordrer, 0)::numeric as base_kg_pr_ordre,
  akt_kg / nullif(akt_ordrer, 0)::numeric as akt_kg_pr_ordre,
  ordre_aendring_pct_calc as ordre_aendring_pct,
  stk_aendring_pct_calc as stk_aendring_pct,
  case
    when klasse <> all (array['let_fald', 'markant_fald', 'kritisk', 'stoppet']) then null::text
    when ordre_aendring_pct_calc <= -15 and stk_aendring_pct_calc <= -15 then 'faerre_og_mindre'
    when ordre_aendring_pct_calc <= -15 then 'faerre_ordrer'
    when ordre_aendring_pct_calc >= 15 and stk_aendring_pct_calc <= -15 then 'hyppigere_mindre'
    when stk_aendring_pct_calc <= -15 then 'mindre_pr_ordre'
    else 'uklar'
  end as aarsag,
  (klasse = any (array['let_fald', 'markant_fald', 'kritisk', 'stoppet']))
    and round(base_kg_pr_mdr - akt_kg_pr_mdr, 1) >= 2.0 as handling_paakraevet
from maal;

alter view public.forbrug_baseline set (security_invoker = on);