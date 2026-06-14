CREATE TABLE public.agreement_pricing (
  id text PRIMARY KEY,
  kundeprisgruppe2 text,
  produktprisgruppe1 text,
  produktprisgruppe2 text,
  produktprisgruppe3 text,
  varenr text,
  beskrivelse text,
  rab_kr numeric,
  rab_pct numeric,
  udsalgspris numeric,
  udlejningspris numeric,
  kampagne text,
  kommentar text,
  fra_dato date,
  til_dato date,
  rabat_kategori text,
  record_status text NOT NULL DEFAULT 'aktiv',
  last_seen_import timestamptz,
  udgaaet_dato timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agreement_pricing TO authenticated;
GRANT ALL ON public.agreement_pricing TO service_role;

ALTER TABLE public.agreement_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pricing" ON public.agreement_pricing
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage pricing" ON public.agreement_pricing
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX agreement_pricing_kundeprisgruppe2_idx ON public.agreement_pricing(kundeprisgruppe2);
CREATE INDEX agreement_pricing_varenr_idx ON public.agreement_pricing(varenr);
CREATE INDEX agreement_pricing_rabat_kategori_idx ON public.agreement_pricing(rabat_kategori);
CREATE INDEX agreement_pricing_record_status_idx ON public.agreement_pricing(record_status);

CREATE TRIGGER agreement_pricing_touch_updated_at
  BEFORE UPDATE ON public.agreement_pricing
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();