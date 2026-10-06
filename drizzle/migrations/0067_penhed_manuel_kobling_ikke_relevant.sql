CREATE TABLE public.penhed_handling_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  p_nummer text NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  handling text NOT NULL CHECK (handling IN ('kobl','fjern_kobling','ikke_relevant','fortryd_ikke_relevant')),
  begrundelse text,
  udfoert_af uuid NOT NULL DEFAULT auth.uid(),
  udfoert_dato timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.penhed_handling_log TO authenticated;
GRANT ALL ON public.penhed_handling_log TO service_role;
ALTER TABLE public.penhed_handling_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Laes P-enhed log" ON public.penhed_handling_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Skriv P-enhed log" ON public.penhed_handling_log FOR INSERT TO authenticated WITH CHECK (udfoert_af = auth.uid());
CREATE INDEX penhed_handling_log_p_idx ON public.penhed_handling_log (p_nummer);

ALTER TABLE public.penhed_ikke_relevant DROP CONSTRAINT penhed_ikke_relevant_aarsag_check;
ALTER TABLE public.penhed_ikke_relevant ADD CONSTRAINT penhed_ikke_relevant_aarsag_check
  CHECK (aarsag = ANY (ARRAY['kantine_anden_kunde','centralt_indkoeb','frivillig_ingen_ansatte','andet','uden_aarsag']));

DROP POLICY "Opret ikke relevante" ON public.penhed_ikke_relevant;
DROP POLICY "Ret ikke relevante" ON public.penhed_ikke_relevant;
DROP POLICY "Slet ikke relevante" ON public.penhed_ikke_relevant;
CREATE POLICY "Opret ikke relevante" ON public.penhed_ikke_relevant FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Ret ikke relevante" ON public.penhed_ikke_relevant FOR UPDATE TO authenticated USING (true) WITH CHECK (created_by = auth.uid());
CREATE POLICY "Slet ikke relevante" ON public.penhed_ikke_relevant FOR DELETE TO authenticated USING (true);