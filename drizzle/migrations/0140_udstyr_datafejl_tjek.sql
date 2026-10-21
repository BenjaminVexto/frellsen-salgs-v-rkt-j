CREATE TABLE public.udstyr_datafejl_tjek (
  type text NOT NULL,
  noegle text NOT NULL,
  kommentar text,
  tjekket_af uuid NOT NULL DEFAULT auth.uid(),
  tjekket_af_navn text,
  tjekket_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (type, noegle)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.udstyr_datafejl_tjek TO authenticated;
GRANT ALL ON public.udstyr_datafejl_tjek TO service_role;
ALTER TABLE public.udstyr_datafejl_tjek ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_alt ON public.udstyr_datafejl_tjek FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY tm_spaerret ON public.udstyr_datafejl_tjek AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));