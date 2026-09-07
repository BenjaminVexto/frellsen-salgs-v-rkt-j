-- Salgsdata følger samme afdelingsadgang som virksomhederne selv: alle
-- indloggede brugere kan i forvejen se virksomheder i deres egne afdelinger.
-- Den nye politik gør afdelingsopslag hurtige (ét opslag i stedet for ét pr.
-- række), uden at udvide hvad nogen kan se.
drop policy if exists "Afdelingsadgang til sales_monthly" on public.sales_monthly;
create policy "Afdelingsadgang til sales_monthly"
on public.sales_monthly
for select
to authenticated
using (afdeling_nr = any ((select public.my_afdelinger())::integer[]));