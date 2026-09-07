create table if not exists public.postnummer_region (
  postnr_fra int primary key,
  postnr_til int not null,
  region text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.postnummer_region to authenticated;
grant insert, update, delete on public.postnummer_region to authenticated;
grant all on public.postnummer_region to service_role;

alter table public.postnummer_region enable row level security;

drop policy if exists "Alle kan se postnummer_region" on public.postnummer_region;
create policy "Alle kan se postnummer_region" on public.postnummer_region
  for select to authenticated using (true);

drop policy if exists "Admins kan redigere postnummer_region" on public.postnummer_region;
create policy "Admins kan redigere postnummer_region" on public.postnummer_region
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop trigger if exists postnummer_region_touch on public.postnummer_region;
create trigger postnummer_region_touch before update on public.postnummer_region
  for each row execute function public.touch_updated_at();

insert into public.postnummer_region (postnr_fra, postnr_til, region) values
  (1000, 2665, 'Hovedstaden'),
  (2660, 2669, 'Hovedstaden'),
  (3000, 3699, 'Hovedstaden'),
  (3700, 3799, 'Hovedstaden'),
  (2670, 2699, 'Sjælland'),
  (4000, 4999, 'Sjælland'),
  (5000, 5999, 'Syddanmark'),
  (6000, 6879, 'Syddanmark'),
  (7000, 7129, 'Syddanmark'),
  (7182, 7269, 'Syddanmark'),
  (7300, 7329, 'Syddanmark'),
  (6880, 6990, 'Midtjylland'),
  (7130, 7181, 'Midtjylland'),
  (7270, 7299, 'Midtjylland'),
  (7330, 7699, 'Midtjylland'),
  (7790, 7799, 'Midtjylland'),
  (7800, 7899, 'Midtjylland'),
  (8000, 8999, 'Midtjylland'),
  (7700, 7789, 'Nordjylland'),
  (7900, 7999, 'Nordjylland'),
  (9000, 9999, 'Nordjylland')
on conflict (postnr_fra) do update set postnr_til = excluded.postnr_til, region = excluded.region;

create or replace function public.region_for_postnr(_zip text)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce((
    select r.region
    from public.postnummer_region r
    where nullif(regexp_replace(coalesce(_zip, ''), '\D', '', 'g'), '')::int
          between r.postnr_fra and r.postnr_til
    order by r.postnr_fra
    limit 1
  ), 'Ukendt')
$$;

grant execute on function public.region_for_postnr(text) to authenticated, service_role;

create or replace function public.analyse_pivot(
  _fra date, _til date, _opdel text, _afdeling_nr integer,
  _saelger_ids uuid[] default null::uuid[],
  _kundeprisgrupper text[] default null::text[],
  _varegrupper text[] default null::text[],
  _regioner text[] default null::text[]
)
returns table(noegle text, navn text, omsaetning numeric, kg numeric, stk numeric, db numeric, antal_kunder integer)
language sql
stable
set search_path = public
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
    coalesce(sum(k2.weight_kg), 0)::numeric as kg,
    coalesce(sum(k2.quantity), 0)::numeric as stk,
    case when public.maa_se_db(auth.uid()) then coalesce(sum(k2.contribution), 0)::numeric else null end as db,
    count(distinct k2.company_id)::int as antal_kunder
  from keyed k2
  group by k
  order by 3 desc
$function$;

revoke all on function public.analyse_pivot(date, date, text, integer, uuid[], text[], text[], text[]) from public, anon;
grant execute on function public.analyse_pivot(date, date, text, integer, uuid[], text[], text[], text[]) to authenticated, service_role;