create or replace view public.forbrug_signal_virksomhed
with (security_invoker = on) as
with pr_gruppe as (
  select fb.*, pr.er_primaer, pr.navn as gruppe_navn
  from public.forbrug_baseline fb
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