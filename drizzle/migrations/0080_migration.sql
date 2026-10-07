create or replace function public.kunde_db_rang_liste(_saelger uuid)
returns table(company_id uuid, navn text, by text, db numeric, db_foer numeric, rang int, antal int)
language plpgsql stable security definer set search_path=public as $$
declare fra date := (date_trunc('month', now()) - interval '12 months')::date;
        til date := date_trunc('month', now())::date;
        fra0 date := (date_trunc('month', now()) - interval '24 months')::date;
begin
  if _saelger <> auth.uid() and not exists(select 1 from user_roles where user_id=auth.uid() and role in ('admin','salgssupport')) then
    raise exception 'Ingen adgang';
  end if;
  if not maa_se_db(auth.uid()) then raise exception 'Ingen adgang til DB'; end if;
  return query
  with t as (
    select s.company_id,
      sum(s.contrib) filter (where s.period>=fra and s.period<til) d,
      sum(s.contrib) filter (where s.period>=fra0 and s.period<fra) f,
      bool_or(s.period>=fra and s.period<til) i
    from sales_kunde_maaned s where s.saelger=_saelger and s.period>=fra0 and s.period<til
    group by s.company_id)
  select t.company_id, c.name::text, c.city::text, coalesce(t.d,0), t.f,
    (rank() over (order by coalesce(t.d,0) desc))::int, (count(*) over ())::int
  from t join companies c on c.id=t.company_id where t.i;
end $$;

create or replace function public.kunde_db_rang(_company uuid)
returns table(saelger uuid, saelger_navn text, db numeric, db_foer numeric, rang int, antal int, egen boolean)
language plpgsql stable security definer set search_path=public as $$
declare s uuid; fra date := (date_trunc('month', now()) - interval '12 months')::date;
begin
  if not maa_se_db(auth.uid()) then return; end if;
  if exists(select 1 from sales_kunde_maaned where company_id=_company and sales_kunde_maaned.saelger=auth.uid() and period>=fra) then
    s := auth.uid();
  elsif exists(select 1 from user_roles where user_id=auth.uid() and role in ('admin','salgssupport')) then
    select x.saelger into s from sales_kunde_maaned x left join companies c on c.id=_company
    where x.company_id=_company and x.saelger is not null and x.period>=fra
    group by x.saelger, c.assigned_to order by (x.saelger=c.assigned_to) desc, sum(x.contrib) desc limit 1;
  end if;
  if s is null then return; end if;
  return query select s, (select full_name from profiles where id=s)::text, l.db, l.db_foer, l.rang, l.antal, s=auth.uid()
    from kunde_db_rang_liste(s) l where l.company_id=_company;
end $$;
grant execute on function public.kunde_db_rang_liste(uuid), public.kunde_db_rang(uuid) to authenticated;