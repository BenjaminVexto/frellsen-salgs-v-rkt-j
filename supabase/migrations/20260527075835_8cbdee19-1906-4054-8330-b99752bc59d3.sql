CREATE TABLE IF NOT EXISTS public.company_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  briefing_text text NOT NULL,
  generated_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_briefings TO authenticated;
GRANT ALL ON public.company_briefings TO service_role;

ALTER TABLE public.company_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alle kan læse og skrive briefings"
  ON public.company_briefings FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);