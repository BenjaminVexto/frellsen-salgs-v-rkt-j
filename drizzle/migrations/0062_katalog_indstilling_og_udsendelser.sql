CREATE TABLE public.katalog_indstilling (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  katalog_url text NOT NULL,
  forside_billede_url text,
  opdateret_af uuid REFERENCES public.profiles(id),
  opdateret_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.katalog_indstilling TO authenticated;
GRANT ALL ON public.katalog_indstilling TO service_role;
ALTER TABLE public.katalog_indstilling ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Alle læser katalogindstilling" ON public.katalog_indstilling FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin opretter katalogindstilling" ON public.katalog_indstilling FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admin retter katalogindstilling" ON public.katalog_indstilling FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TABLE public.katalog_udsendelser (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  modtager_email text NOT NULL,
  modtager_navn text,
  katalog_url text NOT NULL,
  sendt_af uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'afventer_mailopsaetning',
  created_at timestamptz NOT NULL DEFAULT now(),
  sendt_at timestamptz
);
GRANT SELECT, INSERT ON public.katalog_udsendelser TO authenticated;
GRANT ALL ON public.katalog_udsendelser TO service_role;
ALTER TABLE public.katalog_udsendelser ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Opret egne katalogudsendelser" ON public.katalog_udsendelser FOR INSERT TO authenticated
  WITH CHECK (sendt_af = auth.uid() AND public.can_view_company(auth.uid(), company_id));
CREATE POLICY "Se katalogudsendelser" ON public.katalog_udsendelser FOR SELECT TO authenticated
  USING (public.can_view_company(auth.uid(), company_id));