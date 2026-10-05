ALTER TABLE public.invoice_import_jobs ADD COLUMN IF NOT EXISTS berorte_maaneder jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.invoice_import_jobs.berorte_maaneder IS 'Liste over (afdeling_nr, maaned, fra, til, linjer) som filen indeholder. Kun disse ryddes og genberegnes.';
COMMENT ON COLUMN public.invoice_lines.kunde_navn IS 'DEPRECATED: NULL for nye linjer. Kundenavn hentes fra Aktør via locations/companies.';
COMMENT ON COLUMN public.invoice_lines.kundeprisgruppe_1 IS 'DEPRECATED: NULL for nye linjer. Hentes fra Aktør (companies).';
COMMENT ON COLUMN public.invoice_lines.kundeprisgruppe_2 IS 'DEPRECATED: NULL for nye linjer. Hentes fra Aktør (companies).';

CREATE OR REPLACE FUNCTION public.faktura_uden_kunde_linjer()
 RETURNS TABLE(visma_delivery_no text, afdeling_nr integer, kunde_navn text, faktura_dato date, beloeb numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT il.visma_delivery_no, il.afdeling_nr,
    COALESCE(
      (SELECT c.name FROM locations l JOIN companies c ON c.id = l.company_id
        WHERE l.visma_delivery_no = il.visma_delivery_no AND l.afdeling_nr = il.afdeling_nr LIMIT 1),
      il.kunde_navn),
    il.faktura_dato, il.beloeb FROM invoice_lines il
  WHERE public.has_role(auth.uid(),'admin')
    AND NOT EXISTS (SELECT 1 FROM locations l WHERE l.visma_delivery_no = il.visma_delivery_no
      AND l.afdeling_nr = il.afdeling_nr AND l.company_id IS NOT NULL)
  ORDER BY il.faktura_dato DESC, il.visma_delivery_no
  LIMIT 5000
$function$;

CREATE OR REPLACE FUNCTION public.salg_uden_kunde_liste(_afd integer DEFAULT NULL::integer)
 RETURNS TABLE(visma_delivery_no text, afdeling_nr integer, kunde_navn text, foerste date, seneste date, beloeb numeric, findes_som_kunde boolean, kunde_navn_crm text, kunde_afdeling integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH u AS (
    SELECT sm.visma_delivery_no, sm.afdeling_nr, min(sm.period) foerste, max(sm.period) seneste,
      coalesce(sum(sm.revenue) FILTER (WHERE sm.revenue > 0), 0) beloeb
    FROM sales_monthly sm
    WHERE sm.company_id IS NULL AND (_afd IS NULL OR sm.afdeling_nr = _afd)
    GROUP BY 1, 2
  )
  SELECT u.visma_delivery_no, u.afdeling_nr,
    COALESCE(
      (SELECT c2.name FROM locations l JOIN companies c2 ON c2.id = l.company_id
        WHERE l.visma_delivery_no = u.visma_delivery_no AND l.afdeling_nr = u.afdeling_nr LIMIT 1),
      (SELECT il.kunde_navn FROM invoice_lines il WHERE il.visma_delivery_no = u.visma_delivery_no AND il.kunde_navn IS NOT NULL ORDER BY il.faktura_dato DESC LIMIT 1)),
    u.foerste, u.seneste, u.beloeb, c.id IS NOT NULL, c.name, c.afdeling_nr
  FROM u
  LEFT JOIN LATERAL (SELECT c.id, c.name, c.afdeling_nr FROM companies c
    WHERE c.visma_id = u.visma_delivery_no OR c.visma_delivery_id = u.visma_delivery_no
    ORDER BY (c.afdeling_nr = u.afdeling_nr) DESC LIMIT 1) c ON true
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY u.beloeb DESC
$function$;