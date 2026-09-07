alter table public.profiles
  add column if not exists maa_se_db boolean not null default false,
  add column if not exists maa_se_analyse boolean not null default false;

create or replace function public.maa_se_db(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(_user_id)
      or coalesce((select p.maa_se_db from public.profiles p where p.id = _user_id), false)
$$;

create or replace function public.maa_se_analyse(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(_user_id)
      or coalesce((select p.maa_se_analyse from public.profiles p where p.id = _user_id), false)
$$;

grant execute on function public.maa_se_db(uuid) to authenticated;
grant execute on function public.maa_se_analyse(uuid) to authenticated;

update public.profiles set maa_se_db = true, maa_se_analyse = true
where id in (select id from auth.users where lower(email) = 'hlo@frellsen.dk');

create or replace function public.company_group_monthly(_company_id uuid)
 returns table(period date, product_group_1 text, revenue numeric, weight_kg numeric, quantity numeric, contribution numeric, order_count integer, last_invoice_date date)
 language sql stable set search_path to 'public'
as $$
  select
    sm.period,
    sm.product_group_1,
    sum(sm.revenue)::numeric as revenue,
    sum(sm.weight_kg)::numeric as weight_kg,
    sum(sm.quantity)::numeric as quantity,
    case when public.maa_se_db(auth.uid()) then sum(sm.contribution)::numeric else null end as contribution,
    sum(sm.order_count)::integer as order_count,
    max(sm.last_invoice_date) as last_invoice_date
  from public.sales_monthly sm
  where sm.company_id = _company_id
  group by sm.period, sm.product_group_1
  order by sm.period asc, sm.product_group_1 asc
$$;

delete from public.sales_monthly_products where period < '2025-01-01';
delete from public.sales_monthly where period < '2025-01-01';

create or replace function public.saelger_navn(_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select p.full_name from public.profiles p where p.id = _id
$$;
grant execute on function public.saelger_navn(uuid) to authenticated;

create or replace function public.analyse_pivot(
  _fra date,
  _til date,
  _opdel text,
  _afdeling_nr int,
  _saelger_ids uuid[] default null,
  _kundeprisgrupper text[] default null,
  _varegrupper text[] default null
)
returns table(noegle text, navn text, omsaetning numeric, kg numeric, stk numeric, db numeric, antal_kunder integer)
language sql stable security invoker set search_path = public as $$
  with base as (
    select sm.company_id, sm.product_group_1, sm.revenue, sm.weight_kg, sm.quantity, sm.contribution,
           c.name as c_navn, c.customer_category, c.assigned_to
    from public.sales_monthly sm
    join public.companies c on c.id = sm.company_id
    where sm.afdeling_nr = _afdeling_nr
      and sm.period >= date_trunc('month', _fra)::date
      and sm.period <= date_trunc('month', _til)::date
      and c.afloest_af_company_id is null
      and (_saelger_ids is null or c.assigned_to = any(_saelger_ids))
      and (_kundeprisgrupper is null or coalesce(c.customer_category, '—') = any(_kundeprisgrupper))
      and (_varegrupper is null or coalesce(sm.product_group_1, '—') = any(_varegrupper))
  ), keyed as (
    select b.*, case _opdel
      when 'kunde' then b.company_id::text
      when 'varegruppe' then coalesce(b.product_group_1, '—')
      when 'kundeprisgruppe' then coalesce(b.customer_category, '—')
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
$$;
grant execute on function public.analyse_pivot(date, date, text, int, uuid[], text[], text[]) to authenticated;

create or replace function public.analyse_filtre(_afdeling_nr int, _fra date, _til date)
returns json language sql stable security definer set search_path = public as $$
  select case when not (_afdeling_nr = any(public.my_afdelinger()))
    then json_build_object('saelgere', '[]'::json, 'prisgrupper', '[]'::json, 'varegrupper', '[]'::json)
    else json_build_object(
      'saelgere', (
        select coalesce(json_agg(json_build_object('id', x.id, 'navn', x.navn) order by x.navn), '[]'::json)
        from (
          select distinct p.id, coalesce(nullif(p.full_name, ''), '—') as navn
          from public.sales_monthly sm
          join public.companies c on c.id = sm.company_id
          join public.profiles p on p.id = c.assigned_to
          where sm.afdeling_nr = _afdeling_nr
            and sm.period between date_trunc('month', _fra)::date and date_trunc('month', _til)::date
            and c.afloest_af_company_id is null
        ) x
      ),
      'prisgrupper', (
        select coalesce(json_agg(x.g order by x.g), '[]'::json)
        from (
          select distinct coalesce(c.customer_category, '—') as g
          from public.sales_monthly sm
          join public.companies c on c.id = sm.company_id
          where sm.afdeling_nr = _afdeling_nr
            and sm.period between date_trunc('month', _fra)::date and date_trunc('month', _til)::date
            and c.afloest_af_company_id is null
        ) x
      ),
      'varegrupper', (
        select coalesce(json_agg(json_build_object('kode', x.g, 'navn', coalesce(public.gruppe_navn(_afdeling_nr, x.g), x.g)) order by x.g), '[]'::json)
        from (
          select distinct coalesce(sm.product_group_1, '—') as g
          from public.sales_monthly sm
          join public.companies c on c.id = sm.company_id
          where sm.afdeling_nr = _afdeling_nr
            and sm.period between date_trunc('month', _fra)::date and date_trunc('month', _til)::date
            and c.afloest_af_company_id is null
        ) x
      )
    ) end
$$;
grant execute on function public.analyse_filtre(int, date, date) to authenticated;