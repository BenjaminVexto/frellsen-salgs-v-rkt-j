create table if not exists public.forbrug_signal_historik (
  id uuid primary key default gen_random_uuid(),
  snapshot_periode date not null,
  niveau text not null,
  enhed_id text not null,
  company_id uuid,
  location_id uuid,
  afdeling_nr int,
  product_group_1 text not null,
  base_kg_pr_mdr numeric,
  akt_kg_pr_mdr numeric,
  afvigelse_pct numeric,
  klasse text not null,
  aarsag text,
  tabt_kg_pr_mdr numeric,
  tabt_kr_pr_mdr numeric,
  handling_paakraevet boolean,
  forventet_interval_mdr numeric,
  mdr_siden_sidste_koeb int,
  created_at timestamptz not null default now(),
  unique (snapshot_periode, niveau, enhed_id, product_group_1)
);

grant select on public.forbrug_signal_historik to authenticated;
grant all on public.forbrug_signal_historik to service_role;

alter table public.forbrug_signal_historik enable row level security;

create index if not exists fsh_enhed_idx on public.forbrug_signal_historik (niveau, enhed_id, product_group_1, snapshot_periode desc);
create index if not exists fsh_company_idx on public.forbrug_signal_historik (company_id, snapshot_periode desc);

-- Brugeren må kun se rækker for virksomheder han har adgang til.
-- companies har selv RLS, så subquery'en arver den.
drop policy if exists "fsh_read" on public.forbrug_signal_historik;
create policy "fsh_read" on public.forbrug_signal_historik
  for select to authenticated
  using (exists (select 1 from public.companies c where c.id = forbrug_signal_historik.company_id));

-- forbrug_baseline har security_invoker = on, så funktionen SKAL være
-- SECURITY DEFINER for at fange hele kundebasen i snapshottet.
create or replace function public.snapshot_forbrug_signal()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periode date;
  v_rows integer;
begin
  select max(period) into v_periode
  from public.sales_period_completeness where er_komplet;
  if v_periode is null then return 0; end if;

  insert into public.forbrug_signal_historik (
    snapshot_periode, niveau, enhed_id, company_id, location_id, afdeling_nr,
    product_group_1, base_kg_pr_mdr, akt_kg_pr_mdr, afvigelse_pct, klasse, aarsag,
    tabt_kg_pr_mdr, tabt_kr_pr_mdr, handling_paakraevet,
    forventet_interval_mdr, mdr_siden_sidste_koeb
  )
  select v_periode, fb.niveau, fb.enhed_id, fb.company_id, fb.location_id, c.afdeling_nr,
         fb.product_group_1, fb.base_kg_pr_mdr, fb.akt_kg_pr_mdr, fb.afvigelse_pct, fb.klasse, fb.aarsag,
         fb.tabt_kg_pr_mdr, fb.tabt_kr_pr_mdr, fb.handling_paakraevet,
         fb.forventet_interval_mdr, fb.mdr_siden_sidste_koeb
  from public.forbrug_baseline fb
  left join public.companies c on c.id = fb.company_id
  on conflict (snapshot_periode, niveau, enhed_id, product_group_1) do update set
    base_kg_pr_mdr = excluded.base_kg_pr_mdr,
    akt_kg_pr_mdr = excluded.akt_kg_pr_mdr,
    afvigelse_pct = excluded.afvigelse_pct,
    klasse = excluded.klasse,
    aarsag = excluded.aarsag,
    tabt_kg_pr_mdr = excluded.tabt_kg_pr_mdr,
    tabt_kr_pr_mdr = excluded.tabt_kr_pr_mdr,
    handling_paakraevet = excluded.handling_paakraevet,
    forventet_interval_mdr = excluded.forventet_interval_mdr,
    mdr_siden_sidste_koeb = excluded.mdr_siden_sidste_koeb,
    afdeling_nr = excluded.afdeling_nr,
    created_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

revoke execute on function public.snapshot_forbrug_signal() from public, anon;
grant execute on function public.snapshot_forbrug_signal() to service_role;

create or replace view public.forbrug_signal_udvikling
with (security_invoker = on) as
with rangeret as (
  select h.*, row_number() over (
    partition by niveau, enhed_id, product_group_1 order by snapshot_periode desc
  ) as rn
  from public.forbrug_signal_historik h
),
alvor as (
  select * from (values
    ('vaekst',0),('normal',1),('ny',1),('afventer_rytme',2),
    ('let_fald',3),('markant_fald',4),('kritisk',5),('stoppet',6)
  ) as t(klasse, score)
)
select n.niveau, n.enhed_id, n.company_id, n.location_id, n.afdeling_nr, n.product_group_1,
       n.snapshot_periode, n.klasse as klasse_nu, f.klasse as klasse_foer,
       n.aarsag as aarsag_nu,
       n.tabt_kg_pr_mdr as tabt_kg_nu, f.tabt_kg_pr_mdr as tabt_kg_foer,
       n.tabt_kr_pr_mdr as tabt_kr_nu, f.tabt_kr_pr_mdr as tabt_kr_foer,
       round(n.tabt_kg_pr_mdr - f.tabt_kg_pr_mdr, 1) as aendring_tabt_kg,
       case
         when f.klasse is null then 'ny_i_maaling'
         when an.score > af.score then 'forvaerret'
         when an.score < af.score then 'forbedret'
         else 'uaendret'
       end as retning
from rangeret n
left join rangeret f
  on f.niveau = n.niveau and f.enhed_id = n.enhed_id
 and f.product_group_1 = n.product_group_1 and f.rn = 2
left join alvor an on an.klasse = n.klasse
left join alvor af on af.klasse = f.klasse
where n.rn = 1;

grant select on public.forbrug_signal_udvikling to authenticated;