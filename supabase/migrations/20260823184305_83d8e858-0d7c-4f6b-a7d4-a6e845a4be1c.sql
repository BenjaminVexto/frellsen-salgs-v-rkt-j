-- Adaptiv forbrugsbaseline, v2.
-- Beholder: vindue 4-15 (baseline) / 1-3 (aktuel), division med 12, kun komplette
-- måneder, security_invoker = on.
-- Nyt:
--  * 'ny': ingen aktivitet i den ældste halvdel af baseline-vinduet (rn 10-15).
--    Nye kunder har nul kg i starten af vinduet men tæller stadig i divisoren 12,
--    hvilket ellers gør dem til falsk "vaekst". De måles derfor ikke på afvigelse.
--  * 'afventer_rytme': ingen køb i de 3 aktuelle måneder, men det ligger stadig
--    inden for kundens egen normale købsrytme (forventet_interval_mdr).
--    'stoppet' kræver nu mindst 2 x eget interval (dog min. 3 mdr) uden køb.
drop view if exists public.forbrug_baseline;

create view public.forbrug_baseline as
with komplet as (
  select period, row_number() over (order by period desc) as rn
  from public.sales_period_completeness
  where er_komplet
),
nyeste as (
  select period as nyeste_periode from komplet where rn = 1
),
vindue as (
  select period, rn,
         case when rn <= 3 then 'aktuel' when rn between 4 and 15 then 'baseline' end as bucket
  from komplet where rn <= 15
),
grp as (
  select product_group_1 from public.produktgruppe_rolle where rolle = 'forbrug'
),
fakta as (
  select sm.company_id, sm.location_id, sm.product_group_1, sm.period, v.bucket, v.rn,
         sm.weight_kg / coalesce(nullif(si.saeson_indeks,0), 1.0) as kg_korr,
         sm.weight_kg, sm.order_count, sm.quantity, sm.revenue
  from public.sales_monthly sm
  join vindue v on v.period = sm.period and v.bucket is not null
  join grp g on g.product_group_1 = sm.product_group_1
  left join public.sales_season_index si
    on si.product_group_1 = sm.product_group_1
   and si.maaned = extract(month from sm.period)::int
   and si.komplette_maaneder_i_alt >= 6
   and si.saeson_indeks between 0.3 and 3.0
  where sm.company_id is not null
),
samlet as (
  select 'virksomhed'::text as niveau, company_id::text as enhed_id, company_id, null::uuid as location_id,
         product_group_1, period, bucket, rn, kg_korr, weight_kg, order_count, quantity
  from fakta
  union all
  select 'lokation', location_id::text, company_id, location_id,
         product_group_1, period, bucket, rn, kg_korr, weight_kg, order_count, quantity
  from fakta where location_id is not null
),
agg as (
  select niveau, enhed_id,
         max(company_id::text)::uuid as company_id,
         max(location_id::text)::uuid as location_id,
         product_group_1,
         sum(kg_korr) filter (where bucket='baseline') as base_kg,
         count(distinct period) filter (where bucket='baseline' and weight_kg > 0) as base_aktive_mdr,
         count(distinct period) filter (where bucket='baseline' and rn between 10 and 15 and weight_kg > 0) as base_tidlig_aktive_mdr,
         count(distinct period) filter (where bucket='baseline') as base_mdr_i_vindue,
         sum(kg_korr) filter (where bucket='aktuel') as akt_kg,
         sum(weight_kg) filter (where bucket='aktuel') as akt_kg_raa,
         count(distinct period) filter (where bucket='aktuel' and weight_kg > 0) as akt_aktive_mdr,
         max(period) filter (where weight_kg > 0) as sidste_koeb,
         sum(order_count) filter (where bucket='baseline') as base_ordrer,
         sum(order_count) filter (where bucket='aktuel') as akt_ordrer
  from samlet
  group by niveau, enhed_id, product_group_1
),
beregnet as (
  select a.*,
         a.base_kg / 12.0 as base_kg_pr_mdr,
         a.akt_kg / 3.0 as akt_kg_pr_mdr,
         round((12.0 / nullif(a.base_aktive_mdr,0))::numeric, 1) as forventet_interval_mdr,
         (extract(year from n.nyeste_periode) * 12 + extract(month from n.nyeste_periode))::int
           - (extract(year from a.sidste_koeb) * 12 + extract(month from a.sidste_koeb))::int as mdr_siden_sidste_koeb
  from agg a
  cross join nyeste n
  where a.base_aktive_mdr >= 4
    and a.base_kg / 12.0 >= 1.0
)
select b.*,
       round((100.0 * (b.akt_kg_pr_mdr - b.base_kg_pr_mdr) / nullif(b.base_kg_pr_mdr,0))::numeric, 1) as afvigelse_pct,
       case
         when coalesce(b.base_tidlig_aktive_mdr,0) = 0 then 'ny'
         when coalesce(b.akt_kg,0) = 0
              and coalesce(b.mdr_siden_sidste_koeb, 99) >= greatest(3, 2 * coalesce(b.forventet_interval_mdr,3)) then 'stoppet'
         when coalesce(b.akt_kg,0) = 0 then 'afventer_rytme'
         when b.akt_kg_pr_mdr <= 0.40 * b.base_kg_pr_mdr then 'kritisk'
         when b.akt_kg_pr_mdr <= 0.70 * b.base_kg_pr_mdr then 'markant_fald'
         when b.akt_kg_pr_mdr <= 0.90 * b.base_kg_pr_mdr then 'let_fald'
         when b.akt_kg_pr_mdr >= 1.20 * b.base_kg_pr_mdr then 'vaekst'
         else 'normal'
       end as klasse
from beregnet b;

alter view public.forbrug_baseline set (security_invoker = on);
grant select on public.forbrug_baseline to authenticated;