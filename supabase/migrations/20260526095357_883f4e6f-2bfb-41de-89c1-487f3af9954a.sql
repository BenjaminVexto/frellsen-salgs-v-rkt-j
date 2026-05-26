
CREATE TABLE IF NOT EXISTS public.competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  notes text NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.competitor_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  competitor_id uuid NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  contract_expires_at date NULL,
  notes text NULL,
  registered_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, competitor_id)
);

CREATE INDEX IF NOT EXISTS idx_competitor_assignments_company ON public.competitor_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_competitor_assignments_competitor ON public.competitor_assignments(competitor_id);
CREATE INDEX IF NOT EXISTS idx_competitor_assignments_expires ON public.competitor_assignments(contract_expires_at);

ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alle kan læse konkurrenter"
  ON public.competitors FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin og salgssupport kan skrive konkurrenter"
  ON public.competitors FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'salgssupport'::app_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'salgssupport'::app_role)
    )
  );

CREATE POLICY "Alle kan læse og skrive konkurrentaftaler"
  ON public.competitor_assignments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER competitor_assignments_touch_updated_at
  BEFORE UPDATE ON public.competitor_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
