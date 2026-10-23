ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS forbrug_pr_maaned numeric,
  ADD COLUMN IF NOT EXISTS faste_pr_maaned numeric;

CREATE OR REPLACE FUNCTION public._quote_sendt_til_salgsmulighed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sendt' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sendt') THEN
    UPDATE public.sales_opportunities
    SET quote_id = NEW.id, status_v2 = 'tilbud_sendt', estimated_value = NEW.estimated_value, updated_at = now()
    WHERE company_id = NEW.company_id
      AND ((status_v2 = 'moede_booket' AND quote_id IS NULL) OR status_v2 = 'tilbud_sendt');
  END IF;
  RETURN NEW;
END;
$$;

CREATE POLICY "Se tilbuds-PDF" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quote-documents' AND NOT (SELECT public.er_telemarketing())
  AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.pdf_path = storage.objects.name
              AND public.can_view_company(auth.uid(), q.company_id)));

CREATE POLICY "Upload tilbuds-PDF" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quote-documents' AND NOT (SELECT public.er_telemarketing())
  AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  AND (public.can_access_company(auth.uid(), ((storage.foldername(name))[1])::uuid) OR public.is_admin(auth.uid())));

CREATE POLICY "Admin sletter tilbuds-PDF" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quote-documents' AND (public.is_admin(auth.uid()) OR owner = auth.uid()));