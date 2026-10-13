CREATE TABLE public.cvr_direktoer_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_ids uuid[] NOT NULL,
  naeste integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'koerer' CHECK (status IN ('koerer','faerdig','fejl','annulleret')),
  fundet integer NOT NULL DEFAULT 0,
  oprettet integer NOT NULL DEFAULT 0,
  beskrivelse text,
  fejl text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  opdateret_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cvr_direktoer_job TO authenticated;
GRANT ALL ON public.cvr_direktoer_job TO service_role;
ALTER TABLE public.cvr_direktoer_job ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin styrer cvr_direktoer_job" ON public.cvr_direktoer_job FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY tm_spaerret ON public.cvr_direktoer_job AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));