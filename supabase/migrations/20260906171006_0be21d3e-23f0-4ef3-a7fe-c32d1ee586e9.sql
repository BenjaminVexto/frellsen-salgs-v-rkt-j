-- 1) Midlertidige importtabeller: slå RLS til og luk offentlig adgang.
alter table public.tmp_crm_nord enable row level security;
alter table public.tmp_leads_nordjylland enable row level security;

revoke all on public.tmp_crm_nord from anon, authenticated;
revoke all on public.tmp_leads_nordjylland from anon, authenticated;

grant select on public.tmp_crm_nord to authenticated;
grant select on public.tmp_leads_nordjylland to authenticated;
grant all on public.tmp_crm_nord to service_role;
grant all on public.tmp_leads_nordjylland to service_role;

drop policy if exists "Kun admin kan læse tmp_crm_nord" on public.tmp_crm_nord;
create policy "Kun admin kan læse tmp_crm_nord"
on public.tmp_crm_nord for select to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Kun admin kan læse tmp_leads_nordjylland" on public.tmp_leads_nordjylland;
create policy "Kun admin kan læse tmp_leads_nordjylland"
on public.tmp_leads_nordjylland for select to authenticated
using (public.is_admin(auth.uid()));

-- 2) View uden security_invoker → kør med kaldendes rettigheder/RLS.
alter view public.forbrug_baseline set (security_invoker = on);

-- 3) profiles: sælgernummer må ikke længere læses af alle indloggede.
revoke select on public.profiles from anon, authenticated;
grant select (id, full_name, region, is_active, created_at, primary_afdeling_nr)
  on public.profiles to authenticated;
grant all on public.profiles to service_role;