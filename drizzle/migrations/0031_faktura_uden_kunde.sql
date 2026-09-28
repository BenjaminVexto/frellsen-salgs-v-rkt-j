CREATE OR REPLACE FUNCTION public.faktura_uden_kunde()
RETURNS TABLE (antal bigint, beloeb numeric, seneste_beloeb numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (
    SELECT il.import_batch_id, il.beloeb FROM invoice_lines il
    WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.visma_delivery_no = il.visma_delivery_no
      AND l.afdeling_nr = il.afdeling_nr AND l.company_id IS NOT NULL)
  ), seneste AS (
    SELECT lines_batch_id FROM invoice_import_jobs WHERE status='completed' AND lines_batch_id IS NOT NULL
    ORDER BY coalesce(finished_at, updated_at) DESC LIMIT 1
  )
  SELECT count(*), coalesce(sum(beloeb),0),
    coalesce(sum(beloeb) FILTER (WHERE import_batch_id = (SELECT lines_batch_id FROM seneste)),0)
  FROM u WHERE public.has_role(auth.uid(),'admin')
$$;
GRANT EXECUTE ON FUNCTION public.faktura_uden_kunde() TO authenticated;

CREATE OR REPLACE FUNCTION public.faktura_uden_kunde_linjer()
RETURNS TABLE (visma_delivery_no text, afdeling_nr integer, kunde_navn text, faktura_dato date, beloeb numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT il.visma_delivery_no, il.afdeling_nr, il.kunde_navn, il.faktura_dato, il.beloeb FROM invoice_lines il
  WHERE public.has_role(auth.uid(),'admin')
    AND NOT EXISTS (SELECT 1 FROM locations l WHERE l.visma_delivery_no = il.visma_delivery_no
      AND l.afdeling_nr = il.afdeling_nr AND l.company_id IS NOT NULL)
  ORDER BY il.faktura_dato DESC, il.visma_delivery_no
  LIMIT 5000
$$;
GRANT EXECUTE ON FUNCTION public.faktura_uden_kunde_linjer() TO authenticated;