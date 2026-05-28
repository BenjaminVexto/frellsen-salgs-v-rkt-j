ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS equipment_frellsen_owned    integer  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equipment_coffee_machines   integer  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equipment_filters           integer  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equipment_cooling           integer  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equipment_service_contracts integer  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_lease_agreement         boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_free_loan               boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS agreement_types             text,
  ADD COLUMN IF NOT EXISTS equipment_summary           text,
  ADD COLUMN IF NOT EXISTS sales_signal                text,
  ADD COLUMN IF NOT EXISTS equipment_updated_at        timestamptz;