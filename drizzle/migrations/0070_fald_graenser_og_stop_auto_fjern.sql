CREATE TABLE public.fald_indstilling (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  min_fald_pct numeric NOT NULL DEFAULT 20,
  min_fald_kr numeric NOT NULL DEFAULT 5000,
  opdateret_af uuid,
  opdateret_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.fald_indstilling (id) VALUES (true);
GRANT SELECT, INSERT, UPDATE ON public.fald_indstilling TO authenticated;
GRANT ALL ON public.fald_indstilling TO service_role;
ALTER TABLE public.fald_indstilling ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle læser faldgrænser" ON public.fald_indstilling FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin retter faldgrænser" ON public.fald_indstilling FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.kunde_stop ADD COLUMN IF NOT EXISTS fjernet_aarsag text;

CREATE OR REPLACE FUNCTION public._kunde_stop_auto_fjern_rows()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.kunde_stop s
     SET fjernet_at = now(), fjernet_af = NULL,
         fjernet_aarsag = 'Fjernet automatisk – kunden har købt igen'
   WHERE s.fjernet_at IS NULL
     AND EXISTS (
       SELECT 1 FROM nye n
        WHERE n.company_id = s.company_id
          AND (s.location_id IS NULL OR n.location_id = s.location_id)
          AND coalesce(n.revenue, 0) > 0
          AND public.is_consumable_group(n.product_group_1)
          AND coalesce(n.last_invoice_date, n.period) > (s.oprettet_at AT TIME ZONE 'Europe/Copenhagen')::date);
  RETURN NULL;
END $$;

CREATE TRIGGER trg_kunde_stop_auto_fjern_ins AFTER INSERT ON public.sales_monthly
  REFERENCING NEW TABLE AS nye FOR EACH STATEMENT EXECUTE FUNCTION public._kunde_stop_auto_fjern_rows();
CREATE TRIGGER trg_kunde_stop_auto_fjern_upd AFTER UPDATE ON public.sales_monthly
  REFERENCING NEW TABLE AS nye FOR EACH STATEMENT EXECUTE FUNCTION public._kunde_stop_auto_fjern_rows();