
CREATE TABLE public.machines (
  id text PRIMARY KEY,
  ordrenr text,
  varenr text,
  beskrivelse text,
  serienr text,
  udlanstype text,
  navn text,
  fak_kundenr text,
  lev_kundenr text,
  kobt_dato date,
  lease_leje_dato date,
  adresselinje2 text,
  aendret_dato date,
  status text,
  taellerstand numeric,
  dup_index integer NOT NULL DEFAULT 0,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX machines_serienr_idx ON public.machines (serienr);
CREATE INDEX machines_lev_kundenr_idx ON public.machines (lev_kundenr);
CREATE INDEX machines_fak_kundenr_idx ON public.machines (fak_kundenr);

GRANT SELECT ON public.machines TO authenticated;
GRANT ALL ON public.machines TO service_role;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read machines" ON public.machines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage machines" ON public.machines FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER machines_touch_updated BEFORE UPDATE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.machine_enrichment (
  serienr text PRIMARY KEY,
  taelleraflaesning date,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.machine_enrichment TO authenticated;
GRANT ALL ON public.machine_enrichment TO service_role;
ALTER TABLE public.machine_enrichment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read machine_enrichment" ON public.machine_enrichment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage machine_enrichment" ON public.machine_enrichment FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER machine_enrichment_touch_updated BEFORE UPDATE ON public.machine_enrichment
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
