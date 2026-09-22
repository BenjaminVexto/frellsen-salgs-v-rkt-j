drop policy "Users can view accessible sales_monthly_products" on public.sales_monthly_products;

create policy "Users can view sales_monthly_products i egne afdelinger"
on public.sales_monthly_products
for select to authenticated
using (
  afdeling_nr = any ((select public.my_afdelinger())::int[])
  and (
    location_id is not null
    or public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'salgssupport'::app_role)
  )
);