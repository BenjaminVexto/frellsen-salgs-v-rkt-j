ALTER TABLE public.machine_enrichment
  ADD COLUMN IF NOT EXISTS kobt_dato date,
  ADD COLUMN IF NOT EXISTS lease_leje_dato date,
  ADD COLUMN IF NOT EXISTS aftale_type text;

ALTER TABLE public.location_equipment_units
  ADD COLUMN IF NOT EXISTS udstyr_type text NOT NULL DEFAULT 'ukendt';

ALTER TABLE public.location_equipment_units
  DROP CONSTRAINT IF EXISTS location_equipment_units_udstyr_type_check;
ALTER TABLE public.location_equipment_units
  ADD CONSTRAINT location_equipment_units_udstyr_type_check
  CHECK (udstyr_type IN ('leje_ub','leje_binding','kunde_ejet','ukendt'));

CREATE INDEX IF NOT EXISTS idx_leu_udstyr_type ON public.location_equipment_units(udstyr_type);