-- Ét samlet læse-tjek på sales_monthly: afdelingsadgang først (ét opslag),
-- ellers det gamle virksomhedstjek som fallback. Uændret hvad brugeren kan se.
alter function public.can_access_company(uuid, uuid) cost 10000;

drop policy if exists "Afdelingsadgang til sales_monthly" on public.sales_monthly;
drop policy if exists "Users can view accessible sales_monthly" on public.sales_monthly;

create policy "Users can view accessible sales_monthly"
on public.sales_monthly
for select
to authenticated
using (
  (afdeling_nr = any ((select public.my_afdelinger())::integer[]))
  or (company_id is not null and public.can_access_company(auth.uid(), company_id))
);