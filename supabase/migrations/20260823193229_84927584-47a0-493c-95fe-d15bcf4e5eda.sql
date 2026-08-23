alter table public.forbrug_signal_historik
  add column if not exists base_omsaetning numeric,
  add column if not exists akt_omsaetning numeric,
  add column if not exists ordre_aendring_pct numeric,
  add column if not exists stk_aendring_pct numeric,
  add column if not exists sidste_koeb date;

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
    forventet_interval_mdr, mdr_siden_sidste_koeb,
    base_omsaetning, akt_omsaetning, ordre_aendring_pct, stk_aendring_pct, sidste_koeb
  )
  select v_periode, fb.niveau, fb.enhed_id, fb.company_id, fb.location_id, c.afdeling_nr,
         fb.product_group_1, fb.base_kg_pr_mdr, fb.akt_kg_pr_mdr, fb.afvigelse_pct, fb.klasse, fb.aarsag,
         fb.tabt_kg_pr_mdr, fb.tabt_kr_pr_mdr, fb.handling_paakraevet,
         fb.forventet_interval_mdr, fb.mdr_siden_sidste_koeb,
         fb.base_omsaetning, fb.akt_omsaetning, fb.ordre_aendring_pct, fb.stk_aendring_pct, fb.sidste_koeb
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
    base_omsaetning = excluded.base_omsaetning,
    akt_omsaetning = excluded.akt_omsaetning,
    ordre_aendring_pct = excluded.ordre_aendring_pct,
    stk_aendring_pct = excluded.stk_aendring_pct,
    sidste_koeb = excluded.sidste_koeb,
    afdeling_nr = excluded.afdeling_nr,
    created_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

revoke execute on function public.snapshot_forbrug_signal() from public, anon;
grant execute on function public.snapshot_forbrug_signal() to service_role;

-- Seneste snapshot: hurtig laesning af signalet uden at genberegne baseline.
create or replace view public.forbrug_signal_seneste
with (security_invoker = on) as
select h.*
from public.forbrug_signal_historik h
where h.snapshot_periode = (select max(snapshot_periode) from public.forbrug_signal_historik);

grant select on public.forbrug_signal_seneste to authenticated;

-- Rollup pr. virksomhed laeser nu det gemte snapshot (hurtigt) i stedet for
-- at genberegne forbrug_baseline ved hver forespoergsel.
create or replace view public.forbrug_signal_virksomhed
with (security_invoker = on) as
with pr_gruppe as (
  select fb.*, pr.er_primaer, pr.navn as gruppe_navn
  from public.forbrug_signal_seneste fb
  join public.produktgruppe_rolle pr on pr.product_group_1 = fb.product_group_1
  where fb.niveau = 'virksomhed'
),
alvor as (
  select * from (values
    ('vaekst',0),('normal',1),('ny',1),('afventer_rytme',2),
    ('let_fald',3),('markant_fald',4),('kritisk',5),('stoppet',6)
  ) as t(klasse, score)
)
select
  g.company_id,
  max(c.afdeling_nr) as afdeling_nr,
  max(c.assigned_to::text)::uuid as assigned_to,
  max(g.klasse) filter (where g.er_primaer) as klasse_primaer,
  max(g.aarsag) filter (where g.er_primaer) as aarsag_primaer,
  round(max(g.afvigelse_pct) filter (where g.er_primaer), 1) as afvigelse_pct_primaer,
  round(max(g.base_kg_pr_mdr) filter (where g.er_primaer), 1) as base_kg_primaer,
  round(max(g.akt_kg_pr_mdr) filter (where g.er_primaer), 1) as akt_kg_primaer,
  max(g.sidste_koeb) filter (where g.er_primaer) as sidste_koeb_primaer,
  round(sum(g.tabt_kg_pr_mdr) filter (where g.handling_paakraevet), 1) as tabt_kg_pr_mdr,
  round(sum(g.tabt_kr_pr_mdr) filter (where g.handling_paakraevet), 0) as tabt_kr_pr_mdr,
  count(*) filter (where g.handling_paakraevet) as grupper_i_fald,
  count(*) as grupper_i_alt,
  bool_or(g.handling_paakraevet) as handling_paakraevet,
  max(a.score) filter (where g.handling_paakraevet) as vaerste_score,
  max(g.mdr_siden_sidste_koeb) filter (where g.er_primaer) as mdr_siden_sidste_koeb_primaer,
  max(g.forventet_interval_mdr) filter (where g.er_primaer) as forventet_interval_mdr_primaer
from pr_gruppe g
join public.companies c on c.id = g.company_id
left join alvor a on a.klasse = g.klasse
group by g.company_id;

grant select on public.forbrug_signal_virksomhed to authenticated;

select public.snapshot_forbrug_signal();