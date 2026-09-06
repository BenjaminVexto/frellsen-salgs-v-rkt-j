create or replace function public.company_group_monthly(_company_id uuid)
returns table(
  period date,
  product_group_1 text,
  revenue numeric,
  weight_kg numeric,
  quantity numeric,
  contribution numeric,
  order_count integer,
  last_invoice_date date
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    sm.period,
    sm.product_group_1,
    sum(sm.revenue)::numeric as revenue,
    sum(sm.weight_kg)::numeric as weight_kg,
    sum(sm.quantity)::numeric as quantity,
    case when public.is_admin(auth.uid()) then sum(sm.contribution)::numeric else null end as contribution,
    sum(sm.order_count)::integer as order_count,
    max(sm.last_invoice_date) as last_invoice_date
  from public.sales_monthly sm
  where sm.company_id = _company_id
  group by sm.period, sm.product_group_1
  order by sm.period asc, sm.product_group_1 asc
$$;

revoke all on function public.company_group_monthly(uuid) from public;
grant execute on function public.company_group_monthly(uuid) to authenticated, service_role;

create or replace function public.company_sortiment_bredde(_company_id uuid)
returns table(
  antal_forbrug_nu integer,
  antal_forbrug_foer integer,
  antal_maskine_nu integer,
  antal_maskine_foer integer,
  varelinje_start date
)
language sql
stable
security invoker
set search_path = public
as $$
  with b as (
    select date_trunc('month', (now() at time zone 'utc'))::date as m0
  ),
  w as (
    select
      (m0 - interval '6 months')::date as nu_fra,
      m0 as nu_til,
      (m0 - interval '18 months')::date as foer_fra,
      (m0 - interval '12 months')::date as foer_til
    from b
  ),
  rows as (
    select smp.varenr,
           smp.period,
           substring(btrim(smp.product_group_1) from '^(\d+)') as kode
    from public.sales_monthly_products smp
    join public.locations l on l.id = smp.location_id
    cross join w
    where l.company_id = _company_id
      and smp.period >= w.foer_fra
      and smp.period < w.nu_til
  )
  select
    (select count(distinct r.varenr) from rows r cross join w
      where r.kode in ('2','4','6','8','10','12','14','20','22','23')
        and r.period >= w.nu_fra and r.period < w.nu_til)::integer,
    (select count(distinct r.varenr) from rows r cross join w
      where r.kode in ('2','4','6','8','10','12','14','20','22','23')
        and r.period >= w.foer_fra and r.period < w.foer_til)::integer,
    (select count(distinct r.varenr) from rows r cross join w
      where r.kode in ('16','17','18','24')
        and r.period >= w.nu_fra and r.period < w.nu_til)::integer,
    (select count(distinct r.varenr) from rows r cross join w
      where r.kode in ('16','17','18','24')
        and r.period >= w.foer_fra and r.period < w.foer_til)::integer,
    (select min(smp2.period) from public.sales_monthly_products smp2)
$$;

revoke all on function public.company_sortiment_bredde(uuid) from public;
grant execute on function public.company_sortiment_bredde(uuid) to authenticated, service_role;