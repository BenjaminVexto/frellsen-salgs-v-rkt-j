-- 1. afdeling
CREATE TABLE public.afdeling (
  afdeling_nr int PRIMARY KEY,
  navn text NOT NULL,
  firma_nr int,
  aktiv boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.afdeling TO authenticated;
GRANT ALL ON public.afdeling TO service_role;
ALTER TABLE public.afdeling ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle indloggede kan se afdelinger" ON public.afdeling
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin styrer afdelinger" ON public.afdeling
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.afdeling (afdeling_nr, navn, firma_nr) VALUES
  (11, 'Frellsen Kaffe', 10),
  (21, 'Høyberg Kaffe', 20),
  (22, 'Java Brænderiet', 20);

-- 2. user_afdeling_access
CREATE TABLE public.user_afdeling_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  afdeling_nr int NOT NULL REFERENCES public.afdeling(afdeling_nr),
  PRIMARY KEY (user_id, afdeling_nr)
);
GRANT SELECT ON public.user_afdeling_access TO authenticated;
GRANT ALL ON public.user_afdeling_access TO service_role;
ALTER TABLE public.user_afdeling_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bruger ser egen afdelingsadgang" ON public.user_afdeling_access
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Admin styrer afdelingsadgang" ON public.user_afdeling_access
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.user_afdeling_access (user_id, afdeling_nr)
SELECT u.id, 11 FROM auth.users u
ON CONFLICT DO NOTHING;

-- 3. profiles.primary_afdeling_nr (uafhængig af region)
ALTER TABLE public.profiles
  ADD COLUMN primary_afdeling_nr int REFERENCES public.afdeling(afdeling_nr);
UPDATE public.profiles SET primary_afdeling_nr = 11;

-- 4. my_afdelinger()
CREATE OR REPLACE FUNCTION public.my_afdelinger()
RETURNS int[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_admin(auth.uid())
      THEN COALESCE((SELECT array_agg(a.afdeling_nr ORDER BY a.afdeling_nr) FROM public.afdeling a), '{}'::int[])
    ELSE COALESCE(
      (SELECT array_agg(x.afdeling_nr ORDER BY x.afdeling_nr)
         FROM public.user_afdeling_access x
        WHERE x.user_id = auth.uid()),
      '{}'::int[])
  END
$$;
GRANT EXECUTE ON FUNCTION public.my_afdelinger() TO authenticated;

-- 5. afdeling_nr på datatabeller + indeks
ALTER TABLE public.companies                ADD COLUMN afdeling_nr int NOT NULL DEFAULT 11 REFERENCES public.afdeling(afdeling_nr);
ALTER TABLE public.locations                ADD COLUMN afdeling_nr int NOT NULL DEFAULT 11 REFERENCES public.afdeling(afdeling_nr);
ALTER TABLE public.sales_monthly            ADD COLUMN afdeling_nr int NOT NULL DEFAULT 11 REFERENCES public.afdeling(afdeling_nr);
ALTER TABLE public.sales_monthly_products   ADD COLUMN afdeling_nr int NOT NULL DEFAULT 11 REFERENCES public.afdeling(afdeling_nr);
ALTER TABLE public.sales_top_products       ADD COLUMN afdeling_nr int NOT NULL DEFAULT 11 REFERENCES public.afdeling(afdeling_nr);
ALTER TABLE public.activities               ADD COLUMN afdeling_nr int NOT NULL DEFAULT 11 REFERENCES public.afdeling(afdeling_nr);
ALTER TABLE public.machines                 ADD COLUMN afdeling_nr int NOT NULL DEFAULT 11 REFERENCES public.afdeling(afdeling_nr);
ALTER TABLE public.machine_enrichment       ADD COLUMN afdeling_nr int NOT NULL DEFAULT 11 REFERENCES public.afdeling(afdeling_nr);
ALTER TABLE public.machine_agreement_status ADD COLUMN afdeling_nr int NOT NULL DEFAULT 11 REFERENCES public.afdeling(afdeling_nr);
ALTER TABLE public.agreement_pricing        ADD COLUMN afdeling_nr int NOT NULL DEFAULT 11 REFERENCES public.afdeling(afdeling_nr);
ALTER TABLE public.location_equipment_units ADD COLUMN afdeling_nr int NOT NULL DEFAULT 11 REFERENCES public.afdeling(afdeling_nr);

CREATE INDEX idx_companies_afdeling                ON public.companies (afdeling_nr);
CREATE INDEX idx_locations_afdeling                ON public.locations (afdeling_nr);
CREATE INDEX idx_sales_monthly_afdeling            ON public.sales_monthly (afdeling_nr);
CREATE INDEX idx_sales_monthly_products_afdeling   ON public.sales_monthly_products (afdeling_nr);
CREATE INDEX idx_sales_top_products_afdeling       ON public.sales_top_products (afdeling_nr);
CREATE INDEX idx_activities_afdeling               ON public.activities (afdeling_nr);
CREATE INDEX idx_machines_afdeling                 ON public.machines (afdeling_nr);
CREATE INDEX idx_machine_enrichment_afdeling       ON public.machine_enrichment (afdeling_nr);
CREATE INDEX idx_machine_agreement_status_afdeling ON public.machine_agreement_status (afdeling_nr);
CREATE INDEX idx_agreement_pricing_afdeling        ON public.agreement_pricing (afdeling_nr);
CREATE INDEX idx_location_equipment_units_afdeling ON public.location_equipment_units (afdeling_nr);

-- 6. Nøgleændringer (kun de fem)
ALTER TABLE public.companies DROP CONSTRAINT companies_visma_id_unique;
ALTER TABLE public.companies ADD CONSTRAINT companies_visma_id_unique UNIQUE (afdeling_nr, visma_id);

DROP INDEX public.companies_name_kundenr_unique;
CREATE UNIQUE INDEX companies_name_kundenr_unique
  ON public.companies (afdeling_nr, lower(name), visma_id)
  WHERE (visma_id IS NOT NULL AND visma_id <> '');

ALTER TABLE public.sales_monthly DROP CONSTRAINT sales_monthly_unique;
ALTER TABLE public.sales_monthly ADD CONSTRAINT sales_monthly_unique
  UNIQUE (afdeling_nr, visma_delivery_no, period, product_group_1);

ALTER TABLE public.sales_monthly_products DROP CONSTRAINT sales_monthly_products_unique;
ALTER TABLE public.sales_monthly_products ADD CONSTRAINT sales_monthly_products_unique
  UNIQUE (afdeling_nr, visma_delivery_no, period, varenr);

ALTER TABLE public.sales_top_products DROP CONSTRAINT sales_top_products_unique;
ALTER TABLE public.sales_top_products ADD CONSTRAINT sales_top_products_unique
  UNIQUE (afdeling_nr, visma_delivery_no, varenr);