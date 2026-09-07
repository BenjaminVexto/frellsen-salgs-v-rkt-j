-- Oprydning: dubletter af (visma_delivery_no, afdeling_nr) i locations
create table if not exists public._location_dedup_report (
  id bigserial primary key,
  kind text not null,
  detail text,
  n bigint,
  created_at timestamptz not null default now()
);

do $$
declare
  r record;
  n int;
  locs_deleted int := 0;
  keys_merged int := 0;
  sales_moved int := 0;
  prod_moved int := 0;
  other_moved int := 0;
  null_deleted int := 0;
  null_kept int := 0;
begin
  for r in
    select l.id as keep_id,
           l.company_id as keep_company,
           k.visma_delivery_no,
           k.afdeling_nr,
           array(select l2.id from public.locations l2
                 where l2.visma_delivery_no = k.visma_delivery_no
                   and l2.afdeling_nr is not distinct from k.afdeling_nr
                   and l2.id <> l.id) as loser_ids
    from (
      select visma_delivery_no, afdeling_nr
      from public.locations
      where visma_delivery_no is not null
      group by 1,2
      having count(*) > 1
    ) k
    join lateral (
      select * from public.locations l
      where l.visma_delivery_no = k.visma_delivery_no
        and l.afdeling_nr is not distinct from k.afdeling_nr
      order by l.created_at desc nulls last, l.id desc
      limit 1
    ) l on true
  loop
    keys_merged := keys_merged + 1;

    update public.sales_monthly set location_id = r.keep_id, company_id = r.keep_company
      where location_id = any(r.loser_ids);
    get diagnostics n = row_count; sales_moved := sales_moved + n;

    update public.sales_monthly_products set location_id = r.keep_id
      where location_id = any(r.loser_ids);
    get diagnostics n = row_count; prod_moved := prod_moved + n;

    update public.sales_monthly_rebuilt set location_id = r.keep_id, company_id = r.keep_company
      where location_id = any(r.loser_ids);
    get diagnostics n = row_count; prod_moved := prod_moved + n;

    update public.sales_monthly_products_rebuilt set location_id = r.keep_id
      where location_id = any(r.loser_ids);
    get diagnostics n = row_count; prod_moved := prod_moved + n;

    update public.sales_top_products set location_id = r.keep_id
      where location_id = any(r.loser_ids);
    get diagnostics n = row_count; other_moved := other_moved + n;

    update public.location_equipment_units set location_id = r.keep_id
      where location_id = any(r.loser_ids);
    get diagnostics n = row_count; other_moved := other_moved + n;

    update public.activities set location_id = r.keep_id, company_id = r.keep_company
      where location_id = any(r.loser_ids);
    get diagnostics n = row_count; other_moved := other_moved + n;

    update public.machine_agreement_status set location_id = r.keep_id, company_id = r.keep_company
      where location_id = any(r.loser_ids);
    get diagnostics n = row_count; other_moved := other_moved + n;

    update public.quotes set delivery_location_id = r.keep_id
      where delivery_location_id = any(r.loser_ids);
    get diagnostics n = row_count; other_moved := other_moved + n;

    update public.contact_list_assignments set location_id = r.keep_id, company_id = r.keep_company
      where location_id = any(r.loser_ids);
    get diagnostics n = row_count; other_moved := other_moved + n;

    update public.forbrug_signal_historik set location_id = r.keep_id, company_id = r.keep_company
      where location_id = any(r.loser_ids);
    get diagnostics n = row_count; other_moved := other_moved + n;

    -- Kontakter: undgå kollision med (company_id, location_id, name)
    delete from public.contacts c
      where c.location_id = any(r.loser_ids)
        and exists (
          select 1 from public.contacts k
          where k.location_id = r.keep_id
            and k.company_id = r.keep_company
            and lower(k.name) = lower(c.name)
        );
    update public.contacts set location_id = r.keep_id, company_id = r.keep_company
      where location_id = any(r.loser_ids);
    get diagnostics n = row_count; other_moved := other_moved + n;

    delete from public.locations where id = any(r.loser_ids);
    get diagnostics n = row_count; locs_deleted := locs_deleted + n;
  end loop;

  -- Lokationer uden leveringsnummer: slet kun hvis intet peger på dem
  for r in select id from public.locations where visma_delivery_no is null loop
    if exists (select 1 from public.sales_monthly where location_id = r.id)
      or exists (select 1 from public.sales_monthly_products where location_id = r.id)
      or exists (select 1 from public.sales_top_products where location_id = r.id)
      or exists (select 1 from public.location_equipment_units where location_id = r.id)
      or exists (select 1 from public.activities where location_id = r.id)
      or exists (select 1 from public.contacts where location_id = r.id)
      or exists (select 1 from public.contact_list_assignments where location_id = r.id)
      or exists (select 1 from public.machine_agreement_status where location_id = r.id)
      or exists (select 1 from public.quotes where delivery_location_id = r.id)
      or exists (select 1 from public.forbrug_signal_historik where location_id = r.id)
      or exists (select 1 from public.sales_monthly_rebuilt where location_id = r.id)
      or exists (select 1 from public.sales_monthly_products_rebuilt where location_id = r.id)
    then
      null_kept := null_kept + 1;
      insert into public._location_dedup_report(kind, detail, n)
        values ('beholdt_uden_levnr', r.id::text, 1);
    else
      delete from public.locations where id = r.id;
      null_deleted := null_deleted + 1;
    end if;
  end loop;

  insert into public._location_dedup_report(kind, detail, n) values
    ('dublet_noegler_flettet', null, keys_merged),
    ('lokationer_slettet', null, locs_deleted),
    ('salgsraekker_flyttet_sales_monthly', null, sales_moved),
    ('varelinjer_flyttet', null, prod_moved),
    ('oevrige_raekker_flyttet', null, other_moved),
    ('lokationer_uden_levnr_slettet', null, null_deleted),
    ('lokationer_uden_levnr_beholdt', null, null_kept);

  raise notice 'Dublet-oprydning: % noegler flettet, % lokationer slettet, % maanedsraekker flyttet, % varelinjer flyttet, % oevrige flyttet, % tomme slettet, % beholdt',
    keys_merged, locs_deleted, sales_moved, prod_moved, other_moved, null_deleted, null_kept;
end $$;

-- Fremtidssikring: ét leveringsnummer pr. afdeling
create unique index if not exists locations_delivery_afdeling_unique
  on public.locations (visma_delivery_no, afdeling_nr)
  where visma_delivery_no is not null;

grant select on public._location_dedup_report to authenticated;
grant all on public._location_dedup_report to service_role;
alter table public._location_dedup_report enable row level security;
create policy "Admins kan laese dedup-rapport" on public._location_dedup_report
  for select to authenticated using (public.is_admin(auth.uid()));