CREATE OR REPLACE FUNCTION public.salg_uden_kunde_liste(_afd integer DEFAULT NULL)
RETURNS TABLE (visma_delivery_no text, afdeling_nr integer, kunde_navn text, foerste date, seneste date, beloeb numeric, findes_som_kunde boolean, kunde_navn_crm text, kunde_afdeling integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (
    SELECT sm.visma_delivery_no, sm.afdeling_nr, min(sm.period) foerste, max(sm.period) seneste,
      coalesce(sum(sm.revenue) FILTER (WHERE sm.revenue > 0), 0) beloeb
    FROM sales_monthly sm
    WHERE sm.company_id IS NULL AND (_afd IS NULL OR sm.afdeling_nr = _afd)
    GROUP BY 1, 2
  )
  SELECT u.visma_delivery_no, u.afdeling_nr,
    (SELECT il.kunde_navn FROM invoice_lines il WHERE il.visma_delivery_no = u.visma_delivery_no AND il.kunde_navn IS NOT NULL ORDER BY il.faktura_dato DESC LIMIT 1),
    u.foerste, u.seneste, u.beloeb, c.id IS NOT NULL, c.name, c.afdeling_nr
  FROM u
  LEFT JOIN LATERAL (SELECT c.id, c.name, c.afdeling_nr FROM companies c
    WHERE c.visma_id = u.visma_delivery_no OR c.visma_delivery_id = u.visma_delivery_no
    ORDER BY (c.afdeling_nr = u.afdeling_nr) DESC LIMIT 1) c ON true
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY u.beloeb DESC
$$;
GRANT EXECUTE ON FUNCTION public.salg_uden_kunde_liste(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.salg_uden_kunde(_afd integer DEFAULT NULL)
RETURNS TABLE (ikke_kunde_antal bigint, ikke_kunde_beloeb numeric, kunde_antal bigint, kunde_beloeb numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FILTER (WHERE NOT findes_som_kunde), coalesce(sum(beloeb) FILTER (WHERE NOT findes_som_kunde), 0),
         count(*) FILTER (WHERE findes_som_kunde), coalesce(sum(beloeb) FILTER (WHERE findes_som_kunde), 0)
  FROM public.salg_uden_kunde_liste(_afd)
$$;
GRANT EXECUTE ON FUNCTION public.salg_uden_kunde(integer) TO authenticated;