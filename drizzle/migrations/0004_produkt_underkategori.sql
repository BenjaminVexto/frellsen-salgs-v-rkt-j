CREATE TABLE public.produkt_underkategori (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hovedkategori text NOT NULL CHECK (hovedkategori IN ('kaffe','te','maskiner')),
  product_group_1 text NOT NULL,
  produktprisgruppe_2 text,
  label text NOT NULL,
  sort integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX produkt_underkategori_unik
  ON public.produkt_underkategori (product_group_1, COALESCE(produktprisgruppe_2, '*'));

GRANT SELECT ON public.produkt_underkategori TO authenticated;
GRANT ALL ON public.produkt_underkategori TO service_role;

ALTER TABLE public.produkt_underkategori ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alle autentificerede kan laese underkategorier"
  ON public.produkt_underkategori FOR SELECT TO authenticated USING (true);

CREATE POLICY "kun admin kan skrive underkategorier"
  ON public.produkt_underkategori FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.produkt_underkategori (hovedkategori, product_group_1, produktprisgruppe_2, label, sort) VALUES
  ('kaffe','2','8','Hele bønner',1),
  ('kaffe','2','15','Hele bønner',1),
  ('kaffe','2','2','Formalet',2),
  ('kaffe','2','4','Formalet',2),
  ('kaffe','2','12','Instant & kapsler',3),
  ('kaffe','2','14','Instant & kapsler',3),
  ('te','4','22','Breve',1),
  ('te','4','24','Løs te',2),
  ('maskiner','16','80','Leje',1),
  ('maskiner','16','78','Køb',2),
  ('maskiner','16','82','Serviceaftaler',3),
  ('maskiner','16','83','Service & tilbehør',4),
  ('maskiner','16','79','Service & tilbehør',4),
  ('maskiner','16','85','Service & tilbehør',4),
  ('maskiner','16','50','Service & tilbehør',4),
  ('maskiner','16','88','Service & tilbehør',4),
  ('maskiner','16','81','Service & tilbehør',4),
  ('maskiner','17',NULL,'Service & tilbehør',4),
  ('maskiner','18',NULL,'Service & tilbehør',4);