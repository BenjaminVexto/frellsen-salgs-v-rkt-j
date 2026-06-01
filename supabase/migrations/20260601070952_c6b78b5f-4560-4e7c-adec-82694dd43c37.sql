CREATE TABLE public.location_equipment_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  source text NOT NULL,
  is_filter boolean NOT NULL DEFAULT false,
  machine_type text,
  serial_no text,
  sub_location text,
  agreement_type text,
  is_free_loan boolean NOT NULL DEFAULT false,
  has_service_contract boolean NOT NULL DEFAULT false,
  varenr text,
  import_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_location_equipment_units_location ON public.location_equipment_units(location_id);
CREATE INDEX idx_location_equipment_units_filter ON public.location_equipment_units(location_id, is_filter);

GRANT SELECT ON public.location_equipment_units TO authenticated;
GRANT ALL ON public.location_equipment_units TO service_role;

ALTER TABLE public.location_equipment_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alle ser equipment-enheder"
ON public.location_equipment_units FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin sletter equipment-enheder"
ON public.location_equipment_units FOR DELETE TO authenticated USING (is_admin(auth.uid()));