CREATE TABLE public.afdeling_alias (
  kilde_afdeling_nr integer PRIMARY KEY,
  afdeling_nr integer NOT NULL REFERENCES public.afdeling(afdeling_nr)
);

GRANT SELECT ON public.afdeling_alias TO authenticated;
GRANT ALL ON public.afdeling_alias TO service_role;

ALTER TABLE public.afdeling_alias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "afdeling_alias_select_authenticated"
ON public.afdeling_alias FOR SELECT TO authenticated USING (true);

CREATE POLICY "afdeling_alias_admin_all"
ON public.afdeling_alias FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.afdeling_alias (kilde_afdeling_nr, afdeling_nr) VALUES
  (11,11),(21,21),(22,22),(13,11),(23,21)
ON CONFLICT (kilde_afdeling_nr) DO NOTHING;