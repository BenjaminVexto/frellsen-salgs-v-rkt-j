create table if not exists public.produktgruppe_rolle (
  product_group_1 text primary key,
  navn text not null,
  rolle text not null check (rolle in ('forbrug','maskine','reservedel','gebyr','oevrigt')),
  er_primaer boolean not null default false,
  created_at timestamptz not null default now()
);
grant select on public.produktgruppe_rolle to authenticated;
grant all on public.produktgruppe_rolle to service_role;
alter table public.produktgruppe_rolle enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='produktgruppe_rolle' and policyname='produktgruppe_rolle_read') then
    create policy "produktgruppe_rolle_read" on public.produktgruppe_rolle
      for select to authenticated using (true);
  end if;
end $$;

insert into public.produktgruppe_rolle (product_group_1, navn, rolle, er_primaer) values
  ('2','Kaffe','forbrug',true),
  ('4','Te','forbrug',false),
  ('6','Drikke & automatvarer','forbrug',false),
  ('8','Engangskopper & emballage','forbrug',false),
  ('10','Chokolade & konfekt','forbrug',false),
  ('14','Lakrids & konfekt','forbrug',false),
  ('17','Vandfiltre','forbrug',false),
  ('16','Maskiner','maskine',false),
  ('18','Maskindele','reservedel',false),
  ('24','Gebyrer & emballage','gebyr',false)
on conflict (product_group_1) do nothing;

insert into public.produktgruppe_rolle (product_group_1, navn, rolle)
select distinct sm.product_group_1, 'Ukendt (' || sm.product_group_1 || ')', 'oevrigt'
from public.sales_monthly sm
where sm.product_group_1 is not null
on conflict (product_group_1) do nothing;

create or replace view public.sales_period_completeness as
with pr as (
  select period,
         count(distinct location_id) as lokationer,
         sum(weight_kg)::numeric as kg
  from public.sales_monthly
  where revenue > 0
  group by period
)
select p.period,
       p.lokationer,
       p.kg,
       m.median_lokationer,
       ly.lokationer as lokationer_sidste_aar,
       case when m.median_lokationer > 0
            then round((100.0 * p.lokationer / m.median_lokationer)::numeric, 1) end as pct_af_median,
       (
         p.period < date_trunc('month', now())::date
         and (m.median_lokationer is null or p.lokationer >= 0.50 * m.median_lokationer)
         and (ly.lokationer is null or p.lokationer >= 0.60 * ly.lokationer)
       ) as er_komplet
from pr p
left join lateral (
  select percentile_cont(0.5) within group (order by x.lokationer) as median_lokationer
  from pr x
  where x.period < p.period
    and x.period >= (p.period - interval '12 months')::date
) m on true
left join pr ly on ly.period = (p.period - interval '12 months')::date;

grant select on public.sales_period_completeness to authenticated;

create or replace view public.sales_season_index as
with komplet as (
  select period from public.sales_period_completeness where er_komplet
),
g as (
  select sm.product_group_1,
         extract(month from sm.period)::int as maaned,
         sum(sm.weight_kg)::numeric as kg,
         count(distinct sm.period) as maaneder_i_grundlag
  from public.sales_monthly sm
  join komplet k on k.period = sm.period
  group by 1,2
),
snit as (
  select product_group_1,
         sum(kg) / nullif(sum(maaneder_i_grundlag),0) as kg_pr_maaned_gns,
         sum(maaneder_i_grundlag) as komplette_maaneder_i_alt
  from g group by 1
)
select g.product_group_1,
       g.maaned,
       g.maaneder_i_grundlag,
       s.komplette_maaneder_i_alt,
       round(((g.kg / nullif(g.maaneder_i_grundlag,0)) / nullif(s.kg_pr_maaned_gns,0))::numeric, 4) as saeson_indeks
from g join snit s using (product_group_1)
where s.kg_pr_maaned_gns > 0;

grant select on public.sales_season_index to authenticated;

-- NB: sæsonindekset hviler i dag reelt kun på ét fuldt år (2025). Værnet i
-- saeson_faktor() (mindst 6 komplette måneder + indeks mellem 0.3 og 3.0) gør
-- det sikkert at bruge nu, men indekset skal genberegnes/revurderes efterhånden
-- som flere komplette måneder akkumuleres.
create or replace function public.saeson_faktor(_group text, _period date)
returns numeric language sql stable set search_path = public as $$
  select coalesce((
    select si.saeson_indeks
    from public.sales_season_index si
    where si.product_group_1 = _group
      and si.maaned = extract(month from _period)::int
      and si.komplette_maaneder_i_alt >= 6
      and si.saeson_indeks between 0.3 and 3.0
  ), 1.0)
$$;