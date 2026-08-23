-- Rul security_invoker tilbage på de to kalibrerings-views.
-- Begrundelse: sales_period_completeness og sales_season_index er GLOBALE
-- kalibreringstal, ikke kundedata. De indeholder kun periode, antal lokationer,
-- kg-totaler og sæsonindeks — ingen kundeidentitet. De SKAL beregnes på hele
-- kundebasen: ellers får to sælgere forskellige svar på om en måned er komplet,
-- og sæsonindekset beregnes på hver sælgers egen delmængde. Linter-advarslen
-- "security definer view" er derfor bevidst accepteret for netop disse to views.
alter view public.sales_period_completeness set (security_invoker = off);
alter view public.sales_season_index set (security_invoker = off);

-- Adaptiv forbrugsbaseline.
-- Designvalg (bevidste, må ikke "optimeres" væk):
--  * Baseline = måned 4-15 tilbage, aktuel = måned 1-3. Baseline ekskluderer de
--    seneste 3 måneder, så et aktuelt fald ikke udvander sit eget grundlag.
--  * Der divideres med 12 (måneder i vinduet), IKKE med antal aktive måneder:
--    en kunde der bestiller hver 3. måned skal have sit gennemsnitlige
--    månedsforbrug, ikke sit ordregennemsnit.
--  * Kun komplette måneder indgår, så delvist indlæste måneder er automatisk ude.
--  * Modsat de to views ovenfor indeholder denne view KUNDEDATA og skal derfor
--    have security_invoker = on, så afdelings-RLS respekteres.
create or replace view public.forbrug_baseline as
with komplet as (
  select period, row_number() over (order by period desc) as rn
  from public.sales_period_completeness
  where er_komplet
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
  select sm.company_id, sm.location_id, sm.product_group_1, sm.period, v.bucket,
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
         product_group_1, period, bucket, kg_korr, weight_kg, order_count, quantity
  from fakta
  union all
  select 'lokation', location_id::text, company_id, location_id,
         product_group_1, period, bucket, kg_korr, weight_kg, order_count, quantity
  from fakta where location_id is not null
),
agg as (
  select niveau, enhed_id,
         max(company_id::text)::uuid as company_id,
         max(location_id::text)::uuid as location_id,
         product_group_1,
         sum(kg_korr) filter (where bucket='baseline') as base_kg,
         count(distinct period) filter (where bucket='baseline' and weight_kg > 0) as base_aktive_mdr,
         count(distinct period) filter (where bucket='baseline') as base_mdr_i_vindue,
         sum(kg_korr) filter (where bucket='aktuel') as akt_kg,
         sum(weight_kg) filter (where bucket='aktuel') as akt_kg_raa,
         count(distinct period) filter (where bucket='aktuel' and weight_kg > 0) as akt_aktive_mdr,
         sum(order_count) filter (where bucket='baseline') as base_ordrer,
         sum(order_count) filter (where bucket='aktuel') as akt_ordrer
  from samlet
  group by niveau, enhed_id, product_group_1
),
beregnet as (
  select a.*,
         a.base_kg / 12.0 as base_kg_pr_mdr,
         a.akt_kg / 3.0 as akt_kg_pr_mdr
  from agg a
  where a.base_aktive_mdr >= 4
    and a.base_kg / 12.0 >= 1.0
)
select b.*,
       round((100.0 * (b.akt_kg_pr_mdr - b.base_kg_pr_mdr) / nullif(b.base_kg_pr_mdr,0))::numeric, 1) as afvigelse_pct,
       case
         when coalesce(b.akt_kg,0) = 0 then 'stoppet'
         when b.akt_kg_pr_mdr <= 0.40 * b.base_kg_pr_mdr then 'kritisk'
         when b.akt_kg_pr_mdr <= 0.70 * b.base_kg_pr_mdr then 'markant_fald'
         when b.akt_kg_pr_mdr <= 0.90 * b.base_kg_pr_mdr then 'let_fald'
         when b.akt_kg_pr_mdr >= 1.20 * b.base_kg_pr_mdr then 'vaekst'
         else 'normal'
       end as klasse
from beregnet b;

alter view public.forbrug_baseline set (security_invoker = on);
grant select on public.forbrug_baseline to authenticated;