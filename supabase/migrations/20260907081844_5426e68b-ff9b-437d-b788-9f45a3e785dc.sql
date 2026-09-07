drop function if exists public.analyse_pivot(date, date, text, integer, uuid[], text[], text[], text[]);

create or replace function public.analyse_pivot(
  _fra date,
  _til date,
  _opdel text,
  _afdeling_nr integer,
  _saelger_ids uuid[] default null,
  _kundeprisgrupper text[] default null,
  _varegrupper text[] default null,
  _regioner text[] default null,
  _kg_gruppe text default '2'
)
returns table(noegle text, navn text, omsaetning numeric, kg numeric, stk numeric, db numeric, antal_kunder integer)
language sql
stable
set search_path to 'public'
as $function$
  with base as (
    select sm.company_id, sm.product_group_1, sm.revenue, sm.weight_kg, sm.quantity, sm.contribution,
           c.name as c_navn, c.customer_category, c.assigned_to,
           nullif(regexp_replace(coalesce(l.zip, ''), '\D', '', 'g'), '') as l_zip,
           nullif(btrim(coalesce(l.city, '')), '') as l_city,
           public.region_for_postnr(l.zip) as l_region
    from public.sales_monthly sm
    join public.companies c on c.id = sm.company_id
    left join public.locations l on l.id = sm.location_id
    where sm.afdeling_nr = _afdeling_nr
      and sm.period >= date_trunc('month', _fra)::date
      and sm.period <= date_trunc('month', _til)::date
      and c.afloest_af_company_id is null
      and (_saelger_ids is null or c.assigned_to = any(_saelger_ids))
      and (_kundeprisgrupper is null or coalesce(c.customer_category, '—') = any(_kundeprisgrupper))
      and (_varegrupper is null or coalesce(sm.product_group_1, '—') = any(_varegrupper))
      and (_regioner is null or public.region_for_postnr(l.zip) = any(_regioner))
  ), keyed as (
    select b.*, case _opdel
      when 'kunde' then b.company_id::text
      when 'varegruppe' then coalesce(b.product_group_1, '—')
      when 'kundeprisgruppe' then coalesce(b.customer_category, '—')
      when 'region' then b.l_region
      when 'postnummer' then coalesce(b.l_zip, 'Ukendt')
      else coalesce(b.assigned_to::text, '—')
    end as k
    from base b
  )
  select
    k as noegle,
    case _opdel
      when 'kunde' then max(k2.c_navn)
      when 'varegruppe' then coalesce(public.gruppe_navn(_afdeling_nr, k), k)
      when 'kundeprisgruppe' then k
      when 'region' then k
      when 'postnummer' then case when k = 'Ukendt' then 'Ukendt'
        else btrim(k || ' ' || coalesce(max(k2.l_city), '')) end
      else coalesce(public.saelger_navn(nullif(k, '—')::uuid), 'Ingen sælger')
    end as navn,
    coalesce(sum(k2.revenue), 0)::numeric as omsaetning,
    coalesce(sum(k2.weight_kg) filter (
      where _kg_gruppe is null or coalesce(k2.product_group_1, '—') = _kg_gruppe
    ), 0)::numeric as kg,
    coalesce(sum(k2.quantity), 0)::numeric as stk,
    case when public.maa_se_db(auth.uid()) then coalesce(sum(k2.contribution), 0)::numeric else null end as db,
    count(distinct k2.company_id)::int as antal_kunder
  from keyed k2
  group by k
  order by 3 desc
$function$;