create or replace function public.relink_sales_locations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_monthly bigint := 0;
  n_products bigint := 0;
begin
  with upd as (
    update public.sales_monthly s
    set location_id = l.id,
        company_id = l.company_id
    from public.locations l
    where l.afdeling_nr = s.afdeling_nr
      and l.visma_delivery_no = s.visma_delivery_no
      and (s.location_id is distinct from l.id or s.company_id is distinct from l.company_id)
    returning 1
  ) select count(*) into n_monthly from upd;

  with upd2 as (
    update public.sales_monthly_products s
    set location_id = l.id
    from public.locations l
    where l.afdeling_nr = s.afdeling_nr
      and l.visma_delivery_no = s.visma_delivery_no
      and s.location_id is distinct from l.id
    returning 1
  ) select count(*) into n_products from upd2;

  return jsonb_build_object('sales_monthly', n_monthly, 'sales_monthly_products', n_products);
end;
$$;

revoke all on function public.relink_sales_locations() from public, anon, authenticated;
grant execute on function public.relink_sales_locations() to service_role;