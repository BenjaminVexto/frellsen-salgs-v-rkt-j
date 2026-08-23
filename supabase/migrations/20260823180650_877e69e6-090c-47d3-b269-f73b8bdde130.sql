create or replace view public.salgsintelligens_penhed_status
with (security_invoker = on) as
with kunde_cvr as (
  select distinct c.afdeling_nr, c.cvr
  from public.companies c
  where c.cvr is not null
    and c.customer_type in ('aktiv_kunde','sovende_kunde')
    and coalesce(c.binding_status,'') <> 'intern_privat'
    and not public.is_offentlig_kunde(c.name, c.main_branch_code, c.is_public, c.institution_type)
    and not exists (select 1 from public.cvr_blocklist b where b.cvr = c.cvr)
),
vores as (
  select distinct c.afdeling_nr, c.cvr, l.zip,
         public.addr_vej(l.address) as vej,
         public.addr_husnr(l.address) as husnr
  from public.companies c
  join public.locations l on l.company_id = c.id
  where c.cvr is not null and public.addr_vej(l.address) is not null
)
select
  k.afdeling_nr, k.cvr, p.p_number, p.name as penhed_navn,
  p.address, p.zip, p.city,
  case
    when exists (select 1 from vores v
                 where v.afdeling_nr = k.afdeling_nr and v.cvr = k.cvr
                   and v.zip = p.zip and v.vej = public.addr_vej(p.address)
                   and v.husnr = public.addr_husnr(p.address)) then 'exact'
    when exists (select 1 from vores v
                 where v.afdeling_nr = k.afdeling_nr and v.cvr = k.cvr
                   and v.zip = p.zip and v.vej = public.addr_vej(p.address)) then 'street'
    else 'none'
  end as match_status
from kunde_cvr k
join public.cvr_penheder p on p.cvr = k.cvr and p.is_active;

create or replace view public.salgsintelligens_mersalg
with (security_invoker = on) as
with agg as (
  select afdeling_nr, cvr,
    count(*) filter (where match_status = 'none')::int as potential,
    count(*) filter (where match_status <> 'none')::int as daekket,
    count(*)::int as penheder_total
  from public.salgsintelligens_penhed_status
  group by afdeling_nr, cvr
),
hoved as (
  select distinct on (c.afdeling_nr, c.cvr)
    c.afdeling_nr, c.cvr, c.id as company_id, c.name, c.city, c.assigned_to
  from public.companies c
  where c.cvr is not null
    and c.customer_type in ('aktiv_kunde','sovende_kunde')
    and coalesce(c.binding_status,'') <> 'intern_privat'
  order by c.afdeling_nr, c.cvr,
    (select count(*) from public.locations l where l.company_id = c.id) desc,
    c.name
),
enheder as (
  select afdeling_nr, cvr, count(*)::int as antal_kundenumre
  from public.companies where cvr is not null group by afdeling_nr, cvr
)
select a.afdeling_nr, a.cvr, a.potential, a.daekket, a.penheder_total,
       h.company_id, h.name, h.city, h.assigned_to, e.antal_kundenumre
from agg a
join hoved h on h.afdeling_nr = a.afdeling_nr and h.cvr = a.cvr
join enheder e on e.afdeling_nr = a.afdeling_nr and e.cvr = a.cvr
where a.potential > 0;

grant select on public.salgsintelligens_penhed_status to authenticated;
grant select on public.salgsintelligens_mersalg to authenticated;