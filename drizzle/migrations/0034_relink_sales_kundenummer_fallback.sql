CREATE OR REPLACE FUNCTION public.relink_sales_locations()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  n_monthly bigint := 0;
  n_products bigint := 0;
  n_kundenr bigint := 0;
begin
  with upd as (
    update public.sales_monthly s
    set location_id = l.id, company_id = l.company_id
    from public.locations l
    where l.afdeling_nr = s.afdeling_nr
      and l.visma_delivery_no = s.visma_delivery_no
      and (s.location_id is distinct from l.id or s.company_id is distinct from l.company_id)
    returning 1
  ) select count(*) into n_monthly from upd;

  -- Fallback: ingen leveringsadresse matcher → kobl på kundenummer, kun samme afdeling og kun entydigt match.
  with kand as (
    select s.id sid, min(c.id::text)::uuid cid, count(distinct c.id) n
    from public.sales_monthly s
    join public.companies c
      on c.afdeling_nr = s.afdeling_nr
     and (c.visma_id = s.visma_delivery_no or c.visma_delivery_id = s.visma_delivery_no)
    where s.company_id is null and s.location_id is null
      and not exists (select 1 from public.locations l where l.afdeling_nr = s.afdeling_nr and l.visma_delivery_no = s.visma_delivery_no)
    group by s.id
  ), upd3 as (
    update public.sales_monthly s set company_id = k.cid
    from kand k where k.sid = s.id and k.n = 1
    returning 1
  ) select count(*) into n_kundenr from upd3;

  with upd2 as (
    update public.sales_monthly_products s
    set location_id = l.id
    from public.locations l
    where l.afdeling_nr = s.afdeling_nr
      and l.visma_delivery_no = s.visma_delivery_no
      and s.location_id is distinct from l.id
    returning 1
  ) select count(*) into n_products from upd2;

  return jsonb_build_object('sales_monthly', n_monthly, 'sales_monthly_kundenr', n_kundenr, 'sales_monthly_products', n_products);
end;
$function$;