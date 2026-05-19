
-- locations
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  visma_delivery_no text,
  address text,
  zip text,
  city text,
  phone text,
  email text,
  contact_person text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_locations_company_id ON public.locations(company_id);
CREATE INDEX idx_locations_city ON public.locations(city);
CREATE UNIQUE INDEX idx_locations_company_delivery_no
  ON public.locations(company_id, visma_delivery_no)
  WHERE visma_delivery_no IS NOT NULL;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alle ser lokationer"
  ON public.locations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Alle opretter lokationer"
  ON public.locations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Alle opdaterer lokationer"
  ON public.locations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin sletter lokationer"
  ON public.locations FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- activities.location_id
ALTER TABLE public.activities
  ADD COLUMN location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;
CREATE INDEX idx_activities_location_id ON public.activities(location_id);

-- contact_list_assignments.location_id
ALTER TABLE public.contact_list_assignments
  ADD COLUMN location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;
CREATE INDEX idx_assignments_location_id ON public.contact_list_assignments(location_id);
